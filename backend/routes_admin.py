"""KRINOS - Admin utilities: reset operativo, usuarios de prueba, gestión de credenciales jurados.

Endpoints centrales para:
- Reset operativo de datos (preservando configuración) antes del lanzamiento oficial.
- Seed idempotente de usuarios de prueba por rol.
- Reseteo / consulta de credenciales de jurados para envío por email.
- Seed del catálogo "Estados de Propuesta" para workflow de habilitación documental.
"""
import uuid
import secrets
import string
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from db import get_db, now_iso
from auth import require_roles, hash_password, audit

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# 1. RESET OPERATIVO (preserva config + admin general)
# ---------------------------------------------------------------------------
RESET_COLLECTIONS_DEFAULT = [
    "propuestas",
    "jurados",
    "ternas",
    "asignaciones",
    "evaluaciones_individuales",
    "evaluaciones_colectivas",
    "rankings",
    "actas",
    "auditoria",
]


class ResetPayload(BaseModel):
    convocatoria_id: Optional[str] = None   # si se pasa, filtra colecciones por esa convocatoria
    incluir_usuarios: bool = True           # borra users distintos a admin_general
    incluir_auditoria: bool = True
    confirmacion: str                        # debe venir "REINICIAR"


@router.post("/reset-datos")
async def reset_datos(payload: ResetPayload,
                      user: dict = Depends(require_roles("admin_general"))):
    """Reinicia datos operativos preservando la configuración (convocatorias, campos,
    catálogos, criterios, desempates, plantillas de actas) y el usuario admin_general.

    Si `convocatoria_id` se especifica, solo afecta a datos de esa convocatoria.
    Requiere `confirmacion: "REINICIAR"` para ejecutar.
    """
    if payload.confirmacion != "REINICIAR":
        raise HTTPException(status_code=400,
                            detail="Confirmación requerida (escribe REINICIAR).")
    db = get_db()
    base_filter = {"convocatoria_id": payload.convocatoria_id} if payload.convocatoria_id else {}
    resumen = {}
    for col in RESET_COLLECTIONS_DEFAULT:
        if col == "auditoria" and not payload.incluir_auditoria:
            continue
        flt = {} if col == "auditoria" else base_filter  # auditoría no tiene convocatoria_id
        r = await db[col].delete_many(flt)
        resumen[col] = r.deleted_count

    if payload.incluir_usuarios:
        # Borra todos los users menos admin_general
        r = await db.users.delete_many({"role": {"$ne": "admin_general"}})
        resumen["users (excepto admin_general)"] = r.deleted_count

    await audit(user, "reset", "system", "datos-operativos",
                detalle=f"reset {resumen}, convocatoria={payload.convocatoria_id}")
    return {"ok": True, "resumen": resumen, "preservado": [
        "convocatorias", "campos", "catalogos", "criterios", "desempates",
        "settings", "users (admin_general)"
    ]}


# ---------------------------------------------------------------------------
# 2. USUARIOS DE PRUEBA POR ROL (idempotente)
# ---------------------------------------------------------------------------
TEST_USERS = [
    # (username/email, name, role, password)
    ("admin.conv@krinos.test", "Admin Convocatoria Pruebas", "admin_convocatoria", "Pruebas2026!"),
    ("supervisor@krinos.test", "Supervisor Pruebas", "supervisor", "Pruebas2026!"),
    ("invitado@krinos.test", "Invitado Pruebas", "invitado", "Pruebas2026!"),
    ("auditor@krinos.test", "Auditor Pruebas", "auditor", "Pruebas2026!"),
    ("integrante@krinos.test", "Integrante Terna Pruebas", "integrante_terna", "Pruebas2026!"),
    ("jurado1@krinos.test", "Jurado 1 Pruebas", "jurado", "Pruebas2026!"),
    ("jurado2@krinos.test", "Jurado 2 Pruebas", "jurado", "Pruebas2026!"),
    ("jurado3@krinos.test", "Jurado 3 Pruebas", "jurado", "Pruebas2026!"),
]


