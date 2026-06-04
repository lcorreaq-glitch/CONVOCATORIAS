"""KRINOS - System settings: IA provider, SendGrid, branding por convocatoria."""
import os
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from db import get_db, now_iso
from auth import get_current_user, require_roles, audit

router = APIRouter(prefix="/api/settings", tags=["settings"])


SETTINGS_ID = "global"  # singleton document


def _mask(s: Optional[str]) -> str:
    if not s: return ""
    if len(s) <= 8: return "•" * len(s)
    return f"{s[:4]}{'•' * (len(s) - 8)}{s[-4:]}"


async def _get_doc():
    db = get_db()
    doc = await db.system_settings.find_one({"id": SETTINGS_ID}, {"_id": 0})
    if not doc:
        doc = {
            "id": SETTINGS_ID,
            "ai": {
                "provider": "openai",            # openai | anthropic | gemini
                "model": "gpt-4o",               # estable, ampliamente soportado
                "use_emergent_key": True,        # si true, usa EMERGENT_LLM_KEY de .env
                "byok_api_key": "",              # si user trae su propia key
                "system_message": "Eres KRINOS IA, asistente para evaluación de convocatorias. Responde en español, sé conciso, profesional y objetivo.",
                "enabled": True,
            },
            "sendgrid": {
                "api_key": "",
                "from_email": "",
                "from_name": "KRINOS",
                "enabled": False,
                "test_recipient": "",
            },
            "email": {
                "provider": "sendgrid",          # gmail | sendgrid (selector activo)
                "enabled": False,
                "from_email": "",
                "from_name": "KRINOS",
                "test_recipient": "",
                "gmail": {"user": "", "app_password": ""},
                "sendgrid": {"api_key": "", "from_email": "", "from_name": "KRINOS"},
            },
            "branding": {
                "product_name": "KRINOS",
                "product_by": "ELEA",
                "tagline": "Plataforma Inteligente para Convocatorias y Evaluación",
                "primary_color": "#14776A",
                "secondary_color": "#1E6091",
            },
            "created_at": now_iso(),
        }
        await db.system_settings.insert_one(doc)
        doc.pop("_id", None)
    # Migración suave: si no existe el bloque `email`, lo añade tomando datos de sendgrid
    if "email" not in doc:
        sg = doc.get("sendgrid", {}) or {}
        doc["email"] = {
            "provider": "sendgrid",
            "enabled": bool(sg.get("enabled")),
            "from_email": sg.get("from_email", ""),
            "from_name": sg.get("from_name", "KRINOS"),
            "test_recipient": sg.get("test_recipient", ""),
            "gmail": {"user": "", "app_password": ""},
            "sendgrid": {
                "api_key": sg.get("api_key", ""),
                "from_email": sg.get("from_email", ""),
                "from_name": sg.get("from_name", "KRINOS"),
            },
        }
        await db.system_settings.update_one({"id": SETTINGS_ID}, {"$set": {"email": doc["email"]}})
    return doc


def _public_view(doc: dict) -> dict:
    """Returns settings with secrets masked for display."""
    d = {**doc}
    ai = {**d.get("ai", {})}
    sg = {**d.get("sendgrid", {})}
    email = {**d.get("email", {})}
    email_gmail = {**email.get("gmail", {})}
    email_sg = {**email.get("sendgrid", {})}
    ai["byok_api_key_masked"] = _mask(ai.pop("byok_api_key", ""))
    ai["has_byok_key"] = bool(doc.get("ai", {}).get("byok_api_key"))
    sg["api_key_masked"] = _mask(sg.pop("api_key", ""))
    sg["has_api_key"] = bool(doc.get("sendgrid", {}).get("api_key"))
    # Email block (selector Gmail / SendGrid)
    email_gmail["app_password_masked"] = _mask(email_gmail.pop("app_password", ""))
    email_gmail["has_app_password"] = bool(doc.get("email", {}).get("gmail", {}).get("app_password"))
    email_sg["api_key_masked"] = _mask(email_sg.pop("api_key", ""))
    email_sg["has_api_key"] = bool(doc.get("email", {}).get("sendgrid", {}).get("api_key"))
    email["gmail"] = email_gmail
    email["sendgrid"] = email_sg
    d["ai"] = ai
    d["sendgrid"] = sg
    d["email"] = email
    return d


