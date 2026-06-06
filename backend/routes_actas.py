"""KRINOS - Actas configurables (Individual por Jurado / Colectiva por Terna / Subregional).

Cada plantilla se almacena en convocatoria.configuracion.acta_templates[tipo] = {
  encabezado, considerandos, certificacion, tabla_titulo, tabla_subtitulo, texto_cierre,
  pie_firmantes_titulo
}

Render: ReportLab. Merge tags resueltos en _render_text(...).
"""
import io
import re
import os
import base64
import hashlib
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Body
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib import colors as rl_colors
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
)
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF

from db import get_db, now_iso
from auth import get_current_user, require_roles, audit

router = APIRouter(prefix="/api", tags=["actas"])


# ============================================================
# CÓDIGO DE VERIFICACIÓN + QR
# ============================================================
def _acta_verification_code(tipo: str, conv_id: str, entity_id: str) -> str:
    """Genera un código corto determinista para verificación pública.
    tipo: individual | colectiva | subregional
    entity_id: jurado_id | terna_id | f"{conv_id}:{subregion}"
    """
    raw = f"{tipo}|{conv_id}|{entity_id}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:12].upper()


def _public_base_url() -> str:
    """URL pública del frontend para construir el enlace de verificación.
    Usa REACT_APP_BACKEND_URL del archivo frontend/.env como única fuente de verdad.
    """
    try:
        with open("/app/frontend/.env", "r") as fh:
            for line in fh:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return os.environ.get("PUBLIC_BASE_URL", "")


def _build_qr_flowable(payload_url: str, size_cm: float = 2.8) -> Drawing:
    """Construye un Flowable con un QR de verificación."""
    qr = QrCodeWidget(payload_url)
    bounds = qr.getBounds()
    w = bounds[2] - bounds[0]
    h = bounds[3] - bounds[1]
    side = size_cm * cm
    d = Drawing(side, side, transform=[side / w, 0, 0, side / h, 0, 0])
    d.add(qr)
    return d


# ============================================================
# DEFAULT TEMPLATES (INC2026 — texto literal de los .docx)
# ============================================================
DEFAULT_INC2026_TEMPLATES = {
    "individual": {
        "encabezado": "ACTA DE EVALUACIÓN TÉCNICA INDIVIDUAL\nCONVOCATORIA PÚBLICA ESTÍMULOS E INICIATIVAS POR ANTIOQUIA FIRME 2026",
        "considerandos": (
            "a) La Convocatoria Pública Estímulos e Iniciativas por Antioquia Firme 2026, liderada por la "
            "Gobernación de Antioquia (Secretaría de Gobierno a través de la Dirección de Participación "
            "Comunitaria y Ciudadana), tiene como objetivo fortalecer las organizaciones comunales y sociales "
            "mediante el reconocimiento y financiación de iniciativas orientadas al desarrollo territorial, la "
            "participación ciudadana y la inclusión social.\n\n"
            "b) El proceso evaluativo para esta vigencia se encuentra centralizado en aplicativo digital, "
            "garantizando las condiciones técnicas para una evaluación ágil, transparente, trazable y coherente "
            "con los lineamientos vigentes.\n\n"
            "c) Fui designado(a) como jurado evaluador para participar en la revisión individual de las propuestas "
            "habilitadas por mi trayectoria y conocimiento del territorio, declarando no tener ninguna inhabilidad, "
            "incompatibilidad o impedimento legal o ético para ejercer dicho rol.\n\n"
            "d) Participé en el proceso de inducción metodológica, ingresé al aplicativo digital, accedí a la "
            "documentación técnica, soportes y ejecuté la revisión de manera independiente conforme a los criterios "
            "técnicos de evaluación 2026."
        ),
        "certificacion": (
            "Al recibir el conjunto de iniciativas asignadas en mi panel digital, no me encuentro incurso(a) en ninguna "
            "causal de inhabilidad, incompatibilidad o conflicto de interés. Declaro no tener vínculos familiares, "
            "laborales, contractuales, económicos ni asociativos con las organizaciones postulantes o sus integrantes "
            "que puedan comprometer mi independencia y objetividad. Desarrollé el estudio y evaluación individual de las "
            "propuestas asignadas en los tiempos estipulados por el cronograma oficial, accediendo a la documentación "
            "exclusivamente a través de la plataforma de la Gobernación de Antioquia. Apliqué los cinco (5) criterios "
            "técnicos de evaluación (Incidencia e impacto, Participación e inclusión, Fortalecimiento institucional, "
            "Capacidad organizativa y Medio ambiente), asignando los puntajes numéricos justificados cualitativamente "
            "(hasta 95 puntos posibles). Comprendo y valido que el sistema digital calculó de manera automática los "
            "5 puntos adicionales de priorización territorial (municipios PDET, Sentencia Río Atrato o Sentencia Río Cauca). "
            "Tengo plena claridad y certifico que los puntajes específicos que asigné en el aplicativo para los enfoques "
            "diferenciales de desempate (mujeres, discapacidad y etnias) NO se suman ni alteran mi calificación técnica "
            "general de la propuesta (que tiene un tope máximo legal de 100 puntos), ya que su uso en el sistema está "
            "destinado única y exclusivamente a definir el orden en el ranking general en caso de empate en la línea de corte. "
            "Realicé la calificación con total independencia, transparencia y objetividad, actuando bajo los principios "
            "éticos de la función pública, y me comprometo a guardar estricta reserva y confidencialidad sobre la "
            "información leída."
        ),
        "tabla_titulo": "PUNTAJES ASIGNADOS EN EL APLICATIVO",
        "tabla_subtitulo": "La siguiente tabla resume las calificaciones definitivas ingresadas y guardadas por el jurado en la plataforma digital para la subregión asignada.",
        "texto_cierre": (
            "Nota: Esta acta certifica el cierre del \"Momento 1\" de la evaluación, y sus resultados son el insumo "
            "oficial para la sesión de deliberación y consenso subregional.\n\n"
            "Este documento se firma a los {{fecha_dia}} días del mes de {{fecha_mes}} de {{fecha_anio}}, "
            "como constancia de la culminación exitosa del proceso de evaluación individual."
        ),
        "pie_firmantes_titulo": "FIRMA DEL JURADO EVALUADOR",
    },
    "colectiva_terna": {
        "encabezado": "ACTA DE EVALUACIÓN TÉCNICA COLECTIVA POR TERNA\nCONVOCATORIA PÚBLICA ESTÍMULOS E INICIATIVAS POR ANTIOQUIA FIRME 2026",
        "considerandos": (
            "a) La Convocatoria Pública Estímulos e Iniciativas por Antioquia Firme 2026, liderada por la "
            "Gobernación de Antioquia (Secretaría de Gobierno a través de la Dirección de Participación "
            "Comunitaria y Ciudadana), tiene como propósito fortalecer las organizaciones comunales y sociales "
            "mediante el reconocimiento a iniciativas que promuevan el desarrollo territorial, la inclusión social "
            "y la participación ciudadana.\n\n"
            "b) Para la vigencia 2026, el proceso evaluativo se centralizó en el aplicativo, garantizando "
            "condiciones de agilidad, transparencia, trazabilidad y cálculo automatizado de puntajes adicionales "
            "y criterios de desempate.\n\n"
            "c) Conforme a la metodología del proceso, una vez finalizada la fase de evaluación individual en la "
            "plataforma, la terna de jurados asignada a la subregión debe llevar a cabo una sesión de deliberación "
            "colectiva, con el propósito de verificar la consistencia de criterios, armonizar observaciones y "
            "validar los resultados y clasificaciones que arroja el sistema.\n\n"
            "d) Los(as) suscritos(as) jurados participamos en dicha sesión de deliberación en la fecha señalada, "
            "revisando en conjunto las justificaciones técnicas consignadas en el aplicativo y acordando, por "
            "consenso, el cierre del proceso para nuestra subregión conforme a las directrices de la convocatoria."
        ),
        "certificacion": (
            "Ninguno de los integrantes de la terna presenta conflicto de interés, inhabilidad o incompatibilidad "
            "respecto a las iniciativas evaluadas y hemos actuado en todas las fases con independencia, "
            "imparcialidad y rigor técnico. Durante la sesión revisamos de manera detallada las evaluaciones "
            "individuales consolidadas en el aplicativo y las observaciones cualitativas que las sustentan. "
            "Validamos que el aplicativo digital procesó correctamente los cálculos finales, incluyendo la "
            "priorización territorial (+5 puntos) y la aplicación estricta de las reglas de desempate "
            "(primer registro, mayor impacto, mayor inclusión, enfoque en mujeres, enfoque en discapacidad, "
            "enfoque étnico y sorteo, en ese orden), basándose única y exclusivamente en los datos y "
            "valoraciones que ingresamos previamente en nuestra evaluación técnica. Garantizamos que el proceso "
            "de deliberación se desarrolló bajo los principios de legalidad, objetividad, transparencia y equidad, "
            "y que las decisiones que avalamos representan el consenso del cuerpo evaluador de la subregión."
        ),
        "tabla_titulo": "RESULTADOS CONSOLIDADOS POR EL APLICATIVO",
        "tabla_subtitulo": "La siguiente tabla oficializa el listado de las propuestas evaluadas por la terna, con el puntaje total definitivo calculado por la plataforma y la observación cualitativa de consenso.",
        "texto_cierre": (
            "Este documento se firma el día {{fecha_dia}} del mes de {{fecha_mes}} de {{fecha_anio}}, como "
            "constancia del cierre de la sesión de evaluación colectiva y la validación final de los resultados "
            "subregionales."
        ),
        "pie_firmantes_titulo": "JURADOS EVALUADORES (TERNA SUBREGIONAL)",
    },
    "subregional": {
        "encabezado": "ACTA DE EVALUACIÓN TÉCNICA COLECTIVA POR SUBREGIÓN\nCONVOCATORIA PÚBLICA ESTÍMULOS E INICIATIVAS POR ANTIOQUIA FIRME 2026",
        "considerandos": (
            "a) La Convocatoria Pública Estímulos e Iniciativas por Antioquia Firme 2026, liderada por la "
            "Gobernación de Antioquia (Secretaría de Gobierno a través de la Dirección de Participación "
            "Comunitaria y Ciudadana), tiene como propósito fortalecer las organizaciones comunales y sociales "
            "mediante el reconocimiento a iniciativas que promuevan el desarrollo territorial, la inclusión social "
            "y la participación ciudadana.\n\n"
            "b) Para la vigencia 2026, el proceso evaluativo se centralizó en el aplicativo, garantizando "
            "condiciones de agilidad, transparencia, trazabilidad y cálculo automatizado de puntajes adicionales "
            "y criterios de desempate.\n\n"
            "c) Conforme a la metodología del proceso, una vez finalizada la fase de evaluación individual en la "
            "plataforma, las ternas de jurados asignadas a la subregión {{subregion}} llevaron a cabo sesiones "
            "de deliberación colectiva, con el propósito de verificar la consistencia de criterios, armonizar "
            "observaciones y validar los resultados y clasificaciones que arroja el sistema.\n\n"
            "d) Los(as) suscritos(as) jurados participamos en dichas sesiones de deliberación, revisando en "
            "conjunto las justificaciones técnicas consignadas en el aplicativo y acordando, por consenso, el "
            "cierre del proceso para nuestra subregión conforme a las directrices de la convocatoria."
        ),
        "certificacion": (
            "Ninguno de los integrantes de este equipo subregional presenta conflicto de interés, inhabilidad o "
            "incompatibilidad respecto a las iniciativas evaluadas y hemos actuado en todas las fases con "
            "independencia, imparcialidad y rigor técnico. Durante la sesión revisamos de manera detallada las "
            "evaluaciones individuales consolidadas en el aplicativo y las observaciones cualitativas que las "
            "sustentan. Validamos que el aplicativo digital procesó correctamente los cálculos finales, incluyendo "
            "la priorización territorial (+5 puntos) y la aplicación estricta de las reglas de desempate "
            "(primer registro, mayor impacto, mayor inclusión, enfoque en mujeres, enfoque en discapacidad, "
            "enfoque étnico y sorteo, en ese orden), basándose única y exclusivamente en los datos y valoraciones "
            "que ingresamos previamente en nuestra evaluación técnica. Garantizamos que el proceso de deliberación "
            "se desarrolló bajo los principios de legalidad, objetividad, transparencia y equidad, y que las "
            "decisiones que avalamos representan el consenso del cuerpo evaluador de la subregión."
        ),
        "tabla_titulo": "RESULTADOS CONSOLIDADOS POR EL APLICATIVO",
        "tabla_subtitulo": "La siguiente tabla oficializa el listado de las propuestas evaluadas en la subregión, con el puntaje total definitivo calculado por la plataforma y la observación cualitativa de consenso.",
        "texto_cierre": (
            "Este documento se firma el día {{fecha_dia}} del mes de {{fecha_mes}} de {{fecha_anio}}, "
            "como constancia del cierre de la sesión de evaluación colectiva y la validación final de los "
            "resultados subregionales."
        ),
        "pie_firmantes_titulo": "JURADOS EVALUADORES (SUBREGIONALES)",
    },
}

