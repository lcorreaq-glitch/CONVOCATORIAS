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


class CoherenciaIn(BaseModel):
    evaluacion_id: str
    tipo: Optional[str] = "individual"  # "individual" | "colectiva"


@router.post("/coherencia-evaluacion")
async def coherencia_evaluacion(payload: CoherenciaIn, user: dict = Depends(get_current_user)):
    """Analiza una evaluación y detecta posibles inconsistencias entre puntajes y observaciones."""
    import json as _json
    import re as _re
    db = get_db()
    coll = "evaluaciones_individuales" if payload.tipo != "colectiva" else "evaluaciones_colectivas"
    ev = await db[coll].find_one({"id": payload.evaluacion_id}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Evaluación no encontrada")
    prop = await db.propuestas.find_one({"id": ev["propuesta_id"]}, {"_id": 0}) or {}
    criterios = await db.criterios.find({"convocatoria_id": ev["convocatoria_id"]}, {"_id": 0}).to_list(500)
    crit_map = {c["id"]: c for c in criterios}

    puntajes = ev.get("puntajes") or {}
    observaciones = ev.get("observaciones") or {}
    obs_final = ev.get("observacion_final") or ev.get("observacion_consolidada") or ""

    items = []
    for cid, c in crit_map.items():
        items.append({
            "criterio": c.get("nombre"),
            "rango": f"{c.get('puntaje_min', 0)}-{c.get('puntaje_max', 100)}",
            "puntaje": puntajes.get(cid),
            "observacion": (observaciones.get(cid) or "").strip(),
        })

    prompt = (
        "Analiza esta evaluación y detecta INCONSISTENCIAS entre los puntajes asignados y las observaciones escritas. "
        "Buscas casos como: (a) puntaje alto con comentario negativo o crítico; (b) puntaje bajo con comentario elogioso; "
        "(c) observaciones contradictorias entre criterios; (d) criterios con puntaje pero sin observación que lo justifique; "
        "(e) observación final que contradice el conjunto de puntajes.\n\n"
        f"Propuesta: {prop.get('codigo')} - {prop.get('nombre')}\n"
        f"Organización: {prop.get('organizacion')}\n\n"
        f"Criterios y puntajes:\n{_json.dumps(items, ensure_ascii=False, indent=2)}\n\n"
        f"Observación final / consolidada del jurado:\n\"\"\"{obs_final}\"\"\"\n\n"
        "Responde ÚNICAMENTE en JSON válido (sin markdown, sin ```), con esta estructura exacta:\n"
        "{\n"
        '  "coherente": true|false,\n'
        '  "resumen": "frase ejecutiva máx 2 líneas",\n'
        '  "hallazgos": [\n'
        '    {"severidad":"alta|media|baja","criterio":"nombre o \'final\'","tipo":"puntaje_vs_observacion|contradiccion|sin_observacion|otro","descripcion":"qué encontraste"}\n'
        "  ]\n"
        "}\n"
        "Si la evaluación es razonablemente coherente, devuelve coherente=true y hallazgos vacío o solo de severidad baja."
    )

    raw = await _chat(
        "Eres un auditor experto de evaluaciones. Detectas incoherencias con criterio técnico y devuelves JSON estricto.",
        prompt, session_suffix=f"coh-{payload.evaluacion_id[:8]}",
    )
    # Limpieza defensiva (algunos modelos envuelven en ```json)
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = _re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = _re.sub(r"```$", "", cleaned).strip()
    try:
        data = _json.loads(cleaned)
    except Exception:
        # Si el modelo no devolvió JSON parseable, intentamos extraer el primer bloque {...}
        m = _re.search(r"\{[\s\S]*\}", cleaned)
        if m:
            try:
                data = _json.loads(m.group(0))
            except Exception:
                data = {"coherente": True, "resumen": "No se pudo analizar la respuesta de IA.", "hallazgos": [], "raw": raw}
        else:
            data = {"coherente": True, "resumen": "Respuesta IA sin estructura JSON.", "hallazgos": [], "raw": raw}

    # Normalización mínima
    data.setdefault("coherente", True)
    data.setdefault("resumen", "")
    data.setdefault("hallazgos", [])
    if not isinstance(data.get("hallazgos"), list):
        data["hallazgos"] = []

    await audit(user, "ai_coherencia", coll, payload.evaluacion_id,
                detalle=f"hallazgos={len(data.get('hallazgos') or [])} coherente={data.get('coherente')}")
    return data


class MejorarTextoIn(BaseModel):
    texto: str
    contexto: Optional[str] = "perfil_jurado"


@router.post("/mejorar-texto")
async def mejorar_texto(payload: MejorarTextoIn, user: dict = Depends(get_current_user)):
    """Mejora la redacción de un texto manteniendo el contenido. Útil para perfiles, descripciones."""
    if not payload.texto or len(payload.texto.strip()) < 5:
        raise HTTPException(status_code=400, detail="Texto vacío o demasiado corto")
    if len(payload.texto) > 4000:
        raise HTTPException(status_code=400, detail="Texto excede 4000 caracteres")

    sys_msg = {
        "perfil_jurado": (
            "Eres un editor profesional especializado en perfiles institucionales. "
            "Reescribe el siguiente perfil de jurado/evaluador con redacción clara, profesional y concisa "
            "en español neutro, manteniendo toda la información factual. "
            "Estructura: profesión, formación, especialización y experiencia relevante. "
            "Máximo 4 frases. Devuelve SOLO el texto mejorado, sin comillas ni encabezados."
        ),
        "descripcion": (
            "Eres un editor profesional. Reescribe el siguiente texto de manera clara y concisa "
            "en español neutro, manteniendo toda la información. Devuelve solo el texto mejorado."
        ),
    }.get(payload.contexto, "Mejora la redacción manteniendo el contenido.")

    mejorado = await _chat(sys_msg, payload.texto.strip(), session_suffix=f"mejorar-{user.get('id','')[:6]}")
    await audit(user, "ai_mejorar", "textos", payload.contexto, detalle=f"len_in={len(payload.texto)} len_out={len(mejorado)}")
    return {"texto_mejorado": mejorado, "texto_original": payload.texto}


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
