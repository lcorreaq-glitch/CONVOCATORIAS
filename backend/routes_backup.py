"""KRINOS — Backup de base de datos.

Funcionalidad:
- `POST /api/admin/backup/run-now`: ejecuta un backup AHORA y lo envía por email
  (o devuelve el ZIP para descarga, según el flag `download`).
- `GET /api/admin/backup/config` / `PATCH`: configuración persistente:
  - enabled (bool)
  - recipient (email destinatario)
  - hour (0-23, hora local UTC del envío)
  - last_run, last_status (read-only)
- Tarea de fondo (`start_backup_scheduler`): se inicia en startup. Cada 5 min revisa si
  llegó la hora configurada y dispara el backup automático.

El archivo de backup es un ZIP con un JSON por colección + un `manifest.json` con
versión, fecha y conteo de documentos.
"""
import asyncio
import io
import json
import logging
import zipfile
from datetime import datetime, timezone, timedelta
from typing import Optional

from bson import json_util
from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field

from auth import require_roles, audit
from db import get_db, now_iso

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin/backup", tags=["backup"])

CONFIG_DOC_ID = "global"
BACKUP_VERSION = "1.0"


# ---------------------------------------------------------------------------
# Generación del ZIP
# ---------------------------------------------------------------------------
async def _build_backup_zip() -> tuple[bytes, dict]:
    """Genera el ZIP en memoria con todas las colecciones. Devuelve (bytes, meta)."""
    db = get_db()
    colecciones = await db.list_collection_names()
    counts = {}
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for col in sorted(colecciones):
            try:
                # Mongo cursor → lista. Para colecciones muy grandes esto carga en RAM,
                # pero para una convocatoria típica (<10k docs/colección) es manejable.
                docs = await db[col].find({}, {"_id": 0}).to_list(100000)
                counts[col] = len(docs)
                # json_util maneja ObjectId, datetime, etc.
                zf.writestr(f"{col}.json", json_util.dumps(docs, ensure_ascii=False, indent=2))
            except Exception as e:
                logger.exception(f"Error exportando colección {col}")
                counts[col] = -1
                zf.writestr(f"{col}.ERROR.txt", f"Error: {e}")
        manifest = {
            "version": BACKUP_VERSION,
            "fecha": now_iso(),
            "colecciones": counts,
            "total_documentos": sum(c for c in counts.values() if c > 0),
        }
        zf.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))
    buf.seek(0)
    return buf.read(), manifest


async def _send_backup_email(recipient: str, zip_bytes: bytes, manifest: dict) -> dict:
    """Envía el backup por correo usando el servicio actual (Gmail SMTP por defecto)."""
    from email_service import send_email, _layout
    fecha = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M")
    filename = f"krinos_backup_{fecha}.zip"
    size_kb = len(zip_bytes) // 1024
    total_docs = manifest.get("total_documentos", 0)
    col_count = len(manifest.get("colecciones") or {})

    body = f"""
      <h1 style="font-size:20px;font-weight:800;color:#1A1F2C;margin:0 0 6px;">Respaldo diario · KRINOS</h1>
      <p style="margin:0 0 12px;font-size:13.5px;color:#3F4856;">
        Adjunto encontrarás el respaldo completo de la base de datos generado automáticamente.
      </p>
      <table style="margin:14px 0;background:#F0F7F5;border-left:4px solid #14776A;padding:14px 18px;border-radius:6px;font-size:13px;">
        <tr><td><strong>Archivo:</strong> {filename}</td></tr>
        <tr><td><strong>Tamaño:</strong> {size_kb} KB</td></tr>
        <tr><td><strong>Colecciones:</strong> {col_count}</td></tr>
        <tr><td><strong>Total documentos:</strong> {total_docs:,}</td></tr>
        <tr><td><strong>Fecha de generación:</strong> {manifest.get('fecha')}</td></tr>
      </table>
      <p style="font-size:12.5px;color:#3F4856;">
        <strong>Cómo restaurar:</strong> el ZIP contiene un JSON por cada colección. Para recuperar
        usa <code>mongorestore</code> o el endpoint de importación de KRINOS. Te recomendamos
        guardar este archivo en un lugar seguro (Drive, S3, disco cifrado).
      </p>
      <p style="font-size:11.5px;color:#5E6878;margin-top:18px;">
        Si recibes este correo y no esperabas un backup, alguien activó la opción en
        Administración → Sistema → Respaldo automático. Para desactivarlo entra a la plataforma.
      </p>
      <p style="margin-top:18px;font-size:12.5px;color:#1A1F2C;font-weight:600;">— Equipo KRINOS · ELEA Innovación Social</p>
    """
    html = _layout(body, "KRINOS")
    text = (f"Respaldo diario KRINOS\n\nArchivo: {filename}\nTamaño: {size_kb} KB\n"
            f"Colecciones: {col_count}\nDocumentos: {total_docs}\nFecha: {manifest.get('fecha')}\n\n"
            "Guarda el ZIP adjunto en lugar seguro.\n— Equipo KRINOS · ELEA Innovación Social\n")
    return await send_email(
        recipient,
        f"[KRINOS] Respaldo diario · {fecha} · {size_kb} KB",
        html,
        text_body=text,
        attachments=[{
            "filename": filename,
            "content": zip_bytes,
            "mime": "application/zip",
        }],
    )


# ---------------------------------------------------------------------------
# Config (CRUD)
# ---------------------------------------------------------------------------
class BackupConfig(BaseModel):
    enabled: bool = False
    recipient: Optional[EmailStr] = None
    hour: int = Field(default=4, ge=0, le=23, description="Hora UTC (0-23) en la que se ejecuta el backup")


