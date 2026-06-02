"""KRINOS - IA Asistida (sección 21): resumen propuesta, sugerencia observación, borrador acta, etc."""
import os
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from db import get_db, now_iso
from auth import get_current_user, audit
from routes_settings import get_ai_config

router = APIRouter(prefix="/api/ai", tags=["ai"])


async def _chat(system_message: str, user_text: str, session_suffix: str = "") -> str:
    """Llama al modelo configurado. Retorna texto plano o lanza HTTPException."""
    cfg = await get_ai_config()
    if not cfg.get("enabled", True):
        raise HTTPException(status_code=503, detail="IA deshabilitada por el administrador")

    # Resolver API key
    if cfg.get("use_emergent_key", True):
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY no configurada en .env")
    else:
        api_key = cfg.get("byok_api_key") or ""
        if not api_key:
            raise HTTPException(status_code=400, detail="No hay API key configurada. Activa Emergent LLM Key o registra una BYOK.")

    provider = cfg.get("provider", "openai")
    model = cfg.get("model", "gpt-4o")
    base_sys = cfg.get("system_message") or ""
    full_sys = (base_sys + "\n\n" + system_message).strip()

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"emergentintegrations no disponible: {e}")

    session_id = f"krinos-{session_suffix or uuid.uuid4().hex[:8]}"
    chat = LlmChat(
        api_key=api_key,
        session_id=session_id,
        system_message=full_sys,
    ).with_model(provider, model)

    try:
        response = await chat.send_message(UserMessage(text=user_text))
        return str(response).strip()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error consultando IA: {e}")


class PropuestaSummaryIn(BaseModel):
    propuesta_id: str


@router.post("/resumen-propuesta")
async def resumen_propuesta(payload: PropuestaSummaryIn, user: dict = Depends(get_current_user)):
    db = get_db()
    prop = await db.propuestas.find_one({"id": payload.propuesta_id}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    text = (
        f"Genera un resumen ejecutivo de la siguiente propuesta. Máximo 5 frases.\n"
        f"Código: {prop.get('codigo')}\n"
        f"Nombre: {prop.get('nombre')}\n"
        f"Organización: {prop.get('organizacion')}\n"
        f"Datos: {prop.get('datos')}\n"
        f"Devuelve solo el resumen, sin encabezados ni viñetas."
    )
    sugerencia = await _chat(
        "Resumes propuestas para evaluadores. Sé objetivo y neutral.",
        text, session_suffix=f"resumen-{payload.propuesta_id[:8]}",
    )
    await audit(user, "ai_summary", "propuestas", payload.propuesta_id, detalle="resumen IA")
    return {"resumen": sugerencia, "marcado_como_sugerencia": True}


class ObservacionIn(BaseModel):
    evaluacion_id: str
    criterio_id: str
    puntaje: float


@router.post("/sugerencia-observacion")
async def sugerencia_observacion(payload: ObservacionIn, user: dict = Depends(get_current_user)):
    db = get_db()
    ev = await db.evaluaciones_individuales.find_one({"id": payload.evaluacion_id}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Evaluación no encontrada")
    prop = await db.propuestas.find_one({"id": ev["propuesta_id"]}, {"_id": 0})
    crit = await db.criterios.find_one({"id": payload.criterio_id}, {"_id": 0})
    if not crit:
        raise HTTPException(status_code=404, detail="Criterio no encontrado")
    text = (
        f"Sugiere una observación de evaluación (máximo 3 frases) para el siguiente caso:\n"
        f"Propuesta: {prop.get('nombre')} ({prop.get('organizacion')})\n"
        f"Criterio: {crit['nombre']} — {crit.get('descripcion','')}\n"
        f"Rango: {crit['puntaje_min']}–{crit['puntaje_max']}. Puntaje asignado: {payload.puntaje}.\n"
        f"La observación debe justificar el puntaje. Responde solo con la observación."
    )
    obs = await _chat(
        "Eres un evaluador experto. Tus observaciones son sobrias, claras y orientadas a evidencia.",
        text, session_suffix=f"obs-{payload.evaluacion_id[:8]}",
    )
    await audit(user, "ai_suggest", "evaluaciones_individuales", payload.evaluacion_id, detalle=f"sugerencia obs criterio {crit['nombre']}")
    return {"observacion_sugerida": obs, "marcado_como_sugerencia": True}


class ActaDraftIn(BaseModel):
    evaluacion_colectiva_id: str


@router.post("/borrador-acta-colectiva")
async def borrador_acta_colectiva(payload: ActaDraftIn, user: dict = Depends(get_current_user)):
    db = get_db()
    ev = await db.evaluaciones_colectivas.find_one({"id": payload.evaluacion_colectiva_id}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Evaluación colectiva no encontrada")
    prop = await db.propuestas.find_one({"id": ev["propuesta_id"]}, {"_id": 0})
    terna = await db.ternas.find_one({"id": ev["terna_id"]}, {"_id": 0})
    text = (
        f"Redacta un borrador de observación consolidada para acta colectiva (máximo 6 frases).\n"
        f"Propuesta: {prop.get('codigo')} - {prop.get('nombre')}\n"
        f"Organización: {prop.get('organizacion')}\n"
        f"Terna: {terna.get('codigo')} {terna.get('nombre')}\n"
        f"Puntaje final colectivo: {ev.get('puntaje_final')}\n"
        f"Puntajes por criterio: {ev.get('puntajes')}\n"
        f"Responde solo con el texto de la observación, sin firmas ni encabezados."
    )
    draft = await _chat(
        "Eres secretario técnico de comités evaluadores. Redactas observaciones consolidadas en español neutral, formal y respetuoso.",
        text, session_suffix=f"acta-{payload.evaluacion_colectiva_id[:8]}",
    )
    await audit(user, "ai_draft", "evaluaciones_colectivas", payload.evaluacion_colectiva_id, detalle="borrador acta IA")
    return {"borrador": draft, "marcado_como_sugerencia": True}


@router.get("/status")
async def ai_status(user: dict = Depends(get_current_user)):
    cfg = await get_ai_config()
    ready = False
    reason = "deshabilitado"
    if cfg.get("enabled"):
        if cfg.get("use_emergent_key"):
            ready = bool(os.environ.get("EMERGENT_LLM_KEY"))
            reason = "emergent_key_ok" if ready else "emergent_key_missing"
        else:
            ready = bool(cfg.get("byok_api_key"))
            reason = "byok_ok" if ready else "byok_missing"
    return {
        "ready": ready, "reason": reason,
        "provider": cfg.get("provider"),
        "model": cfg.get("model"),
        "mode": "emergent" if cfg.get("use_emergent_key") else "byok",
        "enabled": cfg.get("enabled", True),
    }
