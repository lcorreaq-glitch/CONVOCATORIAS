"""KRINOS - Evaluación Individual + Colectiva."""
import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from db import get_db, now_iso
from auth import get_current_user, require_roles, audit

router = APIRouter(prefix="/api", tags=["evaluations"])


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
        "puntaje_total": round(total_oficial, 2),
        "puntaje_diferencial_total": round(total_diferencial, 2),
        "fecha_ultima_edicion": now_iso(),
    }
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
    out = await db.evaluaciones_individuales.find_one({"id": eid}, {"_id": 0})
    return out


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

    doc = {
        "id": str(uuid.uuid4()),
        "convocatoria_id": payload.convocatoria_id,
        "propuesta_id": payload.propuesta_id,
        "terna_id": payload.terna_id,
        "estado": "Abierta",
        "puntajes": promedio,
        "puntaje_final": round(total_of, 2),
        "puntaje_diferencial_total": round(total_dif, 2),
        "observacion_consolidada": "",
        "individuales_relacionadas": [ev["id"] for ev in individuales],
        "created_at": now_iso(),
    }
    await db.evaluaciones_colectivas.insert_one(doc)
    await audit(user, "create", "evaluaciones_colectivas", doc["id"])
    return doc


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
        updates["puntaje_final"] = round(total_of, 2)
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