@router.post("/seed-test-users")
async def seed_test_users(convocatoria_id: Optional[str] = None,
                          user: dict = Depends(require_roles("admin_general"))):
    """Crea (o reactiva) los usuarios de prueba por rol. 1 por rol + 3 jurados para ternas.
    Idempotente: si ya existen los reactiva y resetea contraseña.
    """
    db = get_db()
    creados, actualizados, credenciales = 0, 0, []
    for email, name, role, password in TEST_USERS:
        existing = await db.users.find_one({"username": email})
        doc_base = {
            "username": email, "email": email, "name": name,
            "password_hash": hash_password(password),
            "role": role, "active": True,
            "convocatoria_roles": [{"convocatoria_id": convocatoria_id, "role": role}] if convocatoria_id else [],
        }
        if existing:
            await db.users.update_one({"id": existing["id"]}, {"$set": doc_base})
            actualizados += 1
        else:
            await db.users.insert_one({**doc_base, "id": str(uuid.uuid4()), "created_at": now_iso()})
            creados += 1
        credenciales.append({"email": email, "password": password, "role": role, "name": name})

    # Si hay convocatoria_id, crea también registros en `jurados` para los 3 jurados de prueba
    # para que se puedan asignar a ternas / evaluaciones.
    if convocatoria_id:
        for email, name, role, _ in TEST_USERS:
            if role != "jurado":
                continue
            existing_j = await db.jurados.find_one({"email": email, "convocatoria_id": convocatoria_id})
            if existing_j:
                continue
            jid = str(uuid.uuid4())
            await db.jurados.insert_one({
                "id": jid, "convocatoria_id": convocatoria_id,
                "nombre": name, "email": email,
                "telefono": "+57 300 000 0000",
                "subregiones": ["Urabá", "Norte", "Oriente"],
                "perfil": "Jurado de pruebas KRINOS",
                "datos": {"cedula": "1099000001"},
                "estado": "Activo",
                "disponibilidad": "Disponible",
                "created_at": now_iso(),
            })
            # vincular user.jurado_id
            await db.users.update_one({"username": email}, {"$set": {"jurado_id": jid}})

    await audit(user, "seed", "users", "test-users",
                detalle=f"creados={creados}, actualizados={actualizados}")
    return {"ok": True, "creados": creados, "actualizados": actualizados,
            "credenciales": credenciales}


# ---------------------------------------------------------------------------
# 3. CREDENCIALES JURADO (consulta + reseteo)
# ---------------------------------------------------------------------------
def _generate_password(length: int = 10) -> str:
    """Genera contraseña temporal legible (sin caracteres ambiguos)."""
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