DEFAULT_GENERIC_TEMPLATES = {
    "individual": {
        "encabezado": "ACTA DE EVALUACIÓN INDIVIDUAL\n{{convocatoria_nombre}}",
        "considerandos": "Edita este texto desde Configuración → Plantillas de Actas para personalizar los considerandos del acta individual.",
        "certificacion": "El(la) jurado certifica haber evaluado las propuestas asignadas con independencia, transparencia y rigor técnico.",
        "tabla_titulo": "PUNTAJES ASIGNADOS",
        "tabla_subtitulo": "Resumen de las calificaciones definitivas ingresadas por el jurado en la plataforma.",
        "texto_cierre": "Documento firmado el día {{fecha_dia}} del mes de {{fecha_mes}} de {{fecha_anio}}.",
        "pie_firmantes_titulo": "FIRMA DEL JURADO EVALUADOR",
    },
    "colectiva_terna": {
        "encabezado": "ACTA DE EVALUACIÓN COLECTIVA POR TERNA\n{{convocatoria_nombre}}",
        "considerandos": "Edita este texto desde Configuración → Plantillas de Actas para personalizar los considerandos del acta colectiva.",
        "certificacion": "La terna evaluadora certifica haber consolidado las evaluaciones individuales con base en el aplicativo.",
        "tabla_titulo": "RESULTADOS CONSOLIDADOS POR LA TERNA",
        "tabla_subtitulo": "Listado de propuestas evaluadas con el puntaje total definitivo.",
        "texto_cierre": "Documento firmado el día {{fecha_dia}} del mes de {{fecha_mes}} de {{fecha_anio}}.",
        "pie_firmantes_titulo": "INTEGRANTES DE LA TERNA",
    },
    "subregional": {
        "encabezado": "ACTA SUBREGIONAL\n{{convocatoria_nombre}}",
        "considerandos": "Edita este texto desde Configuración → Plantillas de Actas para personalizar los considerandos del acta subregional.",
        "certificacion": "Los jurados de la subregión {{subregion}} certifican el cierre del proceso de evaluación.",
        "tabla_titulo": "RESULTADOS SUBREGIONALES",
        "tabla_subtitulo": "Listado de propuestas evaluadas en la subregión.",
        "texto_cierre": "Documento firmado el día {{fecha_dia}} del mes de {{fecha_mes}} de {{fecha_anio}}.",
        "pie_firmantes_titulo": "JURADOS EVALUADORES",
    },
}