async def _get_config() -> dict:
    db = get_db()
    doc = await db.backup_config.find_one({"id": CONFIG_DOC_ID}, {"_id": 0})
    if not doc:
        doc = {"id": CONFIG_DOC_ID, "enabled": False, "recipient": None,
               "hour": 4, "last_run": None, "last_status": None, "last_size_kb": None}
        await db.backup_config.insert_one(doc)
    return doc


@router.get("/config")
async def get_config(user: dict = Depends(require_roles("admin_general"))):
    return await _get_config()


@router.patch("/config")
async def update_config(payload: BackupConfig,
                        user: dict = Depends(require_roles("admin_general"))):
    db = get_db()
    updates = payload.model_dump()
    await db.backup_config.update_one(
        {"id": CONFIG_DOC_ID},
        {"$set": {**updates, "updated_at": now_iso()}},
        upsert=True,
    )
    await audit(user, "update", "backup_config", CONFIG_DOC_ID,
                detalle=f"enabled={updates['enabled']} hour={updates['hour']} recipient={updates.get('recipient')}")
    return await _get_config()


# ---------------------------------------------------------------------------
# Ejecución manual / descarga
# ---------------------------------------------------------------------------
@router.post("/run-now")
async def backup_run_now(body: dict = Body(default={}),
                          user: dict = Depends(require_roles("admin_general"))):
    """Ejecuta el backup AHORA. Si `download=true` devuelve el ZIP. Si no, lo envía por correo
    al recipient configurado (o al recipient pasado en el body)."""
    download = bool((body or {}).get("download"))
    zip_bytes, manifest = await _build_backup_zip()

    if download:
        fecha = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M")
        filename = f"krinos_backup_{fecha}.zip"
        await audit(user, "backup_download", "system", CONFIG_DOC_ID,
                    detalle=f"size={len(zip_bytes)}b docs={manifest.get('total_documentos')}")
        return StreamingResponse(
            io.BytesIO(zip_bytes),
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # Envío por correo
    cfg = await _get_config()
    recipient = (body or {}).get("recipient") or cfg.get("recipient")
    if not recipient:
        raise HTTPException(status_code=400, detail="No hay recipient configurado. Configúralo en /admin → Respaldo o pásalo en el body.")
    result = await _send_backup_email(recipient, zip_bytes, manifest)
    # Actualizar últimas estadísticas
    db = get_db()
    await db.backup_config.update_one(
        {"id": CONFIG_DOC_ID},
        {"$set": {"last_run": now_iso(),
                  "last_status": "ok" if result.get("ok") else (result.get("reason") or "fail"),
                  "last_size_kb": len(zip_bytes) // 1024,
                  "last_recipient": recipient,
                  "last_message": result.get("message") or result.get("error")}},
        upsert=True,
    )
    await audit(user, "backup_email", "system", CONFIG_DOC_ID,
                detalle=f"to={recipient} ok={result.get('ok')} size_kb={len(zip_bytes)//1024}")
    if not result.get("ok"):
        raise HTTPException(status_code=502, detail=result.get("message") or "Falla al enviar el correo")
    return {"ok": True, "recipient": recipient, "size_kb": len(zip_bytes) // 1024,
            "documentos": manifest.get("total_documentos"), "colecciones": len(manifest.get("colecciones") or {})}


# ---------------------------------------------------------------------------
# Scheduler de fondo (tarea async ligera, sin apscheduler)
# ---------------------------------------------------------------------------
_scheduler_task: Optional[asyncio.Task] = None


async def _scheduler_loop():
    """Loop ligero que cada 5 minutos verifica si hay que disparar el backup.
    Se ejecuta solo si `enabled=true`, hay `recipient` configurado y la última corrida
    NO fue hoy."""
    logger.info("[backup] scheduler iniciado")
    while True:
        try:
            cfg = await _get_config()
            if cfg.get("enabled") and cfg.get("recipient"):
                now = datetime.now(timezone.utc)
                target_hour = int(cfg.get("hour", 4))
                # Ya pasó la hora objetivo y no se ha corrido HOY
                if now.hour >= target_hour:
                    last = cfg.get("last_run")
                    last_dt = None
                    if last:
                        try:
                            last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                        except Exception:
                            last_dt = None
                    already_today = last_dt and last_dt.date() == now.date()
                    if not already_today:
                        logger.info(f"[backup] disparando automático → {cfg['recipient']}")
                        zip_bytes, manifest = await _build_backup_zip()
                        result = await _send_backup_email(cfg["recipient"], zip_bytes, manifest)
                        db = get_db()
                        await db.backup_config.update_one(
                            {"id": CONFIG_DOC_ID},
                            {"$set": {"last_run": now_iso(),
                                      "last_status": "ok" if result.get("ok") else "fail",
                                      "last_size_kb": len(zip_bytes) // 1024,
                                      "last_recipient": cfg["recipient"],
                                      "last_message": result.get("message") or result.get("error"),
                                      "last_run_auto": True}},
                        )
                        logger.info(f"[backup] auto-ejecutado: ok={result.get('ok')}")
        except Exception as e:
            logger.exception(f"[backup] error en loop: {e}")
        # esperar 5 min antes del siguiente chequeo
        await asyncio.sleep(300)


def start_backup_scheduler():
    """Arranca el loop de fondo. Se llama desde el startup de server.py."""
    global _scheduler_task
    if _scheduler_task is None or _scheduler_task.done():
        loop = asyncio.get_event_loop()
        _scheduler_task = loop.create_task(_scheduler_loop())
        logger.info("[backup] scheduler programado")