@router.get("/credenciales-jurado/{jurado_id}")
async def get_credenciales_jurado(jurado_id: str,
                                  user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    """Devuelve username (email) y un flag que indica si el usuario está activo.
    Por seguridad NO devuelve la contraseña (hashed). Se ofrece reset_password para regenerarla.
    """
    db = get_db()
    jur = await db.jurados.find_one({"id": jurado_id}, {"_id": 0})
    if not jur:
        raise HTTPException(status_code=404, detail="Jurado no encontrado")
    u = await db.users.find_one({"username": jur["email"].lower()}, {"_id": 0, "password_hash": 0})
    if not u:
        return {"jurado": jur, "usuario": None,
                "mensaje": "No existe usuario asociado. Usa POST /reset-password para crearlo."}
    return {"jurado": jur, "usuario": u}


class ResetPasswordPayload(BaseModel):
    nueva_password: Optional[str] = None  # si no, se autogenera
    enviar_correo: bool = False
    base_url: Optional[str] = None


@router.post("/credenciales-jurado/{jurado_id}/reset-password")
async def reset_password_jurado(jurado_id: str, payload: ResetPasswordPayload,
                                user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    """Resetea (o crea) el usuario asociado a un jurado y devuelve la nueva contraseña en claro
    (una sola vez, para envío por correo institucional)."""
    db = get_db()
    jur = await db.jurados.find_one({"id": jurado_id}, {"_id": 0})
    if not jur:
        raise HTTPException(status_code=404, detail="Jurado no encontrado")
    nueva = payload.nueva_password or _generate_password(10)
    username = jur["email"].lower()
    existing = await db.users.find_one({"username": username})
    if existing:
        await db.users.update_one({"id": existing["id"]},
                                  {"$set": {"password_hash": hash_password(nueva),
                                            "active": True}})
        target_id = existing["id"]
    else:
        target_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": target_id,
            "username": username, "email": username, "name": jur["nombre"],
            "password_hash": hash_password(nueva), "role": "jurado", "active": True,
            "convocatoria_roles": [{"convocatoria_id": jur["convocatoria_id"], "role": "jurado"}],
            "jurado_id": jur["id"], "created_at": now_iso(),
        })
    await audit(user, "reset_password", "jurados", jurado_id, detalle=f"email={username}")

    # Envío opcional del correo de bienvenida con la nueva contraseña
    email_result = None
    if payload.enviar_correo:
        from email_service import send_email, render_welcome, log_email
        base = payload.base_url or "https://convocatoria-hub-2.emergent.host"
        login_url = f"{base.rstrip('/')}/login"
        branding_doc = await db.system_settings.find_one({"id": "global"}, {"_id": 0}) or {}
        product_name = (branding_doc.get("branding") or {}).get("product_name", "KRINOS")
        html, text = render_welcome(jur["nombre"], username, nueva, login_url, product_name)
        email_result = await send_email(username, f"Bienvenido(a) a {product_name}", html, text_body=text)
        await log_email(username, "Bienvenida (jurado)", "welcome", email_result, user_id=target_id)
        await audit(user, "send_welcome", "jurados", jurado_id,
                    detalle=f"provider={email_result.get('provider','?')} ok={email_result.get('ok')}")

    return {"ok": True, "username": username,
            "password": nueva,
            "jurado": {"id": jur["id"], "nombre": jur["nombre"], "email": jur["email"]},
            "email_result": email_result}


