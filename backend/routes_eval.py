"""KRINOS - Evaluación Individual + Colectiva."""
import uuid
import os
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel, Field

from db import get_db, now_iso
from auth import get_current_user, require_roles, audit

router = APIRouter(prefix="/api", tags=["evaluations"])


async def _apply_priorizacion_automatica(db, payload_puntajes: dict, convocatoria_id: str, propuesta_id: str) -> dict:
    """Aplica automáticamente el puntaje del criterio 'Priorización' cuando la propuesta
    está marcada como priorizada en sus datos. El jurado NO puede modificar este valor.

    Reglas:
      - Si la propuesta tiene `datos.priorizada=true` → puntaje del criterio = `puntaje_max`
      - Si no → 0
      - Se busca el criterio cuyo `nombre_interno` o `nombre` contenga 'prioriz' (case-insensitive)
    """
    propuesta = await db.propuestas.find_one({"id": propuesta_id}, {"_id": 0, "datos": 1})
    es_priorizada = bool(((propuesta or {}).get("datos") or {}).get("priorizada"))
    criterios = await db.criterios.find({"convocatoria_id": convocatoria_id}, {"_id": 0}).to_list(100)
    crit_prior = next((c for c in criterios if "prioriz" in (c.get("nombre_interno") or c.get("nombre") or "").lower()), None)
    if not crit_prior:
        return payload_puntajes  # no hay criterio de priorización, devolver tal cual
    cid = crit_prior["id"]
    nuevo = dict(payload_puntajes or {})
    nuevo[cid] = float(crit_prior.get("puntaje_max", 5)) if es_priorizada else 0
    return nuevo


async def _compute_bono_priorizacion(db, convocatoria_id: str, propuesta_id: str) -> float:
    """DEPRECATED — el bono se aplica ahora sobre el criterio de priorización
    automáticamente vía _apply_priorizacion_automatica. Devuelve 0 para no doble-contar."""
    return 0.0


# ==================== EVALUACIÓN INDIVIDUAL ====================
@router.get("/evaluaciones-individuales")
async def list_eval_individuales(convocatoria_id: Optional[str] = None,
                                 jurado_id: Optional[str] = None,
                                 propuesta_id: Optional[str] = None,
                                 mias: bool = False,
                                 user: dict = Depends(get_current_user)):
    db = get_db()
    q = {}
    if convocatoria_id: q["convocatoria_id"] = convocatoria_id
    if jurado_id: q["jurado_id"] = jurado_id
    if propuesta_id: q["propuesta_id"] = propuesta_id
    if mias:
        # Filtrar por jurado_id del usuario
        jurado = await db.jurados.find_one({"email": user["email"]})
        if not jurado:
            return []
        q["jurado_id"] = jurado["id"]
    items = await db.evaluaciones_individuales.find(q, {"_id": 0}).to_list(5000)
    return items


