"""KRINOS - Evaluación Individual + Colectiva."""
import uuid
import os
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
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
    if user["role"] not in ("admin_general", "admin_convocatoria"):
        jurado = await db.jurados.find_one({"id": ev["jurado_id"]})
        if not jurado or jurado.get("email") != user["email"]:
            raise HTTPException(status_code=403, detail="No autorizado para editar esta evaluación")
    if ev["estado"] in ("Bloqueada", "Firmada", "Anulada"):
        raise HTTPException(status_code=400, detail=f"Evaluación en estado {ev['estado']} no editable")

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
async def reabrir_eval(eid: str, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    await db.evaluaciones_individuales.update_one({"id": eid}, {"$set": {"estado": "En edición"}})
    await audit(user, "reopen", "evaluaciones_individuales", eid)
    return {"ok": True}


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
                               user: dict = Depends(get_current_user)):
    db = get_db()
    q = {"convocatoria_id": convocatoria_id}
    if terna_id: q["terna_id"] = terna_id
    items = await db.evaluaciones_colectivas.find(q, {"_id": 0}).to_list(5000)
    return items


class EvalColectivaIn(BaseModel):
    convocatoria_id: str
    propuesta_id: str
    terna_id: str


@router.post("/evaluaciones-colectivas")
async def crear_eval_colectiva(payload: EvalColectivaIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria", "integrante_terna"))):
    db = get_db()
    existing = await db.evaluaciones_colectivas.find_one({
        "propuesta_id": payload.propuesta_id, "terna_id": payload.terna_id
    })
    if existing:
        existing.pop("_id", None)
        return existing
    # Calcular promedio de las evaluaciones individuales finalizadas
    individuales = await db.evaluaciones_individuales.find({
        "propuesta_id": payload.propuesta_id,
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
    criterios = await db.criterios.find({"convocatoria_id": payload.convocatoria_id}, {"_id": 0}).to_list(100)
    total_of = sum(promedio.get(c["id"], 0) for c in criterios if c.get("oficial", True))
    total_dif = sum(promedio.get(c["id"], 0) for c in criterios if not c.get("oficial", True))
    bono = await _compute_bono_priorizacion(db, payload.convocatoria_id, payload.propuesta_id)

    doc = {
        "id": str(uuid.uuid4()),
        "convocatoria_id": payload.convocatoria_id,
        "propuesta_id": payload.propuesta_id,
        "terna_id": payload.terna_id,
        "estado": "Abierta",
        "puntajes": promedio,
        "puntaje_criterios": round(total_of, 2),
        "bono_priorizacion": bono,
        "puntaje_final": round(total_of + bono, 2),
        "puntaje_diferencial_total": round(total_dif, 2),
        "observacion_consolidada": "",
        "individuales_relacionadas": [ev["id"] for ev in individuales],
        "created_at": now_iso(),
    }
    await db.evaluaciones_colectivas.insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "create", "evaluaciones_colectivas", doc["id"])
    return doc


@router.post("/evaluaciones-colectivas/{eid}/iniciar-modalidad-nueva")
async def iniciar_modalidad_nueva(eid: str, user: dict = Depends(require_roles("admin_general", "admin_convocatoria", "integrante_terna"))):
    """Modalidad 2: crea evaluaciones v2 (etapa='colectiva') precargadas con los puntajes de v1 para cada integrante de la terna.
    Los puntajes permanecen CIEGOS hasta que la colectiva se cierre."""
    db = get_db()
    ev = await db.evaluaciones_colectivas.find_one({"id": eid})
    if not ev:
        raise HTTPException(status_code=404, detail="Evaluación colectiva no encontrada")
    if ev.get("estado") not in ("Abierta", "En proceso"):
        raise HTTPException(status_code=400, detail="Solo se puede iniciar en colectivas abiertas")

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
async def cerrar_con_promedio_v2(eid: str, user: dict = Depends(require_roles("admin_general", "admin_convocatoria", "integrante_terna"))):
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