@router.post("/credenciales-jurado/{jurado_id}/send-welcome")
async def send_welcome_jurado(jurado_id: str, body: dict | None = None,
                              user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    """Envía un correo de bienvenida al jurado sin tocar su contraseña. Si quieres incluir
    la contraseña, usa `reset-password` con `enviar_correo: true`.
    """
    from email_service import send_email, render_welcome, log_email
    db = get_db()
    jur = await db.jurados.find_one({"id": jurado_id}, {"_id": 0})
    if not jur:
        raise HTTPException(status_code=404, detail="Jurado no encontrado")
    base = (body or {}).get("base_url") or "https://convocatoria-hub-2.emergent.host"
    login_url = f"{base.rstrip('/')}/login"
    branding_doc = await db.system_settings.find_one({"id": "global"}, {"_id": 0}) or {}
    product_name = (branding_doc.get("branding") or {}).get("product_name", "KRINOS")
    html, text = render_welcome(jur["nombre"], jur["email"].lower(), None, login_url, product_name)
    result = await send_email(jur["email"], f"Bienvenido(a) a {product_name}", html, text_body=text)
    await log_email(jur["email"], "Bienvenida (jurado)", "welcome", result, user_id=None)
    await audit(user, "send_welcome", "jurados", jurado_id,
                detalle=f"provider={result.get('provider','?')} ok={result.get('ok')}")
    if not result.get("ok"):
        return {"ok": False, "mocked": result.get("mocked", False),
                "message": result.get("message") or result.get("error") or "Servicio de correo no configurado."}
    return {"ok": True, "to": jur["email"], "provider": result.get("provider")}


# ---------------------------------------------------------------------------
# 4. CATÁLOGO "Estados de Propuesta" — seed para workflow habilitación documental
# ---------------------------------------------------------------------------
ESTADOS_PROPUESTA_VALORES = [
    "Registrada",
    "En revisión documental",
    "Habilitada",
    "No habilitada",
    "Subsanación pendiente",
    "Subsanada",
    "Asignada",
    "En evaluación individual",
    "En evaluación colectiva",
    "Rankeada",
    "Ganadora",
    "Elegible",
    "Lista de espera",
]


@router.post("/seed-estados-propuesta")
async def seed_estados_propuesta(convocatoria_id: str,
                                 user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    """Crea (idempotente) el catálogo 'Estados de Propuesta' para una convocatoria.
    Permite gestionar el workflow de habilitación documental desde Configuración → Catálogos.
    """
    db = get_db()
    cat = await db.catalogos.find_one({"convocatoria_id": convocatoria_id,
                                       "nombre": "Estados de Propuesta"})
    if cat:
        return {"ok": True, "ya_existia": True, "catalogo_id": cat["id"]}
    cid = str(uuid.uuid4())
    await db.catalogos.insert_one({
        "id": cid, "convocatoria_id": convocatoria_id,
        "nombre": "Estados de Propuesta",
        "descripcion": "Ciclo de vida documental de cada propuesta (habilitación, subsanación, evaluación, ranking).",
        "activo": True, "padre_id": None,
        "valores": [{"id": str(uuid.uuid4()), "valor": v, "activo": True, "padre_valor_id": None}
                    for v in ESTADOS_PROPUESTA_VALORES],
        "created_at": now_iso(),
    })
    await audit(user, "create", "catalogos", cid, detalle="Estados de Propuesta (seed)")
    return {"ok": True, "ya_existia": False, "catalogo_id": cid,
            "valores": ESTADOS_PROPUESTA_VALORES}


# ---------------------------------------------------------------------------
# 5. DELETE EXPLÍCITOS (hard-delete) para Propuestas, Jurados, Evaluaciones, Rankings, Actas
# Reciben permisos solo de admin_general / admin_convocatoria.
# ---------------------------------------------------------------------------
@router.delete("/propuestas/{pid}")
async def delete_propuesta(pid: str,
                           user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    res = await db.propuestas.delete_one({"id": pid})
    # Borrar asignaciones y evaluaciones huérfanas de esta propuesta
    await db.asignaciones.delete_many({"propuesta_id": pid})
    await db.evaluaciones_individuales.delete_many({"propuesta_id": pid})
    await db.evaluaciones_colectivas.delete_many({"propuesta_id": pid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    await audit(user, "delete", "propuestas", pid)
    return {"ok": True}


@router.delete("/jurados/{jid}")
async def delete_jurado(jid: str, eliminar_usuario: bool = True,
                        user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    jur = await db.jurados.find_one({"id": jid})
    if not jur:
        raise HTTPException(status_code=404, detail="Jurado no encontrado")
    await db.jurados.delete_one({"id": jid})
    if eliminar_usuario:
        await db.users.delete_many({"jurado_id": jid})
    # Quitarlo de todas las ternas donde sea integrante
    await db.ternas.update_many(
        {"integrantes.jurado_id": jid},
        {"$pull": {"integrantes": {"jurado_id": jid}}}
    )
    # Cancelar sus asignaciones y evaluaciones
    await db.asignaciones.delete_many({"jurado_id": jid})
    await db.evaluaciones_individuales.delete_many({"jurado_id": jid})
    await audit(user, "delete", "jurados", jid, detalle=f"nombre={jur.get('nombre')}")
    return {"ok": True}


@router.delete("/evaluaciones-individuales/{eid}")
async def delete_evaluacion_individual(eid: str,
                                       user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    r = await db.evaluaciones_individuales.delete_one({"id": eid})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Evaluación no encontrada")
    await audit(user, "delete", "evaluaciones_individuales", eid)
    return {"ok": True}


@router.delete("/evaluaciones-colectivas/{eid}")
async def delete_evaluacion_colectiva(eid: str,
                                      user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    r = await db.evaluaciones_colectivas.delete_one({"id": eid})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Evaluación no encontrada")
    await audit(user, "delete", "evaluaciones_colectivas", eid)
    return {"ok": True}


@router.delete("/rankings/{rid}")
async def delete_ranking(rid: str,
                         user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    r = await db.rankings.delete_one({"id": rid})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ranking no encontrado")
    await audit(user, "delete", "rankings", rid)
    return {"ok": True}