MERGE_TAGS = [
    {"tag": "{{convocatoria_nombre}}", "descripcion": "Nombre de la convocatoria"},
    {"tag": "{{convocatoria_codigo}}", "descripcion": "Código de la convocatoria"},
    {"tag": "{{convocatoria_vigencia}}", "descripcion": "Vigencia (año) de la convocatoria"},
    {"tag": "{{fecha}}", "descripcion": "Fecha actual (DD de mes de AAAA)"},
    {"tag": "{{fecha_dia}}", "descripcion": "Día actual (1-31)"},
    {"tag": "{{fecha_mes}}", "descripcion": "Mes actual en letras"},
    {"tag": "{{fecha_anio}}", "descripcion": "Año actual"},
    {"tag": "{{jurado_nombre}}", "descripcion": "Nombre del jurado (solo Individual)"},
    {"tag": "{{jurado_documento}}", "descripcion": "Cédula del jurado (solo Individual)"},
    {"tag": "{{subregion}}", "descripcion": "Subregión asignada"},
    {"tag": "{{terna_codigo}}", "descripcion": "Código de la terna (solo Colectiva)"},
]

MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def _render_text(text: str, ctx: dict) -> str:
    if not text:
        return ""
    out = text
    for k, v in ctx.items():
        out = out.replace("{{" + k + "}}", str(v) if v is not None else "")
    return out


def _build_ctx(conv: dict, jurado: dict = None, subregion: str = None, terna: dict = None) -> dict:
    now = datetime.now()
    return {
        "convocatoria_nombre": conv.get("nombre", "") if conv else "",
        "convocatoria_codigo": conv.get("codigo", "") if conv else "",
        "convocatoria_vigencia": str(conv.get("vigencia", "")) if conv else "",
        "fecha": f"{now.day} de {MESES_ES[now.month-1]} de {now.year}",
        "fecha_dia": str(now.day),
        "fecha_mes": MESES_ES[now.month-1],
        "fecha_anio": str(now.year),
        "jurado_nombre": (jurado or {}).get("nombre", ""),
        "jurado_documento": ((jurado or {}).get("datos") or {}).get("cedula", ""),
        "subregion": subregion or ", ".join((jurado or {}).get("subregiones") or []) or "",
        "terna_codigo": (terna or {}).get("codigo", "") if terna else "",
    }


def _is_inc2026(conv: dict) -> bool:
    return (conv or {}).get("codigo", "").upper() == "INC2026"


async def _get_template(db, conv: dict, tipo: str) -> dict:
    """Devuelve la plantilla efectiva del acta haciendo merge del default + lo guardado.
    Si el admin solo editó un campo, los demás siguen siendo el default (no quedan vacíos)."""
    config = conv.get("configuracion") or {}
    saved = (config.get("acta_templates") or {}).get(tipo) or {}
    base = DEFAULT_INC2026_TEMPLATES if _is_inc2026(conv) else DEFAULT_GENERIC_TEMPLATES
    default = base.get(tipo, DEFAULT_GENERIC_TEMPLATES[tipo])
    # Merge: default + saved (saved sobrescribe solo los campos no vacíos)
    merged = dict(default)
    for k, v in saved.items():
        if v not in (None, ""):
            merged[k] = v
    return merged


def _get_branding(conv: dict) -> dict:
    """Devuelve {header_image_url, footer_image_url} configurados en la convocatoria."""
    config = (conv or {}).get("configuracion") or {}
    branding = config.get("acta_branding") or {}
    return {
        "header_image_url": branding.get("header_image_url"),
        "footer_image_url": branding.get("footer_image_url"),
    }