@router.get("/evaluaciones-individuales/{eid}")
async def get_eval(eid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    item = await db.evaluaciones_individuales.find_one({"id": eid}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Evaluación no encontrada")
    return item


class EvalUpdate(BaseModel):
    puntajes: dict = Field(default_factory=dict)  # {criterio_id: float}
    observaciones: dict = Field(default_factory=dict)  # {criterio_id: str}
    observacion_final: Optional[str] = ""
    finalizar: bool = False


@router.patch("/evaluaciones-individuales/{eid}")
async def save_eval(eid: str, payload: EvalUpdate, user: dict = Depends(get_current_user)):
    db = get_db()
    ev = await db.evaluaciones_individuales.find_one({"id": eid})
    if not ev:
        raise HTTPException(status_code=404, detail="Evaluación no encontrada")
    # Auth: solo el jurado dueño o admin
    is_admin = user["role"] in ("admin_general", "admin_convocatoria")
    if not is_admin:
        jurado = await db.jurados.find_one({"id": ev["jurado_id"]})
        if not jurado or jurado.get("email") != user["email"]:
            raise HTTPException(status_code=403, detail="No autorizado para editar esta evaluación")
    # Estados terminales sin escapatoria
    if ev["estado"] in ("Bloqueada", "Firmada", "Anulada"):
        raise HTTPException(status_code=400, detail=f"Evaluación en estado {ev['estado']} no editable. Una evaluación firmada o bloqueada no puede modificarse.")
    # Jurado: si está Finalizada, no puede editar — debe solicitar reapertura primero.
    if ev["estado"] == "Finalizada" and not is_admin:
        raise HTTPException(
            status_code=403,
            detail="La evaluación está Finalizada. Debes solicitar al administrador la reapertura para poder modificarla.",
        )

    # Validar puntajes contra criterios
    criterios = await db.criterios.find({"convocatoria_id": ev["convocatoria_id"]}, {"_id": 0}).to_list(100)
    crit_map = {c["id"]: c for c in criterios}

    # Aplicar priorización automática: sobrescribe el valor del criterio "Priorización"
    # antes de validar, para que el jurado no pueda alterar el puntaje automático.
    payload.puntajes = await _apply_priorizacion_automatica(db, payload.puntajes, ev["convocatoria_id"], ev["propuesta_id"])

    total_oficial = 0.0
    total_diferencial = 0.0
    for cid, val in payload.puntajes.items():
        if cid not in crit_map: continue
        c = crit_map[cid]
        try:
            v = float(val)
        except (TypeError, ValueError):
            continue
        if v < c["puntaje_min"] or v > c["puntaje_max"]:
            if payload.finalizar:
                raise HTTPException(status_code=400, detail=f"Puntaje de '{c['nombre']}' fuera de rango ({c['puntaje_min']}-{c['puntaje_max']})")
        if c.get("oficial", True):
            total_oficial += v
        else:
            total_diferencial += v

    updates = {
        "puntajes": payload.puntajes,
        "observaciones": payload.observaciones,
        "observacion_final": payload.observacion_final or "",
        "puntaje_criterios": round(total_oficial, 2),
        "puntaje_diferencial_total": round(total_diferencial, 2),
        "fecha_ultima_edicion": now_iso(),
    }

    # Bono automático por priorización territorial (PDET / Sentencia Río Atrato / Río Cauca)
    # Reglas (configurables en convocatoria.configuracion.bono_priorizacion):
    #   - puntos: cuántos puntos sumar (default 5)
    #   - campo_propuesta: nombre del campo booleano en propuesta.datos (default "priorizada")
    bono_aplicado = await _compute_bono_priorizacion(db, ev["convocatoria_id"], ev["propuesta_id"])
    updates["bono_priorizacion"] = bono_aplicado
    updates["puntaje_total"] = round(total_oficial + bono_aplicado, 2)

    if ev["estado"] == "Borrador":
        updates["estado"] = "En edición"
        updates["fecha_inicio"] = ev.get("fecha_inicio") or now_iso()

    if payload.finalizar:
        # Validar criterios obligatorios
        for c in criterios:
            if c.get("obligatorio") and c["id"] not in payload.puntajes:
                raise HTTPException(status_code=400, detail=f"Falta puntaje obligatorio en '{c['nombre']}'")
        # Validar observaciones por criterio obligatorias
        for c in criterios:
            if c.get("observacion_obligatoria"):
                obs = (payload.observaciones or {}).get(c["id"], "")
                if not obs or not str(obs).strip():
                    raise HTTPException(
                        status_code=400,
                        detail=f"La observación de '{c['nombre']}' es obligatoria. Sustenta tu puntaje antes de finalizar.",
                    )
        # Validar observación final si la convocatoria la marca obligatoria (default True)
        conv = await db.convocatorias.find_one({"id": ev["convocatoria_id"]}, {"_id": 0, "observacion_final_obligatoria": 1})
        if (conv or {}).get("observacion_final_obligatoria", True):
            if not payload.observacion_final or not str(payload.observacion_final).strip():
                raise HTTPException(
                    status_code=400,
                    detail="La observación final / conclusiones es obligatoria. Escribe una síntesis antes de finalizar.",
                )
        updates["estado"] = "Finalizada"
        updates["fecha_finalizacion"] = now_iso()

    await db.evaluaciones_individuales.update_one({"id": eid}, {"$set": updates})
    await audit(user, "save", "evaluaciones_individuales", eid,
                valor_nuevo={"estado": updates.get("estado"), "puntaje_total": updates["puntaje_total"]})

    # ────────────────────────────────────────────────────────────────────
    # TRIGGER: Si esta es la última evaluación individual pendiente del jurado,
    # enviarle un correo invitándolo a firmar su acta consolidada (idempotente).
    # ────────────────────────────────────────────────────────────────────
    if payload.finalizar:
        try:
            await _maybe_notify_evaluaciones_completas(db, ev)
        except Exception as ex:
            # No fallar la operación principal por un error de correo
            import logging
            logging.getLogger("krinos").warning(f"Email notif evaluaciones completas falló: {ex}")
        # Auto-generar colectivas (en estado "Pendiente") cuando la terna completa todas las individuales de la propuesta
        try:
            await _auto_generate_colectivas_after_finalizar(db, ev)
        except Exception as ex:
            import logging
            logging.getLogger("krinos").warning(f"Auto-gen colectivas falló: {ex}")

    out = await db.evaluaciones_individuales.find_one({"id": eid}, {"_id": 0})
    return out


async def _maybe_notify_evaluaciones_completas(db, ev: dict):
    """Envía correo al jurado cuando ha finalizado TODAS sus evaluaciones individuales
    de la convocatoria. Idempotente: registra `datos.email_acta_listo_at` en el jurado.
    """
    jurado_id = ev.get("jurado_id")
    convocatoria_id = ev.get("convocatoria_id")
    if not jurado_id or not convocatoria_id:
        return
    jur = await db.jurados.find_one({"id": jurado_id})
    if not jur:
        return
    # Verificar si ya se envió antes
    datos = jur.get("datos") or {}
    if datos.get("email_acta_listo_at"):
        return
    # Contar pendientes vs totales (solo individuales, no colectivas)
    total = await db.evaluaciones_individuales.count_documents({
        "convocatoria_id": convocatoria_id, "jurado_id": jurado_id, "etapa": {"$ne": "colectiva"},
    })
    if total == 0:
        return
    pendientes = await db.evaluaciones_individuales.count_documents({
        "convocatoria_id": convocatoria_id, "jurado_id": jurado_id, "etapa": {"$ne": "colectiva"},
        "estado": {"$nin": ["Finalizada", "Firmada"]},
    })
    if pendientes > 0:
        return  # aún quedan pendientes
    # Enviar correo
    from email_service import send_email, render_evals_completas, log_email
    settings_doc = await db.system_settings.find_one({"id": "global"}, {"_id": 0}) or {}
    product_name = (settings_doc.get("branding") or {}).get("product_name", "KRINOS")
    base_url = (settings_doc.get("branding") or {}).get("public_url") or \
               os.environ.get("PUBLIC_FRONTEND_URL", "https://convocatoria-hub-2.emergent.host")
    actas_url = f"{base_url.rstrip('/')}/actas"
    html, text = render_evals_completas(jur.get("nombre", "Jurado"), total, actas_url, product_name)
    result = await send_email(jur["email"], f"¡Evaluaciones completas! Firma tu acta — {product_name}",
                              html, text_body=text)
    await log_email(jur["email"], "Evaluaciones completas", "evals_complete", result, user_id=None)
    # Marca timestamp para idempotencia (incluso si el correo fue mocked, no re-enviar pronto)
    datos["email_acta_listo_at"] = now_iso()
    datos["email_acta_listo_result"] = {"provider": result.get("provider"), "ok": result.get("ok"),
                                        "mocked": result.get("mocked", False)}
    await db.jurados.update_one({"id": jurado_id}, {"$set": {"datos": datos}})


@router.post("/evaluaciones-individuales/{eid}/firmar")
async def firmar_eval(eid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    ev = await db.evaluaciones_individuales.find_one({"id": eid})
    if not ev:
        raise HTTPException(status_code=404, detail="Evaluación no encontrada")
    if ev["estado"] != "Finalizada":
        raise HTTPException(status_code=400, detail="Solo se puede firmar una evaluación Finalizada")
    await db.evaluaciones_individuales.update_one(
        {"id": eid},
        {"$set": {"estado": "Firmada", "fecha_firma": now_iso(), "firmado_por": user["username"]}}
    )
    await audit(user, "sign", "evaluaciones_individuales", eid)
    return {"ok": True}


@router.post("/evaluaciones-individuales/{eid}/reabrir")
async def reabrir_eval(eid: str, body: dict = Body(default={}),
                       user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    """Reabre una evaluación Finalizada para que el jurado pueda modificarla.
    - Bloqueada si la evaluación está Firmada/Bloqueada/Anulada (estado terminal).
    - Crea snapshot en `evaluaciones_versiones` para auditoría histórica.
    - Estado pasa a 'Reabierta' (editable, computado por el frontend igual que Borrador).
    - El motivo es obligatorio y queda en la auditoría.
    """
    db = get_db()
    ev = await db.evaluaciones_individuales.find_one({"id": eid}, {"_id": 0})
    if not ev:
        raise HTTPException(404, "Evaluación no encontrada")
    if ev.get("estado") in ("Firmada", "Bloqueada", "Anulada"):
        raise HTTPException(
            409,
            f"No se puede reabrir: la evaluación está {ev['estado']}. "
            f"Si hay un error tras la firma debe registrarse una corrección/adenda en lugar de modificar.",
        )
    if ev.get("estado") not in ("Finalizada",):
        raise HTTPException(409, f"La evaluación está en estado '{ev['estado']}', no requiere reapertura.")
    motivo = (body or {}).get("motivo") or ""
    if not motivo.strip():
        raise HTTPException(400, "El motivo de la reapertura es obligatorio")
    # Snapshot histórico
    snap = {k: ev.get(k) for k in ("estado", "puntajes", "observaciones", "observacion_final",
                                     "puntaje_total", "puntaje_diferencial_total", "fecha_finalizacion")}
    await db.evaluaciones_versiones.insert_one({
        "id": str(uuid.uuid4()),
        "evaluacion_id": eid,
        "convocatoria_id": ev["convocatoria_id"],
        "snapshot": snap,
        "motivo_reapertura": motivo,
        "reabierta_por": user.get("username"),
        "reabierta_at": now_iso(),
    })
    # Marcar reabierta
    await db.evaluaciones_individuales.update_one(
        {"id": eid},
        {"$set": {"estado": "Reabierta", "reaperturas": (ev.get("reaperturas", 0) + 1),
                  "ultima_reapertura_at": now_iso(), "ultima_reapertura_motivo": motivo,
                  "ultima_reapertura_por": user.get("username")},
         "$unset": {"fecha_finalizacion": ""}}
    )
    # ── Invalidar la firma del acta individual del jurado si existía ──
    # El acta agrupada del jurado debe rehacerse cuando se modifican puntajes que la sustentan.
    jurado_id = ev.get("jurado_id")
    if jurado_id:
        jur = await db.jurados.find_one({"id": jurado_id}, {"_id": 0, "datos": 1})
        datos = (jur or {}).get("datos") or {}
        if datos.get("acta_individual_firma_at"):
            datos["acta_individual_firma_at_anterior"] = datos.get("acta_individual_firma_at")
            datos.pop("acta_individual_firma_at", None)
            datos["acta_invalidada_por_reapertura"] = True
            datos["acta_invalidada_at"] = now_iso()
            await db.jurados.update_one({"id": jurado_id}, {"$set": {"datos": datos}})
    # Aprobar todas las solicitudes pendientes de esta evaluación (si las hay)
    await db.reapertura_solicitudes.update_many(
        {"evaluacion_id": eid, "estado": "Pendiente"},
        {"$set": {"estado": "Aprobada", "resuelta_at": now_iso(), "resuelta_por": user.get("username")}}
    )
    await audit(user, "reopen", "evaluaciones_individuales", eid, detalle=motivo)
    return {"ok": True, "estado": "Reabierta", "version_guardada": True}


# ==================== SOLICITUDES DE REAPERTURA (Jurado → Admin) ====================
@router.post("/evaluaciones-individuales/{eid}/solicitar-reapertura")
async def solicitar_reapertura(eid: str, body: dict = Body(...),
                                 user: dict = Depends(get_current_user)):
    """El jurado solicita reapertura de su evaluación Finalizada.
    El admin la verá en /reapertura-solicitudes y podrá aprobar o rechazar.
    Bloqueada si la evaluación está Firmada/Bloqueada/Anulada.
    """
    db = get_db()
    ev = await db.evaluaciones_individuales.find_one({"id": eid}, {"_id": 0})
    if not ev:
        raise HTTPException(404, "Evaluación no encontrada")
    # Auth: el jurado dueño
    jurado = await db.jurados.find_one({"id": ev["jurado_id"]})
    if not jurado or jurado.get("email") != user.get("email"):
        if user["role"] not in ("admin_general", "admin_convocatoria"):
            raise HTTPException(403, "Solo el jurado dueño puede solicitar la reapertura")
    if ev.get("estado") in ("Firmada", "Bloqueada", "Anulada"):
        raise HTTPException(409, f"No se puede solicitar: la evaluación está {ev['estado']}. "
                                  f"Si requiere modificación tras firma, debe registrarse una corrección/adenda.")
    if ev.get("estado") != "Finalizada":
        raise HTTPException(409, f"La evaluación está en estado '{ev['estado']}' — ya es editable.")
    motivo = (body or {}).get("motivo") or ""
    if not motivo.strip():
        raise HTTPException(400, "Debes indicar el motivo de la solicitud")
    # Evitar duplicar solicitudes pendientes
    ya = await db.reapertura_solicitudes.find_one({"evaluacion_id": eid, "estado": "Pendiente"})
    if ya:
        raise HTTPException(409, "Ya tienes una solicitud Pendiente para esta evaluación")
    sid = str(uuid.uuid4())
    await db.reapertura_solicitudes.insert_one({
        "id": sid,
        "tipo": "individual",
        "evaluacion_id": eid,
        "convocatoria_id": ev["convocatoria_id"],
        "propuesta_id": ev["propuesta_id"],
        "jurado_id": ev["jurado_id"],
        "solicitada_por": user.get("username"),
        "motivo": motivo,
        "estado": "Pendiente",
        "created_at": now_iso(),
    })
    await audit(user, "request_reopen", "evaluaciones_individuales", eid, detalle=motivo)
    return {"ok": True, "solicitud_id": sid, "estado": "Pendiente"}


@router.get("/reapertura-solicitudes")
async def listar_solicitudes(convocatoria_id: str, estado: Optional[str] = None,
                              user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    q = {"convocatoria_id": convocatoria_id}
    if estado:
        q["estado"] = estado
    items = await db.reapertura_solicitudes.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Enriquecer
    jurs = {j["id"]: j for j in await db.jurados.find({"convocatoria_id": convocatoria_id}, {"_id": 0}).to_list(2000)}
    props = {p["id"]: p for p in await db.propuestas.find({"convocatoria_id": convocatoria_id}, {"_id": 0}).to_list(5000)}
    ternas = {t["id"]: t for t in await db.ternas.find({"convocatoria_id": convocatoria_id}, {"_id": 0}).to_list(2000)}
    for it in items:
        # Retrocompat: documentos antiguos sin 'tipo' son individuales
        if not it.get("tipo"):
            it["tipo"] = "individual"
        j = jurs.get(it.get("jurado_id"), {}) if it.get("jurado_id") else {}
        p = props.get(it.get("propuesta_id"), {})
        t = ternas.get(it.get("terna_id"), {}) if it.get("terna_id") else {}
        it["jurado_nombre"] = j.get("nombre")
        it["jurado_email"] = j.get("email")
        it["propuesta_codigo"] = p.get("codigo")
        it["propuesta_nombre"] = p.get("nombre")
        it["terna_codigo"] = t.get("codigo")
        it["terna_nombre"] = t.get("nombre")
    return items


@router.post("/reapertura-solicitudes/{sid}/aprobar")
async def aprobar_solicitud(sid: str, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    sol = await db.reapertura_solicitudes.find_one({"id": sid}, {"_id": 0})
    if not sol:
        raise HTTPException(404, "Solicitud no encontrada")
    if sol.get("estado") != "Pendiente":
        raise HTTPException(409, f"La solicitud ya está {sol['estado']}")
    # Reabrir según el tipo
    tipo = sol.get("tipo") or "individual"
    motivo_aprob = f"[Aprobado] {sol.get('motivo','')}"
    if tipo == "colectiva":
        await reabrir_eval_colectiva(sol["evaluacion_id"], body={"motivo": motivo_aprob}, user=user)
    else:
        await reabrir_eval(sol["evaluacion_id"], body={"motivo": motivo_aprob}, user=user)
    return {"ok": True, "estado": "Aprobada", "tipo": tipo}


@router.post("/reapertura-solicitudes/{sid}/rechazar")
async def rechazar_solicitud(sid: str, body: dict = Body(default={}),
                              user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    sol = await db.reapertura_solicitudes.find_one({"id": sid}, {"_id": 0})
    if not sol:
        raise HTTPException(404, "Solicitud no encontrada")
    if sol.get("estado") != "Pendiente":
        raise HTTPException(409, f"La solicitud ya está {sol['estado']}")
    motivo = (body or {}).get("motivo_rechazo") or ""
    await db.reapertura_solicitudes.update_one(
        {"id": sid},
        {"$set": {"estado": "Rechazada", "resuelta_at": now_iso(), "resuelta_por": user.get("username"),
                  "motivo_rechazo": motivo}}
    )
    await audit(user, "reject_reopen_request", "reapertura_solicitudes", sid, detalle=motivo)
    return {"ok": True, "estado": "Rechazada"}


@router.get("/evaluaciones-individuales/{eid}/versiones")
async def listar_versiones(eid: str, user: dict = Depends(get_current_user)):
    """Historial de versiones (snapshots tomados antes de cada reapertura)."""
    db = get_db()
    versiones = await db.evaluaciones_versiones.find({"evaluacion_id": eid}, {"_id": 0}).sort("reabierta_at", -1).to_list(50)
    return versiones


# ==================== EVALUACIÓN COLECTIVA ====================
@router.get("/evaluaciones-colectivas/{eid}")
async def get_eval_colectiva(eid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    item = await db.evaluaciones_colectivas.find_one({"id": eid}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Evaluación colectiva no encontrada")
    return item


@router.get("/evaluaciones-colectivas")
async def list_eval_colectivas(convocatoria_id: str, terna_id: Optional[str] = None,
                               mias: bool = False,
                               user: dict = Depends(get_current_user)):
    db = get_db()
    q = {"convocatoria_id": convocatoria_id}
    if terna_id: q["terna_id"] = terna_id
    # El jurado NO ve las colectivas en estado "Pendiente" (aún no habilitadas por el admin).
    if user.get("role") == "jurado":
        q["estado"] = {"$ne": "Pendiente"}
        if mias:
            # Filtrar solo las ternas a las que pertenece el jurado
            j = await db.jurados.find_one({"$or": [
                {"id": user.get("jurado_id")}, {"email": user.get("email")}
            ]})
            if j:
                ternas_ids = [t["id"] for t in await db.ternas.find({
                    "convocatoria_id": convocatoria_id, "integrantes.jurado_id": j["id"]
                }, {"_id": 0, "id": 1}).to_list(500)]
                q["terna_id"] = {"$in": ternas_ids}
            else:
                return []
    items = await db.evaluaciones_colectivas.find(q, {"_id": 0}).to_list(5000)
    return items


class EvalColectivaIn(BaseModel):
    convocatoria_id: str
    propuesta_id: str
    terna_id: str
    estado_inicial: Optional[str] = "Abierta"  # "Pendiente" | "Abierta"


async def _materialize_colectiva(db, convocatoria_id: str, propuesta_id: str, terna_id: str,
                                  estado_inicial: str = "Pendiente"):
    """Helper: crea (o devuelve) una colectiva para (propuesta, terna).

    Reglas:
      - Si ya existe, la devuelve sin tocar.
      - Si no, calcula el promedio de las individuales `Finalizada/Firmada` y crea el doc.
      - El estado por defecto es "Pendiente" (deshabilitada). El admin la habilita a "Abierta".
    """
    existing = await db.evaluaciones_colectivas.find_one({
        "propuesta_id": propuesta_id, "terna_id": terna_id
    })
    if existing:
        existing.pop("_id", None)
        return existing
    individuales = await db.evaluaciones_individuales.find({
        "propuesta_id": propuesta_id,
        "estado": {"$in": ["Finalizada", "Firmada"]},
    }).to_list(50)
    promedio = {}
    if individuales:
        all_crit_ids = set()
        for ev in individuales:
            all_crit_ids.update(ev.get("puntajes", {}).keys())
        for cid in all_crit_ids:
            vals = [float(ev["puntajes"].get(cid, 0)) for ev in individuales if ev.get("puntajes", {}).get(cid) is not None]
            if vals:
                promedio[cid] = round(sum(vals) / len(vals), 2)
    criterios = await db.criterios.find({"convocatoria_id": convocatoria_id}, {"_id": 0}).to_list(100)
    total_of = sum(promedio.get(c["id"], 0) for c in criterios if c.get("oficial", True))
    total_dif = sum(promedio.get(c["id"], 0) for c in criterios if not c.get("oficial", True))
    bono = await _compute_bono_priorizacion(db, convocatoria_id, propuesta_id)

    doc = {
        "id": str(uuid.uuid4()),
        "convocatoria_id": convocatoria_id,
        "propuesta_id": propuesta_id,
        "terna_id": terna_id,
        "estado": estado_inicial,  # "Pendiente" o "Abierta"
        "puntajes": promedio,
        "puntaje_criterios": round(total_of, 2),
        "bono_priorizacion": bono,
        "puntaje_final": round(total_of + bono, 2),
        "puntaje_diferencial_total": round(total_dif, 2),
        "observacion_consolidada": "",
        "individuales_relacionadas": [ev["id"] for ev in individuales],
        "created_at": now_iso(),
        "auto_generada": True,
    }
    await db.evaluaciones_colectivas.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def _auto_generate_colectivas_after_finalizar(db, ev: dict):
    """Auto-crea colectivas en estado 'Pendiente' cuando todos los integrantes de la(s)
    terna(s) a la(s) que pertenece el jurado finalizan sus individuales de esa propuesta.
    Idempotente (si ya existe la colectiva, no hace nada).
    """
    jurado_id = ev.get("jurado_id"); propuesta_id = ev.get("propuesta_id")
    convocatoria_id = ev.get("convocatoria_id")
    if not (jurado_id and propuesta_id and convocatoria_id):
        return
    # Buscar las ternas del jurado en esa convocatoria
    ternas = await db.ternas.find({
        "convocatoria_id": convocatoria_id,
        "integrantes.jurado_id": jurado_id,
    }, {"_id": 0}).to_list(20)
    for terna in ternas:
        miembros = [m.get("jurado_id") for m in (terna.get("integrantes") or []) if m.get("jurado_id")]
        if not miembros:
            continue
        # ¿Tienen todos los miembros una individual Finalizada/Firmada para esa propuesta?
        cnt = await db.evaluaciones_individuales.count_documents({
            "convocatoria_id": convocatoria_id,
            "propuesta_id": propuesta_id,
            "jurado_id": {"$in": miembros},
            "estado": {"$in": ["Finalizada", "Firmada"]},
            "etapa": {"$ne": "colectiva"},
        })
        if cnt < len(miembros):
            continue  # aún falta algún integrante
        # Materializar (idempotente)
        await _materialize_colectiva(db, convocatoria_id, propuesta_id, terna["id"], estado_inicial="Pendiente")


@router.post("/evaluaciones-colectivas")
async def crear_eval_colectiva(payload: EvalColectivaIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria", "jurado"))):
    db = get_db()
    estado = payload.estado_inicial if user.get("role") in ("admin_general", "admin_convocatoria") else "Abierta"
    doc = await _materialize_colectiva(db, payload.convocatoria_id, payload.propuesta_id, payload.terna_id, estado_inicial=estado)
    await audit(user, "create", "evaluaciones_colectivas", doc["id"])
    return doc


# ─────────────────────────────────────────────────────────────────────────────
# Habilitación / deshabilitación de colectivas (control del admin)
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/evaluaciones-colectivas/{eid}/habilitar")
async def habilitar_colectiva(eid: str, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    """Admin habilita una colectiva pasándola de 'Pendiente' a 'Abierta' para que la terna la trabaje."""
    db = get_db()
    ev = await db.evaluaciones_colectivas.find_one({"id": eid})
    if not ev:
        raise HTTPException(status_code=404, detail="Colectiva no encontrada")
    if ev.get("estado") != "Pendiente":
        raise HTTPException(status_code=400, detail=f"Solo se habilita una colectiva en estado 'Pendiente' (actual: {ev.get('estado')})")
    await db.evaluaciones_colectivas.update_one({"id": eid}, {"$set": {"estado": "Abierta", "habilitada_at": now_iso(), "habilitada_por": user.get("username") or user.get("email")}})
    await audit(user, "habilitar", "evaluaciones_colectivas", eid)
    return {"ok": True, "estado": "Abierta"}


@router.post("/evaluaciones-colectivas/{eid}/deshabilitar")
async def deshabilitar_colectiva(eid: str, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    """Admin deshabilita una colectiva (Abierta → Pendiente). Solo si NO tiene avance guardado."""
    db = get_db()
    ev = await db.evaluaciones_colectivas.find_one({"id": eid})
    if not ev:
        raise HTTPException(status_code=404, detail="Colectiva no encontrada")
    if ev.get("estado") not in ("Abierta", "En proceso", "Reabierta"):
        raise HTTPException(status_code=400, detail=f"Solo se deshabilita una colectiva en estado 'Abierta' (actual: {ev.get('estado')})")
    tiene_obs = bool((ev.get("observacion_consolidada") or "").strip())
    # tiene "avance" si ya cambió puntajes manualmente (distinto al promedio inicial) o agregó observación
    if tiene_obs:
        raise HTTPException(status_code=400, detail="No se puede deshabilitar: la colectiva ya tiene observación consolidada. Reabra/anule primero o haga reset desde la vista del registro.")
    await db.evaluaciones_colectivas.update_one({"id": eid}, {"$set": {"estado": "Pendiente", "deshabilitada_at": now_iso(), "deshabilitada_por": user.get("username") or user.get("email")}})
    await audit(user, "deshabilitar", "evaluaciones_colectivas", eid)
    return {"ok": True, "estado": "Pendiente"}


class TernaColectivasBatchIn(BaseModel):
    terna_id: str
    convocatoria_id: str


@router.post("/ternas/colectivas/habilitar")
async def habilitar_colectivas_por_terna(payload: TernaColectivasBatchIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    """Habilita TODAS las colectivas Pendientes de una terna (Pendiente → Abierta)."""
    db = get_db()
    result = await db.evaluaciones_colectivas.update_many(
        {"terna_id": payload.terna_id, "convocatoria_id": payload.convocatoria_id, "estado": "Pendiente"},
        {"$set": {"estado": "Abierta", "habilitada_at": now_iso(), "habilitada_por": user.get("username") or user.get("email")}}
    )
    await audit(user, "habilitar_batch", "evaluaciones_colectivas", payload.terna_id, detalle=f"habilitadas={result.modified_count}")
    return {"ok": True, "habilitadas": result.modified_count}


@router.post("/ternas/colectivas/deshabilitar")
async def deshabilitar_colectivas_por_terna(payload: TernaColectivasBatchIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    """Deshabilita TODAS las colectivas Abiertas SIN observación de una terna (Abierta → Pendiente)."""
    db = get_db()
    cur = db.evaluaciones_colectivas.find({
        "terna_id": payload.terna_id, "convocatoria_id": payload.convocatoria_id,
        "estado": {"$in": ["Abierta", "Reabierta"]}
    })
    ids_a_deshabilitar = []
    skipped = 0
    async for ev in cur:
        if (ev.get("observacion_consolidada") or "").strip():
            skipped += 1
            continue
        ids_a_deshabilitar.append(ev["id"])
    if ids_a_deshabilitar:
        await db.evaluaciones_colectivas.update_many(
            {"id": {"$in": ids_a_deshabilitar}},
            {"$set": {"estado": "Pendiente", "deshabilitada_at": now_iso(), "deshabilitada_por": user.get("username") or user.get("email")}}
        )
    await audit(user, "deshabilitar_batch", "evaluaciones_colectivas", payload.terna_id,
                detalle=f"deshabilitadas={len(ids_a_deshabilitar)} skipped_con_avance={skipped}")
    return {"ok": True, "deshabilitadas": len(ids_a_deshabilitar), "saltadas_con_avance": skipped}


class GenerarPendientesIn(BaseModel):
    convocatoria_id: str
    terna_id: Optional[str] = None


@router.post("/evaluaciones-colectivas/generar-pendientes")
async def generar_colectivas_pendientes(payload: GenerarPendientesIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    """Reconcilia: para cada (propuesta, terna) cuyas individuales estén todas
    Finalizada/Firmada y no exista colectiva, crea una en estado 'Pendiente'."""
    db = get_db()
    q_t = {"convocatoria_id": payload.convocatoria_id}
    if payload.terna_id:
        q_t["id"] = payload.terna_id
    ternas = await db.ternas.find(q_t, {"_id": 0}).to_list(2000)
    creadas = 0
    revisadas = 0
    for terna in ternas:
        miembros = [m.get("jurado_id") for m in (terna.get("integrantes") or []) if m.get("jurado_id")]
        if not miembros:
            continue
        # Propuestas evaluadas por algún miembro de la terna
        prop_ids = await db.evaluaciones_individuales.distinct("propuesta_id", {
            "convocatoria_id": payload.convocatoria_id,
            "jurado_id": {"$in": miembros},
            "etapa": {"$ne": "colectiva"},
        })
        for pid in prop_ids:
            revisadas += 1
            cnt = await db.evaluaciones_individuales.count_documents({
                "convocatoria_id": payload.convocatoria_id, "propuesta_id": pid,
                "jurado_id": {"$in": miembros},
                "estado": {"$in": ["Finalizada", "Firmada"]},
                "etapa": {"$ne": "colectiva"},
            })
            if cnt < len(miembros):
                continue
            existing = await db.evaluaciones_colectivas.find_one({"propuesta_id": pid, "terna_id": terna["id"]}, {"_id": 0, "id": 1})
            if existing:
                continue
            await _materialize_colectiva(db, payload.convocatoria_id, pid, terna["id"], estado_inicial="Pendiente")
            creadas += 1
    await audit(user, "generar_pendientes", "evaluaciones_colectivas",
                payload.terna_id or payload.convocatoria_id, detalle=f"creadas={creadas} revisadas={revisadas}")
    return {"ok": True, "creadas": creadas, "revisadas": revisadas}


@router.post("/evaluaciones-colectivas/{eid}/iniciar-modalidad-nueva")
async def iniciar_modalidad_nueva(eid: str, user: dict = Depends(require_roles("admin_general", "admin_convocatoria", "jurado"))):
    """Modalidad 2: crea evaluaciones v2 (etapa='colectiva') precargadas con los puntajes de v1 para cada integrante de la terna.
    Los puntajes permanecen CIEGOS hasta que la colectiva se cierre."""
    db = get_db()
    ev = await db.evaluaciones_colectivas.find_one({"id": eid})
    if not ev:
        raise HTTPException(status_code=404, detail="Evaluación colectiva no encontrada")
    if ev.get("estado") not in ("Abierta", "En proceso", "Reabierta"):
        raise HTTPException(status_code=400, detail="Solo se puede iniciar en colectivas abiertas o reabiertas")

    terna = await db.ternas.find_one({"id": ev["terna_id"]})
    if not terna:
        raise HTTPException(status_code=404, detail="Terna no encontrada")

    created = 0
    for integ in terna.get("integrantes", []):
        jid = integ.get("jurado_id")
        if not jid: continue
        # No duplicar si ya existe v2
        existing_v2 = await db.evaluaciones_individuales.find_one({
            "propuesta_id": ev["propuesta_id"], "jurado_id": jid,
            "etapa": "colectiva", "evaluacion_colectiva_id": eid,
        })
        if existing_v2: continue
        # Buscar v1 (etapa individual) para precargar
        v1 = await db.evaluaciones_individuales.find_one({
            "propuesta_id": ev["propuesta_id"], "jurado_id": jid,
            "$or": [{"etapa": "individual"}, {"etapa": {"$exists": False}}],
        })
        await db.evaluaciones_individuales.insert_one({
            "id": str(uuid.uuid4()),
            "convocatoria_id": ev["convocatoria_id"],
            "propuesta_id": ev["propuesta_id"],
            "jurado_id": jid,
            "terna_id": ev["terna_id"],
            "evaluacion_colectiva_id": eid,
            "etapa": "colectiva",
            "version": 2,
            "replaces_id": v1.get("id") if v1 else None,
            "estado": "Borrador",
            "puntajes": dict(v1.get("puntajes") or {}) if v1 else {},
            "observaciones": dict(v1.get("observaciones") or {}) if v1 else {},
            "observacion_final": (v1.get("observacion_final") or "") if v1 else "",
            "puntaje_total": v1.get("puntaje_total", 0) if v1 else 0,
            "puntaje_diferencial_total": v1.get("puntaje_diferencial_total", 0) if v1 else 0,
            "ciego_hasta_cierre": True,
            "created_at": now_iso(),
        })
        created += 1

    await db.evaluaciones_colectivas.update_one(
        {"id": eid},
        {"$set": {"estado": "En proceso", "modalidad_resuelta": "nueva_evaluacion", "iniciada_at": now_iso()}}
    )
    await audit(user, "start_modalidad_nueva", "evaluaciones_colectivas", eid, detalle=f"v2 creadas: {created}")
    return {"ok": True, "v2_creadas": created}


@router.get("/evaluaciones-colectivas/{eid}/v2")
async def list_v2(eid: str, user: dict = Depends(get_current_user)):
    """Lista las evaluaciones v2 asociadas a una colectiva. Aplica regla de CIEGO: si la colectiva no está cerrada,
    cada jurado solo ve sus propios puntajes; los pares se muestran sin puntajes/observaciones."""
    db = get_db()
    col = await db.evaluaciones_colectivas.find_one({"id": eid}, {"_id": 0})
    if not col:
        raise HTTPException(status_code=404, detail="No encontrada")
    items = await db.evaluaciones_individuales.find(
        {"evaluacion_colectiva_id": eid, "etapa": "colectiva"}, {"_id": 0}
    ).to_list(50)
    closed = col.get("estado") in ("Cerrada", "Firmada")
    # Encontrar mi jurado_id por email
    my_jurado = await db.jurados.find_one({"email": user.get("email")})
    my_jid = my_jurado["id"] if my_jurado else None
    out = []
    for it in items:
        is_mine = (it.get("jurado_id") == my_jid)
        is_admin = user.get("role") in ("admin_general", "admin_convocatoria")
        if closed or is_mine or is_admin:
            out.append(it)
        else:
            # Ciego: ocultar puntajes y observaciones
            redacted = {
                "id": it["id"], "jurado_id": it["jurado_id"],
                "estado": it["estado"], "etapa": it["etapa"], "version": it["version"],
                "ciego": True,
                "fecha_finalizacion": it.get("fecha_finalizacion"),
            }
            out.append(redacted)
    return {"items": out, "ciego_activo": not closed, "modalidad": col.get("modalidad_resuelta") or col.get("modalidad")}


@router.post("/evaluaciones-colectivas/{eid}/cerrar-con-promedio-v2")
async def cerrar_con_promedio_v2(eid: str, user: dict = Depends(require_roles("admin_general", "admin_convocatoria", "jurado"))):
    """Cierra la colectiva calculando el promedio de las v2 finalizadas como puntaje definitivo."""
    db = get_db()
    col = await db.evaluaciones_colectivas.find_one({"id": eid})
    if not col:
        raise HTTPException(status_code=404, detail="No encontrada")
    if col.get("estado") in ("Cerrada", "Firmada"):
        raise HTTPException(status_code=400, detail="Colectiva ya cerrada")

    v2s = await db.evaluaciones_individuales.find({
        "evaluacion_colectiva_id": eid, "etapa": "colectiva",
        "estado": {"$in": ["Finalizada", "Firmada"]},
    }).to_list(50)
    if not v2s:
        raise HTTPException(status_code=400, detail="No hay evaluaciones v2 finalizadas para promediar")

    # Verificar que TODOS los integrantes finalizaron
    terna = await db.ternas.find_one({"id": col["terna_id"]})
    expected = len([i for i in (terna.get("integrantes") or []) if i.get("jurado_id")])
    if len(v2s) < expected:
        raise HTTPException(status_code=400, detail=f"Faltan v2 por finalizar ({len(v2s)}/{expected})")

    # Promediar criterio por criterio
    all_crits = set()
    for e in v2s: all_crits.update((e.get("puntajes") or {}).keys())
    promedio = {}
    for cid in all_crits:
        vals = [float((e.get("puntajes") or {}).get(cid, 0)) for e in v2s]
        promedio[cid] = round(sum(vals) / len(vals), 2)

    criterios = await db.criterios.find({"convocatoria_id": col["convocatoria_id"]}).to_list(100)
    total_of = sum(promedio.get(c["id"], 0) for c in criterios if c.get("oficial", True))
    total_dif = sum(promedio.get(c["id"], 0) for c in criterios if not c.get("oficial", True))
    bono = await _compute_bono_priorizacion(db, col["convocatoria_id"], col["propuesta_id"])

    await db.evaluaciones_colectivas.update_one(
        {"id": eid},
        {"$set": {
            "estado": "Cerrada",
            "puntajes": promedio,
            "puntaje_criterios": round(total_of, 2),
            "bono_priorizacion": bono,
            "puntaje_final": round(total_of + bono, 2),
            "puntaje_diferencial_total": round(total_dif, 2),
            "fuente_definitiva": "promedio_etapa_colectiva",
            "fecha_cierre": now_iso(),
            "v2_relacionadas": [e["id"] for e in v2s],
        }}
    )
    await audit(user, "close_modalidad_nueva", "evaluaciones_colectivas", eid,
                detalle=f"Cerrada con promedio v2 ({len(v2s)} jurados). Puntaje definitivo: {round(total_of, 2)}")
    return await db.evaluaciones_colectivas.find_one({"id": eid}, {"_id": 0})


@router.get("/evaluaciones-individuales/{eid}/referencia-v1")
async def get_v1_reference(eid: str, user: dict = Depends(get_current_user)):
    """Devuelve la v1 (etapa individual) que precarga una v2. Solo lectura, mostrada como referencia."""
    db = get_db()
    v2 = await db.evaluaciones_individuales.find_one({"id": eid}, {"_id": 0})
    if not v2:
        raise HTTPException(status_code=404, detail="Evaluación no encontrada")
    if v2.get("etapa") != "colectiva":
        raise HTTPException(status_code=400, detail="Esta evaluación no es etapa colectiva")
    if not v2.get("replaces_id"):
        return None
    v1 = await db.evaluaciones_individuales.find_one({"id": v2["replaces_id"]}, {"_id": 0})
    return v1


class EvalColUpdate(BaseModel):
    puntajes: Optional[dict] = None
    observacion_consolidada: Optional[str] = None
    cerrar: bool = False


@router.patch("/evaluaciones-colectivas/{eid}")
async def save_eval_colectiva(eid: str, payload: EvalColUpdate, user: dict = Depends(get_current_user)):
    db = get_db()
    ev = await db.evaluaciones_colectivas.find_one({"id": eid})
    if not ev:
        raise HTTPException(status_code=404, detail="Evaluación colectiva no encontrada")
    if ev["estado"] in ("Cerrada", "Firmada"):
        raise HTTPException(status_code=400, detail="Evaluación colectiva ya cerrada")
    updates = {}
    if payload.puntajes is not None:
        updates["puntajes"] = payload.puntajes
        criterios = await db.criterios.find({"convocatoria_id": ev["convocatoria_id"]}, {"_id": 0}).to_list(100)
        total_of = sum(float(payload.puntajes.get(c["id"], 0)) for c in criterios if c.get("oficial", True))
        total_dif = sum(float(payload.puntajes.get(c["id"], 0)) for c in criterios if not c.get("oficial", True))
        bono = await _compute_bono_priorizacion(db, ev["convocatoria_id"], ev["propuesta_id"])
        updates["puntaje_criterios"] = round(total_of, 2)
        updates["bono_priorizacion"] = bono
        updates["puntaje_final"] = round(total_of + bono, 2)
        updates["puntaje_diferencial_total"] = round(total_dif, 2)
    if payload.observacion_consolidada is not None:
        updates["observacion_consolidada"] = payload.observacion_consolidada
    if payload.cerrar:
        updates["estado"] = "Cerrada"
        updates["fecha_cierre"] = now_iso()
    if updates:
        await db.evaluaciones_colectivas.update_one({"id": eid}, {"$set": updates})
    await audit(user, "save", "evaluaciones_colectivas", eid, valor_nuevo=updates)
    return await db.evaluaciones_colectivas.find_one({"id": eid}, {"_id": 0})


# ==================== REAPERTURA DE EVALUACIONES COLECTIVAS ====================
async def _user_is_integrante_terna(db, user: dict, terna_id: str) -> bool:
    """Determina si el usuario es integrante de una terna específica (por email del jurado)."""
    terna = await db.ternas.find_one({"id": terna_id})
    if not terna:
        return False
    user_email = (user.get("email") or "").lower()
    if not user_email:
        return False
    for integ in (terna.get("integrantes") or []):
        jur_id = integ.get("jurado_id")
        if not jur_id:
            continue
        jur = await db.jurados.find_one({"id": jur_id}, {"email": 1, "_id": 0})
        if jur and (jur.get("email") or "").lower() == user_email:
            return True
    return False


@router.post("/evaluaciones-colectivas/{eid}/reabrir")
async def reabrir_eval_colectiva(eid: str, body: dict = Body(default={}),
                                  user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    """Reabre una evaluación colectiva Cerrada para que la terna pueda modificarla.
    - Bloqueada si la evaluación está Firmada/Anulada (estado terminal).
    - Crea snapshot en `evaluaciones_colectivas_versiones` para auditoría histórica.
    - Estado pasa a 'Reabierta' (editable de nuevo, igual que Abierta).
    - El motivo es obligatorio.
    - Aprueba automáticamente cualquier solicitud Pendiente para esta colectiva.
    """
    db = get_db()
    ev = await db.evaluaciones_colectivas.find_one({"id": eid}, {"_id": 0})
    if not ev:
        raise HTTPException(404, "Evaluación colectiva no encontrada")
    if ev.get("estado") in ("Firmada", "Anulada"):
        raise HTTPException(
            409,
            f"No se puede reabrir: la evaluación colectiva está {ev['estado']}. "
            f"Si hay un error tras la firma debe registrarse una corrección/adenda en lugar de modificar.",
        )
    if ev.get("estado") not in ("Cerrada",):
        raise HTTPException(409, f"La evaluación colectiva está en estado '{ev['estado']}', no requiere reapertura.")
    motivo = (body or {}).get("motivo") or ""
    if not motivo.strip():
        raise HTTPException(400, "El motivo de la reapertura es obligatorio")
    # Snapshot histórico
    snap = {k: ev.get(k) for k in ("estado", "puntajes", "observacion_consolidada",
                                     "puntaje_final", "puntaje_criterios", "bono_priorizacion",
                                     "puntaje_diferencial_total", "fecha_cierre", "fuente_definitiva")}
    await db.evaluaciones_colectivas_versiones.insert_one({
        "id": str(uuid.uuid4()),
        "evaluacion_colectiva_id": eid,
        "convocatoria_id": ev["convocatoria_id"],
        "snapshot": snap,
        "motivo_reapertura": motivo,
        "reabierta_por": user.get("username"),
        "reabierta_at": now_iso(),
    })
    # Marcar reabierta
    await db.evaluaciones_colectivas.update_one(
        {"id": eid},
        {"$set": {"estado": "Reabierta", "reaperturas": (ev.get("reaperturas", 0) + 1),
                  "ultima_reapertura_at": now_iso(), "ultima_reapertura_motivo": motivo,
                  "ultima_reapertura_por": user.get("username")},
         "$unset": {"fecha_cierre": ""}}
    )
    # ── Invalidar firmas previas del acta colectiva de la terna ──
    # Si la terna ya había firmado, esa acta queda desactualizada y debe re-firmarse.
    terna = await db.ternas.find_one({"id": ev["terna_id"]}, {"_id": 0, "datos": 1})
    if terna:
        datos = terna.get("datos") or {}
        firmas_previas = datos.get("firmas_acta_colectiva") or {}
        if firmas_previas:
            datos["firmas_acta_colectiva_anterior"] = firmas_previas
            datos["firmas_acta_colectiva"] = {}
            datos["acta_colectiva_invalidada_por_reapertura"] = True
            datos["acta_colectiva_invalidada_at"] = now_iso()
            await db.ternas.update_one({"id": ev["terna_id"]}, {"$set": {"datos": datos}})
    # ── Revertir v2 (etapa colectiva) a 'Borrador' para que los jurados puedan re-editar ──
    # Snapshot del estado previo de cada v2 antes de revertirlas.
    v2_records = await db.evaluaciones_individuales.find({
        "evaluacion_colectiva_id": eid, "etapa": "colectiva",
        "estado": {"$in": ["Finalizada", "Firmada"]},
    }).to_list(50)
    for v2 in v2_records:
        await db.evaluaciones_versiones.insert_one({
            "id": str(uuid.uuid4()),
            "evaluacion_id": v2["id"],
            "convocatoria_id": v2["convocatoria_id"],
            "snapshot": {k: v2.get(k) for k in ("estado", "puntajes", "observaciones",
                                                  "observacion_final", "puntaje_total",
                                                  "puntaje_diferencial_total", "finalizada_at")},
            "motivo_reapertura": motivo,
            "reabierta_por": user.get("username"),
            "reabierta_at": now_iso(),
        })
        await db.evaluaciones_individuales.update_one(
            {"id": v2["id"]},
            {"$set": {"estado": "Borrador", "reaperturas": (v2.get("reaperturas", 0) + 1),
                      "ultima_reapertura_at": now_iso()}}
        )
    # Aprobar solicitudes pendientes asociadas
    await db.reapertura_solicitudes.update_many(
        {"evaluacion_id": eid, "tipo": "colectiva", "estado": "Pendiente"},
        {"$set": {"estado": "Aprobada", "resuelta_at": now_iso(), "resuelta_por": user.get("username")}}
    )
    await audit(user, "reopen", "evaluaciones_colectivas", eid, detalle=motivo)
    return {"ok": True, "estado": "Reabierta", "version_guardada": True}


@router.post("/evaluaciones-colectivas/{eid}/solicitar-reapertura")
async def solicitar_reapertura_colectiva(eid: str, body: dict = Body(...),
                                          user: dict = Depends(get_current_user)):
    """Un integrante de la terna solicita reapertura de su evaluación colectiva Cerrada.
    El admin la verá en /reapertura-solicitudes y podrá aprobar o rechazar.
    """
    db = get_db()
    ev = await db.evaluaciones_colectivas.find_one({"id": eid}, {"_id": 0})
    if not ev:
        raise HTTPException(404, "Evaluación colectiva no encontrada")
    # Auth: solo integrantes de la terna o admins
    if user["role"] not in ("admin_general", "admin_convocatoria"):
        is_member = await _user_is_integrante_terna(db, user, ev["terna_id"])
        if not is_member:
            raise HTTPException(403, "Solo los integrantes de la terna pueden solicitar la reapertura")
    if ev.get("estado") in ("Firmada", "Anulada"):
        raise HTTPException(409, f"No se puede solicitar: la evaluación colectiva está {ev['estado']}. "
                                  f"Si requiere modificación tras firma, debe registrarse una corrección/adenda.")
    if ev.get("estado") != "Cerrada":
        raise HTTPException(409, f"La evaluación colectiva está en estado '{ev['estado']}' — ya es editable.")
    motivo = (body or {}).get("motivo") or ""
    if not motivo.strip():
        raise HTTPException(400, "Debes indicar el motivo de la solicitud")
    # Evitar duplicar solicitudes pendientes
    ya = await db.reapertura_solicitudes.find_one({"evaluacion_id": eid, "tipo": "colectiva", "estado": "Pendiente"})
    if ya:
        raise HTTPException(409, "Ya hay una solicitud Pendiente para esta evaluación colectiva")
    sid = str(uuid.uuid4())
    await db.reapertura_solicitudes.insert_one({
        "id": sid,
        "tipo": "colectiva",
        "evaluacion_id": eid,
        "convocatoria_id": ev["convocatoria_id"],
        "propuesta_id": ev["propuesta_id"],
        "terna_id": ev["terna_id"],
        "solicitada_por": user.get("username"),
        "motivo": motivo,
        "estado": "Pendiente",
        "created_at": now_iso(),
    })
    await audit(user, "request_reopen", "evaluaciones_colectivas", eid, detalle=motivo)
    return {"ok": True, "solicitud_id": sid, "estado": "Pendiente"}