@router.get("")
async def get_settings(user: dict = Depends(require_roles("admin_general"))):
    doc = await _get_doc()
    return _public_view(doc)


class AISettings(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    use_emergent_key: Optional[bool] = None
    byok_api_key: Optional[str] = None  # send "" to clear, omit to keep
    system_message: Optional[str] = None
    enabled: Optional[bool] = None


@router.patch("/ai")
async def update_ai(payload: AISettings, user: dict = Depends(require_roles("admin_general"))):
    db = get_db()
    doc = await _get_doc()
    ai = doc.get("ai", {})
    body = payload.model_dump(exclude_unset=True)
    # Validate provider
    if "provider" in body and body["provider"] not in ("openai", "anthropic", "gemini"):
        raise HTTPException(status_code=400, detail="Proveedor inválido")
    ai.update(body)
    await db.system_settings.update_one({"id": SETTINGS_ID}, {"$set": {"ai": ai}}, upsert=True)
    await audit(user, "update", "settings", "ai", valor_nuevo={k: (v if k != "byok_api_key" else _mask(v)) for k, v in body.items()})
    return _public_view(await _get_doc())


class SendGridSettings(BaseModel):
    api_key: Optional[str] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    enabled: Optional[bool] = None
    test_recipient: Optional[str] = None


@router.patch("/sendgrid")
async def update_sendgrid(payload: SendGridSettings, user: dict = Depends(require_roles("admin_general"))):
    db = get_db()
    doc = await _get_doc()
    sg = doc.get("sendgrid", {})
    body = payload.model_dump(exclude_unset=True)
    sg.update(body)
    await db.system_settings.update_one({"id": SETTINGS_ID}, {"$set": {"sendgrid": sg}}, upsert=True)
    await audit(user, "update", "settings", "sendgrid",
                valor_nuevo={k: (v if k != "api_key" else _mask(v)) for k, v in body.items()})
    return _public_view(await _get_doc())


class BrandingSettings(BaseModel):
    product_name: Optional[str] = None
    product_by: Optional[str] = None
    tagline: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None


@router.patch("/branding")
async def update_branding(payload: BrandingSettings, user: dict = Depends(require_roles("admin_general"))):
    db = get_db()
    doc = await _get_doc()
    br = doc.get("branding", {})
    body = payload.model_dump(exclude_unset=True)
    br.update(body)
    await db.system_settings.update_one({"id": SETTINGS_ID}, {"$set": {"branding": br}}, upsert=True)
    await audit(user, "update", "settings", "branding", valor_nuevo=body)
    return _public_view(await _get_doc())


@router.post("/sendgrid/test")
async def test_sendgrid(user: dict = Depends(require_roles("admin_general"))):
    """Stub: dispara un correo de prueba si SendGrid está habilitado.
    Por ahora retorna 501 indicando que el envío real está pendiente de configuración del cliente."""
    doc = await _get_doc()
    sg = doc.get("sendgrid", {})
    if not sg.get("enabled"):
        raise HTTPException(status_code=400, detail="SendGrid está deshabilitado")
    if not sg.get("api_key"):
        raise HTTPException(status_code=400, detail="Falta API key de SendGrid")
    if not sg.get("from_email"):
        raise HTTPException(status_code=400, detail="Falta from_email")
    if not sg.get("test_recipient"):
        raise HTTPException(status_code=400, detail="Falta destinatario de prueba")
    # TODO: integración real con sendgrid SDK cuando el cliente provea la key
    return {
        "ok": False,
        "status": "no_dispatched",
        "message": "Configuración válida. El envío real se activará cuando el cliente registre su API key de SendGrid (servicio en modo configuración).",
        "from": f"{sg['from_name']} <{sg['from_email']}>",
        "to": sg["test_recipient"],
    }


# Helper exportado para que routes_ai pueda obtener config
async def get_ai_config() -> dict:
    doc = await _get_doc()
    return doc.get("ai", {})


# ===========================================================================
# EMAIL (Gmail SMTP + SendGrid) — selector unificado
# ===========================================================================
class GmailBlock(BaseModel):
    user: Optional[str] = None
    app_password: Optional[str] = None  # send "" to clear, omit to keep


class SendGridBlock(BaseModel):
    api_key: Optional[str] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None


class EmailSettings(BaseModel):
    provider: Optional[str] = None  # "gmail" | "sendgrid"
    enabled: Optional[bool] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    test_recipient: Optional[str] = None
    gmail: Optional[GmailBlock] = None
    sendgrid: Optional[SendGridBlock] = None


@router.patch("/email")
async def update_email(payload: EmailSettings, user: dict = Depends(require_roles("admin_general"))):
    db = get_db()
    doc = await _get_doc()
    email = doc.get("email", {})
    body = payload.model_dump(exclude_unset=True)

    if "provider" in body and body["provider"] not in ("gmail", "sendgrid"):
        raise HTTPException(status_code=400, detail="Proveedor inválido (usa 'gmail' o 'sendgrid').")

    # Sub-bloques
    if "gmail" in body and body["gmail"] is not None:
        gm = email.get("gmail", {}) or {}
        for k, v in body["gmail"].items():
            if v is not None:
                gm[k] = v
        email["gmail"] = gm
        del body["gmail"]
    if "sendgrid" in body and body["sendgrid"] is not None:
        sg = email.get("sendgrid", {}) or {}
        for k, v in body["sendgrid"].items():
            if v is not None:
                sg[k] = v
        email["sendgrid"] = sg
        del body["sendgrid"]

    # Campos planos
    email.update({k: v for k, v in body.items() if v is not None})
    await db.system_settings.update_one({"id": SETTINGS_ID}, {"$set": {"email": email}}, upsert=True)

    safe_log = {**body}
    if email.get("gmail", {}).get("app_password"):
        safe_log["gmail.app_password_set"] = True
    await audit(user, "update", "settings", "email", valor_nuevo=safe_log)
    return _public_view(await _get_doc())


@router.post("/email/test")
async def test_email(user: dict = Depends(require_roles("admin_general"))):
    """Envía un correo de prueba con el proveedor activo. Requiere `enabled=true` y `test_recipient`."""
    from email_service import send_email, render_generic, log_email

    doc = await _get_doc()
    email = doc.get("email", {})
    if not email.get("enabled"):
        raise HTTPException(status_code=400, detail="El servicio de correo está deshabilitado.")
    to = email.get("test_recipient")
    if not to:
        raise HTTPException(status_code=400, detail="Falta destinatario de prueba.")
    provider = email.get("provider", "sendgrid")

    branding = doc.get("branding", {})
    product_name = branding.get("product_name", "KRINOS")
    html, text = render_generic(
        subject="Correo de prueba KRINOS",
        content_html=(
            f"<p>¡Hola!</p>"
            f"<p>Este es un mensaje de prueba enviado desde <strong>{product_name}</strong> usando el proveedor "
            f"<strong>{provider.upper()}</strong>.</p>"
            f"<p>Si lo recibes, la configuración funciona correctamente. ✨</p>"
        ),
        product_name=product_name,
    )
    result = await send_email(to, "Correo de prueba KRINOS", html, text_body=text)
    await log_email(to, "Correo de prueba KRINOS", "test", result, user_id=user.get("id"))
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message") or result.get("error", "Error desconocido"))
    return {"ok": True, "provider": provider, "to": to, "message": "Correo enviado correctamente."}