# ============================================================
# CRUD PLANTILLAS
# ============================================================
@router.get("/convocatorias/{cid}/acta-templates")
async def get_acta_templates(cid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    conv = await db.convocatorias.find_one({"id": cid}, {"_id": 0})
    if not conv:
        raise HTTPException(404, "Convocatoria no encontrada")
    inc = _is_inc2026(conv)
    base = DEFAULT_INC2026_TEMPLATES if inc else DEFAULT_GENERIC_TEMPLATES
    saved = (conv.get("configuracion") or {}).get("acta_templates") or {}
    uso_subregional = (conv.get("configuracion") or {}).get("uso_acta_subregional", inc)
    result = {}
    for tipo in ("individual", "colectiva_terna", "subregional"):
        if tipo in saved:
            result[tipo] = {**base.get(tipo, {}), **saved[tipo], "_is_default": False}
        else:
            result[tipo] = {**base.get(tipo, {}), "_is_default": True}
    return {
        "templates": result,
        "merge_tags": MERGE_TAGS,
        "uso_acta_subregional": uso_subregional,
        "is_inc2026": inc,
    }


@router.patch("/convocatorias/{cid}/acta-templates/{tipo}")
async def update_acta_template(cid: str, tipo: str, payload: dict = Body(...),
                                user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    if tipo not in ("individual", "colectiva_terna", "subregional"):
        raise HTTPException(400, "Tipo inválido")
    db = get_db()
    conv = await db.convocatorias.find_one({"id": cid})
    if not conv:
        raise HTTPException(404, "Convocatoria no encontrada")
    allowed = {"encabezado", "considerandos", "certificacion", "tabla_titulo",
               "tabla_subtitulo", "texto_cierre", "pie_firmantes_titulo"}
    safe = {k: v for k, v in payload.items() if k in allowed}
    config = conv.get("configuracion") or {}
    templates = config.get("acta_templates") or {}
    templates[tipo] = {**(templates.get(tipo) or {}), **safe}
    config["acta_templates"] = templates
    await db.convocatorias.update_one({"id": cid}, {"$set": {"configuracion": config}})
    await audit(user, "update", "acta_templates", cid, valor_nuevo={"tipo": tipo})
    return {"ok": True, "tipo": tipo, "template": templates[tipo]}


@router.patch("/convocatorias/{cid}/uso-acta-subregional")
async def toggle_uso_subregional(cid: str, payload: dict = Body(...),
                                  user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    conv = await db.convocatorias.find_one({"id": cid})
    if not conv:
        raise HTTPException(404, "Convocatoria no encontrada")
    config = conv.get("configuracion") or {}
    config["uso_acta_subregional"] = bool(payload.get("enabled", False))
    await db.convocatorias.update_one({"id": cid}, {"$set": {"configuracion": config}})
    return {"ok": True, "uso_acta_subregional": config["uso_acta_subregional"]}


@router.get("/convocatorias/{cid}/acta-branding")
async def get_acta_branding(cid: str, user: dict = Depends(get_current_user)):
    """Devuelve las imágenes header/footer institucionales del acta."""
    db = get_db()
    conv = await db.convocatorias.find_one({"id": cid}, {"_id": 0})
    if not conv:
        raise HTTPException(404, "Convocatoria no encontrada")
    return _get_branding(conv)


@router.patch("/convocatorias/{cid}/acta-branding")
async def update_acta_branding(cid: str, payload: dict = Body(...),
                                user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    """Guarda imágenes institucionales (data URLs) para header y/o footer del acta.
    Payload acepta header_image_url y/o footer_image_url (string data URL o None para limpiar)."""
    db = get_db()
    conv = await db.convocatorias.find_one({"id": cid})
    if not conv:
        raise HTTPException(404, "Convocatoria no encontrada")
    config = conv.get("configuracion") or {}
    branding = config.get("acta_branding") or {}
    if "header_image_url" in payload:
        branding["header_image_url"] = payload["header_image_url"] or None
    if "footer_image_url" in payload:
        branding["footer_image_url"] = payload["footer_image_url"] or None
    config["acta_branding"] = branding
    await db.convocatorias.update_one({"id": cid}, {"$set": {"configuracion": config}})
    await audit(user, "update", "acta_branding", cid)
    return {"ok": True, "branding": _get_branding({"configuracion": config})}


# ============================================================
# STATUS — Quiénes están listos
# ============================================================
@router.get("/actas-pendientes")
async def list_actas_pendientes(convocatoria_id: str, user: dict = Depends(get_current_user)):
    """Devuelve el estado de las 3 categorías de actas para la UI."""
    db = get_db()
    conv = await db.convocatorias.find_one({"id": convocatoria_id})
    if not conv:
        raise HTTPException(404, "Convocatoria no encontrada")
    config = conv.get("configuracion") or {}
    inc = _is_inc2026(conv)
    uso_subregional = bool(config.get("uso_acta_subregional", inc))

    # --- INDIVIDUAL POR JURADO ---
    jurados = await db.jurados.find({"convocatoria_id": convocatoria_id}, {"_id": 0}).to_list(2000)
    individuales = []
    for j in jurados:
        evs = await db.evaluaciones_individuales.find({
            "convocatoria_id": convocatoria_id, "jurado_id": j["id"], "etapa": {"$ne": "colectiva"}
        }, {"_id": 0}).to_list(500)
        total = len(evs)
        if total == 0:
            continue
        finalizadas = sum(1 for e in evs if e.get("estado") in ("Finalizada", "Firmada"))
        forzada = bool(((j.get("datos") or {}).get("acta_individual_forzada")))
        firma_url = ((j.get("datos") or {}).get("firma_url"))
        cedula = ((j.get("datos") or {}).get("cedula"))
        invalidada = bool(((j.get("datos") or {}).get("acta_invalidada_por_reapertura")))
        ya_firmada = bool(((j.get("datos") or {}).get("acta_individual_firma_at")))
        # Si una evaluación fue reabierta, el acta puede quedar en estado "Reabierta" o "Borrador"
        reabiertas = sum(1 for e in evs if e.get("estado") == "Reabierta")
        if invalidada or reabiertas > 0:
            # El acta requiere re-firma porque hubo reapertura tras firma anterior.
            if firma_url:
                estado = "Re-firma pendiente"
            else:
                estado = "Requiere firma"
        elif forzada or finalizadas >= total:
            if ya_firmada:
                estado = "Firmada"
            elif firma_url:
                estado = "Emitible"
            else:
                estado = "Requiere firma"
        else:
            estado = "Pendiente"
        individuales.append({
            "jurado_id": j["id"], "jurado_nombre": j["nombre"], "jurado_email": j.get("email"),
            "subregiones": j.get("subregiones") or [], "documento": cedula,
            "total": total, "finalizadas": finalizadas, "reabiertas": reabiertas, "estado": estado,
            "forzada": forzada, "tiene_firma": bool(firma_url),
            "firma_acta_at": ((j.get("datos") or {}).get("acta_individual_firma_at")),
            "acta_invalidada": invalidada,
            "porcentaje": round((finalizadas / total) * 100) if total else 0,
        })

    # --- COLECTIVA POR TERNA ---
    ternas = await db.ternas.find({"convocatoria_id": convocatoria_id}, {"_id": 0}).to_list(500)
    colectivas = []
    for t in ternas:
        evs_col = await db.evaluaciones_colectivas.find({
            "convocatoria_id": convocatoria_id, "terna_id": t["id"]
        }, {"_id": 0}).to_list(500)
        total = len(evs_col)
        if total == 0:
            continue
        cerradas = sum(1 for e in evs_col if e.get("estado") in ("Cerrada", "Firmada"))
        firmas = (t.get("datos") or {}).get("firmas_acta_colectiva") or {}
        integrantes = t.get("integrantes") or []
        firmas_completas = sum(1 for i in integrantes if firmas.get(i.get("jurado_id")))
        if cerradas >= total and firmas_completas >= len(integrantes) and integrantes:
            estado = "Emitible"
        elif cerradas >= total:
            estado = "Falta firma terna"
        else:
            estado = "Pendiente"
        colectivas.append({
            "terna_id": t["id"], "terna_codigo": t["codigo"], "terna_nombre": t.get("nombre"),
            "subregion": t.get("subregion"), "integrantes": len(integrantes),
            "integrantes_ids": [i.get("jurado_id") for i in integrantes if i.get("jurado_id")],
            "total": total, "cerradas": cerradas, "firmas": firmas_completas,
            "estado": estado, "porcentaje": round((cerradas / total) * 100) if total else 0,
        })

    # --- SUBREGIONAL (solo si uso_acta_subregional=True) ---
    subregionales = []
    if uso_subregional:
        # Agrupar por subregion
        subregiones = sorted({s for j in jurados for s in (j.get("subregiones") or [])})
        for sub in subregiones:
            # Buscar propuestas de esa subregión
            propuestas_sub = await db.propuestas.find({
                "convocatoria_id": convocatoria_id,
                "$or": [{"subregion": sub}, {"datos.subregion": sub}]
            }, {"_id": 0}).to_list(2000)
            propuestas_ids = [p["id"] for p in propuestas_sub]
            if not propuestas_ids:
                continue
            evs_col = await db.evaluaciones_colectivas.find({
                "convocatoria_id": convocatoria_id, "propuesta_id": {"$in": propuestas_ids}
            }, {"_id": 0}).to_list(2000)
            total = len(propuestas_ids)
            cerradas = sum(1 for e in evs_col if e.get("estado") in ("Cerrada", "Firmada"))
            sub_doc = await db.actas_subregionales.find_one({
                "convocatoria_id": convocatoria_id, "subregion": sub
            }, {"_id": 0})
            firmas = (sub_doc or {}).get("firmas") or {}
            jurados_sub = [j for j in jurados if sub in (j.get("subregiones") or [])]
            firmadas = sum(1 for j in jurados_sub if firmas.get(j["id"]))
            if cerradas >= total and firmadas >= len(jurados_sub) and jurados_sub:
                estado = "Emitible"
            elif cerradas >= total:
                estado = "Falta firmar"
            else:
                estado = "Pendiente"
            subregionales.append({
                "subregion": sub, "total": total, "cerradas": cerradas,
                "jurados": len(jurados_sub), "firmas": firmadas,
                "estado": estado, "porcentaje": round((cerradas / total) * 100) if total else 0,
            })

    # Subregiones donde el jurado autenticado tiene asignaciones (para filtro UI)
    mis_subregiones = []
    if user.get("role") == "jurado" and user.get("jurado_id"):
        me = next((j for j in jurados if j["id"] == user["jurado_id"]), None)
        if me:
            mis_subregiones = list(me.get("subregiones") or [])

    return {
        "individual": individuales, "colectiva_terna": colectivas, "subregional": subregionales,
        "uso_acta_subregional": uso_subregional, "is_inc2026": inc,
        "mis_subregiones": mis_subregiones,
    }


# ============================================================
# FIRMA INDIVIDUAL (jurado firma SU acta agregada al terminar todas sus evals)
# ============================================================
@router.post("/actas/individual-jurado/{jurado_id}/firmar")
async def firmar_acta_individual(jurado_id: str, user: dict = Depends(get_current_user)):
    """El jurado firma SU acta individual única (agrupada con todas sus evaluaciones).
    Pre-requisitos:
      - Solo el propio jurado puede firmarla (a menos que sea admin).
      - Todas sus evaluaciones individuales deben estar Finalizadas.
      - Debe tener firma cargada en su perfil.
    """
    db = get_db()
    jur = await db.jurados.find_one({"id": jurado_id})
    if not jur:
        raise HTTPException(404, "Jurado no encontrado")
    # Solo el propio jurado o un admin pueden firmar
    is_admin = user.get("role") in ("admin_general", "admin_convocatoria")
    if not is_admin and user.get("jurado_id") != jurado_id:
        raise HTTPException(403, "Solo puedes firmar tu propia acta individual.")
    firma_url = ((jur.get("datos") or {}).get("firma_url"))
    if not firma_url:
        raise HTTPException(400, "Debes cargar tu firma en Mi Perfil antes de firmar el acta.")
    # Verificar que todas las evals estén finalizadas
    evs = await db.evaluaciones_individuales.find({
        "convocatoria_id": jur["convocatoria_id"], "jurado_id": jurado_id, "etapa": {"$ne": "colectiva"}
    }).to_list(500)
    total = len(evs)
    if total == 0:
        raise HTTPException(400, "No tienes evaluaciones individuales para firmar.")
    pend = sum(1 for e in evs if e.get("estado") not in ("Finalizada", "Firmada"))
    if pend > 0 and not ((jur.get("datos") or {}).get("acta_individual_forzada")):
        raise HTTPException(400, f"Te faltan {pend} evaluación(es) por finalizar antes de firmar el acta.")
    # Marcar firmas en cada evaluación + en datos del jurado
    await db.evaluaciones_individuales.update_many(
        {"convocatoria_id": jur["convocatoria_id"], "jurado_id": jurado_id, "etapa": {"$ne": "colectiva"}},
        {"$set": {"estado": "Firmada", "fecha_firma": now_iso()}},
    )
    datos = jur.get("datos") or {}
    datos["acta_individual_firma_at"] = now_iso()
    # Limpiar bandera de invalidación si existía (caso re-firma)
    re_firma = bool(datos.get("acta_invalidada_por_reapertura"))
    datos.pop("acta_invalidada_por_reapertura", None)
    datos.pop("acta_invalidada_at", None)
    await db.jurados.update_one({"id": jurado_id}, {"$set": {"datos": datos}})
    await audit(user, "sign", "actas", jurado_id, detalle=f"acta_individual ({total} evals){' [RE-FIRMA]' if re_firma else ''}")
    return {"ok": True, "firmadas": total, "re_firma": re_firma}


# ============================================================
# FORZAR ACTIVACIÓN INDIVIDUAL
# ============================================================
@router.post("/actas/individual-jurado/{jurado_id}/forzar")
async def forzar_acta_individual(jurado_id: str,
                                  user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    jur = await db.jurados.find_one({"id": jurado_id})
    if not jur:
        raise HTTPException(404, "Jurado no encontrado")
    datos = jur.get("datos") or {}
    datos["acta_individual_forzada"] = True
    datos["acta_individual_forzada_at"] = now_iso()
    datos["acta_individual_forzada_by"] = user["username"]
    await db.jurados.update_one({"id": jurado_id}, {"$set": {"datos": datos}})
    await audit(user, "update", "jurados", jurado_id, detalle="acta_individual_forzada")
    return {"ok": True}


# ============================================================
# FIRMA SUBREGIONAL
# ============================================================
@router.post("/actas/subregional/firmar")
async def firmar_subregional(payload: dict = Body(...), user: dict = Depends(get_current_user)):
    """Un jurado registra su firma en el acta subregional. payload: {convocatoria_id, subregion}"""
    cid = payload.get("convocatoria_id")
    sub = payload.get("subregion")
    if not cid or not sub:
        raise HTTPException(400, "Faltan convocatoria_id o subregion")
    if not user.get("jurado_id"):
        raise HTTPException(403, "Solo jurados pueden firmar")
    db = get_db()
    jur = await db.jurados.find_one({"id": user["jurado_id"]})
    if not jur:
        raise HTTPException(404, "Jurado no encontrado")
    if sub not in (jur.get("subregiones") or []):
        raise HTTPException(403, "No perteneces a esta subregión")
    firma_url = (jur.get("datos") or {}).get("firma_url")
    if not firma_url:
        raise HTTPException(400, "Carga primero tu firma en Mi Perfil")
    existing = await db.actas_subregionales.find_one({"convocatoria_id": cid, "subregion": sub})
    firmas = (existing or {}).get("firmas") or {}
    firmas[jur["id"]] = {"fecha": now_iso(), "firma_url": firma_url, "nombre": jur["nombre"]}
    if existing:
        await db.actas_subregionales.update_one(
            {"convocatoria_id": cid, "subregion": sub},
            {"$set": {"firmas": firmas, "updated_at": now_iso()}}
        )
    else:
        await db.actas_subregionales.insert_one({
            "id": f"actasub-{cid[:6]}-{sub.lower().replace(' ','')[:10]}",
            "convocatoria_id": cid, "subregion": sub, "firmas": firmas,
            "created_at": now_iso(),
        })
    return {"ok": True, "firmas_totales": len(firmas)}


@router.post("/actas/colectiva-terna/{terna_id}/firmar")
async def firmar_colectiva_terna(terna_id: str, user: dict = Depends(get_current_user)):
    """Un integrante de la terna firma el acta colectiva por terna."""
    db = get_db()
    if not user.get("jurado_id"):
        raise HTTPException(403, "Solo jurados pueden firmar")
    terna = await db.ternas.find_one({"id": terna_id})
    if not terna:
        raise HTTPException(404, "Terna no encontrada")
    integrantes = terna.get("integrantes") or []
    if not any(i.get("jurado_id") == user["jurado_id"] for i in integrantes):
        raise HTTPException(403, "No perteneces a esta terna")
    jur = await db.jurados.find_one({"id": user["jurado_id"]})
    firma_url = (jur.get("datos") or {}).get("firma_url")
    if not firma_url:
        raise HTTPException(400, "Carga primero tu firma en Mi Perfil")
    datos = terna.get("datos") or {}
    firmas = datos.get("firmas_acta_colectiva") or {}
    firmas[user["jurado_id"]] = {"fecha": now_iso(), "firma_url": firma_url, "nombre": jur["nombre"]}
    datos["firmas_acta_colectiva"] = firmas
    # Si todos los integrantes re-firmaron tras una reapertura, limpiar el flag de invalidación.
    integrantes_ids = {i.get("jurado_id") for i in integrantes if i.get("jurado_id")}
    if datos.get("acta_colectiva_invalidada_por_reapertura") and integrantes_ids.issubset(set(firmas.keys())):
        datos.pop("acta_colectiva_invalidada_por_reapertura", None)
        datos["acta_colectiva_refirmada_at"] = now_iso()
    await db.ternas.update_one({"id": terna_id}, {"$set": {"datos": datos}})
    return {"ok": True, "firmas_totales": len(firmas)}


# ============================================================
# RENDERIZADO PDF — utilidades
# ============================================================
def _base_styles():
    styles = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("title", parent=styles["Heading1"], fontSize=13, alignment=TA_CENTER,
                                spaceAfter=10, textColor=rl_colors.HexColor("#0F5E54"), fontName="Helvetica-Bold"),
        "h2": ParagraphStyle("h2", parent=styles["Heading2"], fontSize=10.5, alignment=TA_LEFT,
                             spaceAfter=6, spaceBefore=8, textColor=rl_colors.HexColor("#1A1F2C"), fontName="Helvetica-Bold"),
        "body": ParagraphStyle("body", parent=styles["BodyText"], fontSize=9.5, leading=13.5,
                               alignment=TA_JUSTIFY, textColor=rl_colors.HexColor("#1A1F2C")),
        "small": ParagraphStyle("small", parent=styles["BodyText"], fontSize=8.5, leading=11,
                                alignment=TA_LEFT, textColor=rl_colors.HexColor("#5E6878")),
        "meta": ParagraphStyle("meta", parent=styles["BodyText"], fontSize=9, alignment=TA_LEFT,
                               textColor=rl_colors.HexColor("#3F4856")),
        "fecha": ParagraphStyle("fecha", parent=styles["BodyText"], fontSize=10, alignment=TA_LEFT,
                                spaceAfter=10, textColor=rl_colors.HexColor("#1A1F2C"), fontName="Helvetica-Bold"),
    }


def _header_block(elements, ctx, conv, tmpl, st, branding):
    # 1) Header image (imagen institucional, ej. logo + cabezote de la convocatoria)
    header_img = _decoded_image(branding.get("header_image_url"), width=17*cm, height=3.5*cm) if branding else None
    if header_img:
        elements.append(header_img)
        elements.append(Spacer(1, 8))

    # 2) Card de convocatoria — siempre presente para identificar el documento
    conv_codigo = (conv or {}).get("codigo", "—")
    conv_nombre = (conv or {}).get("nombre", "Convocatoria")
    conv_vigencia = (conv or {}).get("vigencia", "")
    conv_entidad = (conv or {}).get("entidad", "") or (conv or {}).get("organizacion", "")
    conv_table = Table([[
        Paragraph(f"<b>CONVOCATORIA</b>", st["small"]),
        Paragraph(f"<b>{conv_codigo}</b> · {conv_nombre}{(' · '+str(conv_vigencia)) if conv_vigencia else ''}", st["body"]),
    ], [
        Paragraph(f"<b>ENTIDAD</b>", st["small"]) if conv_entidad else Paragraph("", st["small"]),
        Paragraph(conv_entidad, st["body"]) if conv_entidad else Paragraph("", st["body"]),
    ]], colWidths=[3.2*cm, 13.8*cm])
    conv_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), rl_colors.HexColor("#F0F7F5")),
        ("BOX", (0, 0), (-1, -1), 0.4, rl_colors.HexColor("#CDE7E1")),
        ("LINEBEFORE", (0, 0), (0, -1), 3, rl_colors.HexColor("#14776A")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(conv_table)
    elements.append(Spacer(1, 10))

    # 3) Fecha + título del acta
    elements.append(Paragraph(f"FECHA: {ctx['fecha']}", st["fecha"]))
    encabezado = _render_text(tmpl.get("encabezado", ""), ctx)
    for line in encabezado.split("\n"):
        elements.append(Paragraph(line.strip().replace("&", "&amp;"), st["title"]))
    elements.append(Spacer(1, 8))


def _footer_block(elements, branding, st):
    """DEPRECATED: el footer se dibuja ahora vía canvas en cada página (ver _make_footer_drawer)."""
    return None


def _make_footer_drawer(branding: dict, footer_height_cm: float = 2.4):
    """Devuelve una función onPage(canvas, doc) que dibuja la imagen footer en el pie de cada página."""
    footer_url = (branding or {}).get("footer_image_url")
    if not footer_url or not footer_url.startswith("data:"):
        return None
    try:
        b64 = footer_url.split(",", 1)[1]
        raw = base64.b64decode(b64)
    except Exception:
        return None

    def _on_page(canv, doc):
        try:
            from reportlab.lib.utils import ImageReader
            from reportlab.lib.pagesizes import A4
            page_w, _ = A4
            img = ImageReader(io.BytesIO(raw))
            iw, ih = img.getSize()
            target_w = 17 * cm
            ratio = target_w / iw
            target_h = ih * ratio
            max_h = footer_height_cm * cm
            if target_h > max_h:
                target_h = max_h
                target_w = iw * (target_h / ih)
            x = (page_w - target_w) / 2
            y = 0.6 * cm  # margen inferior
            canv.drawImage(img, x, y, width=target_w, height=target_h, mask="auto", preserveAspectRatio=True)
        except Exception:
            pass

    return _on_page


def _decoded_image(data_url: str, width=4*cm, height=1.6*cm) -> Optional[Image]:
    try:
        if not data_url or not data_url.startswith("data:"):
            return None
        b64 = data_url.split(",", 1)[1]
        raw = base64.b64decode(b64)
        bio = io.BytesIO(raw)
        img = Image(bio, width=width, height=height, kind="proportional")
        return img
    except Exception:
        return None


def _firmantes_table(firmantes: list, st) -> Table:
    """firmantes: [{nombre, documento, rol, firma_url, terna, subregion}]"""
    rows = []
    for f in firmantes:
        img = _decoded_image(f.get("firma_url"), width=4.5*cm, height=1.7*cm)
        firma_cell = img if img else Paragraph("<i>Pendiente de firmar</i>", st["small"])
        info_lines = [
            Paragraph(f"<b>{f.get('nombre','—')}</b>", st["body"]),
            Paragraph(f"C.C. {f.get('documento','___________')}", st["small"]),
        ]
        if f.get("rol"):
            info_lines.append(Paragraph(f.get("rol"), st["small"]))
        if f.get("terna"):
            info_lines.append(Paragraph(f"Terna: {f['terna']}", st["small"]))
        if f.get("subregion"):
            info_lines.append(Paragraph(f"Subregión: {f['subregion']}", st["small"]))
        rows.append([firma_cell, info_lines])
    tbl = Table(rows, colWidths=[5.5*cm, 10*cm])
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (0, -1), 0.4, rl_colors.HexColor("#5E6878")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return tbl


def _build_pdf(tmpl: dict, ctx: dict, conv: dict, tabla_headers: list,
                tabla_rows: list, firmantes: list, branding: dict = None,
                verificacion: dict = None, watermark: str = None) -> bytes:
    """verificacion = {'codigo': str, 'url': str} (opcional, agrega QR al pie)
    watermark = string opcional a estampar como banner rojo arriba (ej. 'VERSIÓN DESACTUALIZADA')
    """
    buf = io.BytesIO()
    has_footer = bool((branding or {}).get("footer_image_url"))
    bottom_margin = 3.2 * cm if has_footer else 1.6 * cm  # espacio reservado para el footer fijo
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=2*cm, rightMargin=2*cm,
                             topMargin=1.6*cm, bottomMargin=bottom_margin)
    st = _base_styles()
    el = []
    # ── Banner watermark si aplica (ej. VERSIÓN DESACTUALIZADA) ──
    if watermark:
        wm_style = ParagraphStyle(
            "wm", parent=st["body"], alignment=TA_CENTER, fontSize=11, leading=14,
            textColor=rl_colors.HexColor("#B91C1C"), borderColor=rl_colors.HexColor("#FCA5A5"),
            borderWidth=1, borderPadding=8, backColor=rl_colors.HexColor("#FEF2F2"),
            fontName="Helvetica-Bold", spaceAfter=10,
        )
        el.append(Paragraph(f"<b>{watermark}</b>", wm_style))
        el.append(Spacer(1, 6))
    _header_block(el, ctx, conv, tmpl, st, branding or {})

    # Datos del jurado/subregion (si aplica)
    if ctx.get("jurado_nombre"):
        el.append(Paragraph(f"<b>NOMBRE DEL JURADO:</b> {ctx['jurado_nombre']}", st["meta"]))
        if ctx.get("subregion"):
            el.append(Paragraph(f"<b>SUBREGIÓN ASIGNADA:</b> {ctx['subregion']}", st["meta"]))
        el.append(Spacer(1, 8))
    elif ctx.get("subregion") and not ctx.get("terna_codigo"):
        el.append(Paragraph(f"<b>SUBREGIÓN:</b> {ctx['subregion']}", st["meta"]))
        el.append(Spacer(1, 8))
    if ctx.get("terna_codigo"):
        el.append(Paragraph(f"<b>TERNA:</b> {ctx['terna_codigo']}{(' · '+ctx['subregion']) if ctx.get('subregion') else ''}", st["meta"]))
        el.append(Spacer(1, 8))

    el.append(Paragraph("CONSIDERANDO QUE:", st["h2"]))
    for para in _render_text(tmpl.get("considerandos", ""), ctx).split("\n\n"):
        if para.strip():
            el.append(Paragraph(para.strip().replace("&", "&amp;"), st["body"]))
            el.append(Spacer(1, 4))

    cert_titulo = "COMO TERNA EVALUADORA, CERTIFICAMOS QUE:" if ctx.get("terna_codigo") \
        else ("COMO EVALUADORES, CERTIFICAMOS QUE:" if not ctx.get("jurado_nombre") and ctx.get("subregion") \
        else "COMO JURADO EVALUADOR, CERTIFICO QUE:")
    el.append(Paragraph(cert_titulo, st["h2"]))
    el.append(Paragraph(_render_text(tmpl.get("certificacion", ""), ctx).replace("&", "&amp;"), st["body"]))
    el.append(Spacer(1, 10))

    # Tabla — headers como Paragraph para que wrappeen correctamente
    el.append(Paragraph(tmpl.get("tabla_titulo", "RESULTADOS"), st["h2"]))
    if tmpl.get("tabla_subtitulo"):
        el.append(Paragraph(f"<i>{_render_text(tmpl['tabla_subtitulo'], ctx)}</i>", st["small"]))
        el.append(Spacer(1, 4))
    header_style = ParagraphStyle("th", fontSize=8.5, leading=10, alignment=TA_CENTER,
                                   textColor=rl_colors.white, fontName="Helvetica-Bold")
    cell_style = ParagraphStyle("td", fontSize=8.2, leading=10, alignment=TA_LEFT,
                                 textColor=rl_colors.HexColor("#1A1F2C"))
    hdr_row = [Paragraph(str(h).replace("&", "&amp;"), header_style) for h in tabla_headers]
    body_rows = [[Paragraph(str(c).replace("&", "&amp;"), cell_style) if not hasattr(c, "wrap") else c for c in r]
                 for r in tabla_rows]
    full_rows = [hdr_row] + body_rows
    n_cols = len(tabla_headers)
    page_w = 17 * cm
    if n_cols == 6:
        col_widths = [0.9*cm, 2.5*cm, 2.3*cm, 4.2*cm, 2.4*cm, 4.7*cm]
    elif n_cols == 5:
        col_widths = [0.9*cm, 2.7*cm, 2.7*cm, 7.7*cm, 3*cm]
    elif n_cols == 7:
        col_widths = [0.8*cm, 2.3*cm, 2.2*cm, 2.2*cm, 4.5*cm, 2.2*cm, 2.8*cm]
    else:
        col_widths = [page_w / n_cols] * n_cols
    tbl = Table(full_rows, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), rl_colors.HexColor("#0F5E54")),
        ("GRID", (0, 0), (-1, -1), 0.25, rl_colors.HexColor("#CDE7E1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [rl_colors.white, rl_colors.HexColor("#F7FAF9")]),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    el.append(tbl)
    el.append(Spacer(1, 12))

    # Texto cierre
    for para in _render_text(tmpl.get("texto_cierre", ""), ctx).split("\n\n"):
        if para.strip():
            el.append(Paragraph(para.strip().replace("&", "&amp;"), st["body"]))
            el.append(Spacer(1, 4))
    el.append(Spacer(1, 16))

    # Firmantes
    el.append(Paragraph(tmpl.get("pie_firmantes_titulo", "FIRMANTES"), st["h2"]))
    el.append(_firmantes_table(firmantes, st))

    # ====== QR de verificación pública del acta ======
    if verificacion and verificacion.get("codigo"):
        el.append(Spacer(1, 14))
        qr_drawing = _build_qr_flowable(verificacion.get("url") or verificacion["codigo"], size_cm=2.6)
        verif_style = ParagraphStyle("verif", parent=st["small"], alignment=TA_LEFT, fontSize=8.2, leading=10)
        verif_text = (
            f'<b>Código de verificación:</b> <font face="Courier-Bold">{verificacion["codigo"]}</font><br/>'
            f'Cualquier persona puede escanear este QR o ingresar el código en la plataforma KRINOS '
            f'para validar la autenticidad de esta acta, sus firmantes y la fecha de emisión.'
        )
        if verificacion.get("url"):
            verif_text += f'<br/><font color="#0F5E54">{verificacion["url"]}</font>'
        verif_table = Table(
            [[qr_drawing, Paragraph(verif_text, verif_style)]],
            colWidths=[3.0 * cm, 13.5 * cm],
            hAlign="LEFT",
        )
        verif_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOX", (0, 0), (-1, -1), 0.5, rl_colors.HexColor("#CDE7E1")),
            ("BACKGROUND", (0, 0), (-1, -1), rl_colors.HexColor("#F7FAF9")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        el.append(verif_table)

    # Footer institucional fijo al pie de página (callback canvas)
    footer_drawer = _make_footer_drawer(branding or {})
    if footer_drawer:
        doc.build(el, onFirstPage=footer_drawer, onLaterPages=footer_drawer)
    else:
        doc.build(el)
    buf.seek(0)
    return buf.getvalue()


# ============================================================
# GENERADORES PDF
# ============================================================
async def _build_verificacion(db, tipo: str, conv_id: str, entity_id: str, meta: dict = None) -> dict:
    """Persiste/recupera el código de verificación del acta y devuelve {codigo,url}."""
    codigo = _acta_verification_code(tipo, conv_id, entity_id)
    existing = await db.actas_verificacion.find_one({"codigo": codigo})
    if not existing:
        await db.actas_verificacion.insert_one({
            "codigo": codigo,
            "tipo": tipo,
            "convocatoria_id": conv_id,
            "entity_id": entity_id,
            "meta": meta or {},
            "created_at": now_iso(),
        })
    else:
        # actualizar meta (firmas, fecha emisión última) sin duplicar
        await db.actas_verificacion.update_one(
            {"codigo": codigo},
            {"$set": {"meta": meta or existing.get("meta", {}), "last_emitted_at": now_iso()}}
        )
    base = _public_base_url().rstrip("/")
    url = f"{base}/verificar/{codigo}" if base else codigo
    return {"codigo": codigo, "url": url}


@router.get("/actas/verificar/{codigo}")
async def verificar_acta_publica(codigo: str):
    """Endpoint PÚBLICO de verificación de actas.
    Devuelve metadatos mínimos para que cualquiera pueda validar la autenticidad
    escaneando el QR impreso o ingresando el código.
    """
    db = get_db()
    v = await db.actas_verificacion.find_one({"codigo": codigo.upper()}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Acta no encontrada o código inválido")
    conv = await db.convocatorias.find_one({"id": v["convocatoria_id"]}, {"_id": 0, "id": 1, "nombre": 1, "codigo": 1})
    return {
        "valido": True,
        "codigo": v["codigo"],
        "tipo": v["tipo"],
        "convocatoria": conv or {"id": v["convocatoria_id"]},
        "emitida_inicialmente": v.get("created_at"),
        "ultima_emision": v.get("last_emitted_at", v.get("created_at")),
        "meta": v.get("meta") or {},
    }


@router.get("/actas/individual-jurado/{jurado_id}")
async def acta_individual_jurado(jurado_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    jur = await db.jurados.find_one({"id": jurado_id})
    if not jur:
        raise HTTPException(404, "Jurado no encontrado")
    # Seguridad: el rol jurado solo puede acceder a su propia acta individual
    if user.get("role") == "jurado" and user.get("jurado_id") != jurado_id:
        raise HTTPException(403, "Solo puedes descargar tu propia acta individual.")
    conv = await db.convocatorias.find_one({"id": jur["convocatoria_id"]})
    tmpl = await _get_template(db, conv, "individual")
    ctx = _build_ctx(conv, jurado=jur)

    evs = await db.evaluaciones_individuales.find({
        "convocatoria_id": jur["convocatoria_id"], "jurado_id": jurado_id, "etapa": {"$ne": "colectiva"}
    }, {"_id": 0}).sort("fecha_finalizacion", 1).to_list(500)
    propuestas_ids = list({e["propuesta_id"] for e in evs})
    propuestas = await db.propuestas.find({"id": {"$in": propuestas_ids}}, {"_id": 0}).to_list(2000)
    pmap = {p["id"]: p for p in propuestas}

    rows = []
    for i, e in enumerate(evs, 1):
        p = pmap.get(e["propuesta_id"], {})
        obs = (e.get("observacion_final") or "")[:280]
        rows.append([
            str(i),
            p.get("codigo", "—"),
            (p.get("datos") or {}).get("municipio", p.get("municipio", "—")),
            (p.get("organizacion") or (p.get("datos") or {}).get("nombre_organizacion") or "—")[:35],
            str(e.get("puntaje_total", 0)),
            obs,
        ])
    headers = ["Nº", "Número de Propuesta", "Municipio", "Nombre de la Organización", "Puntaje Asignado", "Observación Técnica Principal"]
    firmantes = [{
        "nombre": jur.get("nombre"),
        "documento": (jur.get("datos") or {}).get("cedula", "___________"),
        "rol": "Jurado Evaluador",
        "firma_url": (jur.get("datos") or {}).get("firma_url"),
        "subregion": ", ".join(jur.get("subregiones") or []),
    }]
    # Detectar si el acta tiene firma desactualizada por reaperturas posteriores
    invalidada = bool(((jur.get("datos") or {}).get("acta_invalidada_por_reapertura")))
    pdf = _build_pdf(tmpl, ctx, conv, headers, rows, firmantes, _get_branding(conv),
                     verificacion=await _build_verificacion(db, "individual", jur["convocatoria_id"], jurado_id,
                                                            meta={"jurado_nombre": jur.get("nombre"), "subregiones": jur.get("subregiones"),
                                                                  "version_desactualizada": invalidada}),
                     watermark="VERSIÓN DESACTUALIZADA — REQUIERE RE-FIRMA" if invalidada else None)
    await audit(user, "generate_acta", "actas", jurado_id, detalle="individual_jurado")
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="acta_individual_{jur["nombre"].replace(" ","_")}.pdf"'})


@router.get("/actas/colectiva-terna/{terna_id}")
async def acta_colectiva_terna(terna_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    terna = await db.ternas.find_one({"id": terna_id})
    if not terna:
        raise HTTPException(404, "Terna no encontrada")
    # Seguridad: el rol jurado solo puede acceder al acta de ternas donde es integrante
    if user.get("role") == "jurado":
        my_jid = user.get("jurado_id")
        if not my_jid or not any(i.get("jurado_id") == my_jid for i in (terna.get("integrantes") or [])):
            raise HTTPException(403, "Solo puedes descargar actas de ternas donde eres integrante.")
    conv = await db.convocatorias.find_one({"id": terna["convocatoria_id"]})
    tmpl = await _get_template(db, conv, "colectiva_terna")
    ctx = _build_ctx(conv, subregion=terna.get("subregion"), terna=terna)

    evs_col = await db.evaluaciones_colectivas.find({
        "convocatoria_id": terna["convocatoria_id"], "terna_id": terna_id
    }, {"_id": 0}).sort("fecha_cierre", 1).to_list(500)
    propuestas_ids = list({e["propuesta_id"] for e in evs_col})
    propuestas = await db.propuestas.find({"id": {"$in": propuestas_ids}}, {"_id": 0}).to_list(2000)
    pmap = {p["id"]: p for p in propuestas}

    rows = []
    for i, e in enumerate(evs_col, 1):
        p = pmap.get(e["propuesta_id"], {})
        obs_consol = (e.get("observacion_consolidada") or e.get("observacion_final") or e.get("observacion") or "")[:200]
        rows.append([
            str(i), p.get("codigo", "—"),
            (p.get("datos") or {}).get("municipio", "—"),
            (p.get("organizacion") or (p.get("datos") or {}).get("nombre_organizacion") or "—")[:35],
            str(e.get("puntaje_final", 0)),
            obs_consol,
        ])
    headers = ["Nº", "Número de Propuesta", "Municipio", "Nombre de la Organización", "Puntaje Total Definitivo", "Observación Consolidada de la Terna"]
    firmas = (terna.get("datos") or {}).get("firmas_acta_colectiva") or {}
    firmantes = []
    for integ in terna.get("integrantes") or []:
        jid = integ.get("jurado_id")
        jur_obj = await db.jurados.find_one({"id": jid}) if jid else None
        firma_data = firmas.get(jid) or {}
        firmantes.append({
            "nombre": (jur_obj or {}).get("nombre") or integ.get("nombre", "—"),
            "documento": ((jur_obj or {}).get("datos") or {}).get("cedula", "___________"),
            "rol": integ.get("rol", "Integrante"),
            "firma_url": firma_data.get("firma_url") or ((jur_obj or {}).get("datos") or {}).get("firma_url") if firma_data else None,
            "terna": terna.get("codigo"),
        })
    # INVITADO(A) GARANTE DEL PROCESO (opcional, configurado en la convocatoria)
    garante = ((conv.get("configuracion") or {}).get("invitado_garante") or {})
    if garante.get("nombre"):
        firmantes.append({
            "nombre": garante.get("nombre"),
            "documento": garante.get("documento", "___________"),
            "rol": "Invitado(a) Garante del Proceso · Acompañamiento Técnico/Control",
            "firma_url": garante.get("firma_url"),
            "subregion": garante.get("entidad_rol", ""),
        })
    pdf = _build_pdf(tmpl, ctx, conv, headers, rows, firmantes, _get_branding(conv),
                     verificacion=await _build_verificacion(db, "colectiva", terna["convocatoria_id"], terna_id,
                                                            meta={"terna_codigo": terna.get("codigo"), "subregion": terna.get("subregion") or terna.get("territorio")}),
                     watermark="VERSIÓN DESACTUALIZADA — REQUIERE RE-FIRMA" if bool(((terna.get("datos") or {}).get("acta_colectiva_invalidada_por_reapertura"))) else None)
    await audit(user, "generate_acta", "actas", terna_id, detalle="colectiva_terna")
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="acta_colectiva_terna_{terna["codigo"]}.pdf"'})


@router.get("/actas/subregional")
async def acta_subregional(convocatoria_id: str, subregion: str,
                            user: dict = Depends(get_current_user)):
    db = get_db()
    conv = await db.convocatorias.find_one({"id": convocatoria_id})
    if not conv:
        raise HTTPException(404, "Convocatoria no encontrada")
    tmpl = await _get_template(db, conv, "subregional")
    ctx = _build_ctx(conv, subregion=subregion)

    propuestas_sub = await db.propuestas.find({
        "convocatoria_id": convocatoria_id,
        "$or": [{"subregion": subregion}, {"datos.subregion": subregion}]
    }, {"_id": 0}).to_list(2000)
    propuestas_ids = [p["id"] for p in propuestas_sub]
    if not propuestas_ids:
        raise HTTPException(400, f"No hay propuestas en la subregión {subregion}")
    evs_col = await db.evaluaciones_colectivas.find({
        "convocatoria_id": convocatoria_id, "propuesta_id": {"$in": propuestas_ids}
    }, {"_id": 0}).to_list(2000)
    em = {e["propuesta_id"]: e for e in evs_col}

    rows = []
    for i, p in enumerate(propuestas_sub, 1):
        e = em.get(p["id"], {})
        rows.append([
            str(i), p.get("codigo", "—"), subregion,
            (p.get("datos") or {}).get("municipio", "—"),
            (p.get("organizacion") or (p.get("datos") or {}).get("nombre_organizacion") or "—")[:35],
            str(e.get("puntaje_final", "—")),
        ])
    headers = ["Nº", "Número de Propuesta", "Subregión", "Municipio", "Nombre de la Organización", "Puntaje Total Definitivo"]

    # Firmantes: todos los jurados de la subregión + indicación de su terna
    jurados_sub = await db.jurados.find({
        "convocatoria_id": convocatoria_id, "subregiones": subregion
    }, {"_id": 0}).to_list(500)
    # Mapa jurado_id -> codigo terna
    ternas_sub = await db.ternas.find({"convocatoria_id": convocatoria_id, "subregion": subregion}, {"_id": 0}).to_list(200)
    terna_de_jurado = {}
    for t in ternas_sub:
        for integ in (t.get("integrantes") or []):
            jid = integ.get("jurado_id")
            if jid and jid not in terna_de_jurado:
                terna_de_jurado[jid] = t.get("codigo", "—")
    acta_doc = await db.actas_subregionales.find_one({"convocatoria_id": convocatoria_id, "subregion": subregion}, {"_id": 0})
    firmas_reg = (acta_doc or {}).get("firmas") or {}
    firmantes = []
    for j in jurados_sub:
        fd = firmas_reg.get(j["id"]) or {}
        firmantes.append({
            "nombre": j.get("nombre"),
            "documento": (j.get("datos") or {}).get("cedula", "___________"),
            "rol": "Jurado evaluador",
            "firma_url": fd.get("firma_url"),
            "terna": terna_de_jurado.get(j["id"], ""),
        })
    # INVITADO(A) GARANTE DEL PROCESO (opcional)
    garante = ((conv.get("configuracion") or {}).get("invitado_garante") or {})
    if garante.get("nombre"):
        firmantes.append({
            "nombre": garante.get("nombre"),
            "documento": garante.get("documento", "___________"),
            "rol": "Invitado(a) Garante del Proceso · Acompañamiento Técnico/Control",
            "firma_url": garante.get("firma_url"),
            "subregion": garante.get("entidad_rol", ""),
        })
    pdf = _build_pdf(tmpl, ctx, conv, headers, rows, firmantes, _get_branding(conv),
                     verificacion=await _build_verificacion(db, "subregional", convocatoria_id, f"sub:{subregion}",
                                                            meta={"subregion": subregion, "n_propuestas": len(propuestas_ids), "n_firmantes": len(firmantes)}))
    await audit(user, "generate_acta", "actas", f"sub-{subregion}", detalle=f"subregional:{subregion}")
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="acta_subregional_{subregion.replace(" ","_")}.pdf"'})
