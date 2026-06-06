"""KRINOS - Email Service (Gmail SMTP + SendGrid).

Servicio unificado para envío de correos. Lee la configuración desde `system_settings.email`
y enruta a Gmail SMTP o a SendGrid según el proveedor activo.

- Gmail SMTP: requiere `app_password` (Contraseña de Aplicación de Google, no la del Gmail).
- SendGrid: requiere `api_key` (SG.xxx) con permisos Mail Send.

Plantillas embebidas (siempre con HTML institucional):
- `welcome` (Bienvenida con credenciales)
- `reset_password` (Recuperar contraseña - link con token)
- `notification` (Notificación genérica)
"""
import os
import ssl
import smtplib
import asyncio
import logging
from email.message import EmailMessage
from typing import Optional, Literal

from db import get_db, now_iso

logger = logging.getLogger("krinos.email")

PROVIDER = Literal["gmail", "sendgrid"]


# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------
async def get_email_config() -> dict:
    """Devuelve la config completa de email (sin enmascarar). Solo uso interno."""
    db = get_db()
    doc = await db.system_settings.find_one({"id": "global"}, {"_id": 0})
    if not doc:
        return {"provider": "sendgrid"}
    return doc.get("email", {
        "provider": doc.get("email_provider", "sendgrid"),
        "from_email": doc.get("sendgrid", {}).get("from_email", ""),
        "from_name": doc.get("sendgrid", {}).get("from_name", "KRINOS"),
        # Compatibilidad con config previa
        "sendgrid": doc.get("sendgrid", {}),
        "gmail": {"user": "", "app_password": ""},
    })


# ---------------------------------------------------------------------------
# Plantillas HTML institucionales
# ---------------------------------------------------------------------------
def _layout(body_html: str, product_name: str = "KRINOS") -> str:
    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#F1F4F7;font-family:Inter,Arial,sans-serif;color:#1A1F2C;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F1F4F7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:12px;border:1px solid #E2E7EC;overflow:hidden;">
        <tr><td style="background:#14776A;padding:20px 32px;color:#FFFFFF;">
          <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;">{product_name}</div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;opacity:0.85;margin-top:2px;">by ELEA</div>
        </td></tr>
        <tr><td style="padding:32px;font-size:14px;line-height:1.6;">{body_html}</td></tr>
        <tr><td style="padding:16px 32px 18px;background:#FAFBFC;border-top:1px solid #E2E7EC;font-size:10.5px;color:#5E6878;line-height:1.55;">
          Este correo fue enviado automáticamente por la plataforma <strong>{product_name}</strong>. Si no esperabas este mensaje, por favor ignóralo o notifícalo a
          <a href="mailto:eleainnovacionsocial@gmail.com" style="color:#5E6878;text-decoration:underline;">eleainnovacionsocial@gmail.com</a>.
          <br/><br/>
          <strong>ELEA Innovación Social</strong> — Tratamiento de datos conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013 (Habeas Data, Colombia).
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def render_welcome(name: str, username: str, password: Optional[str], login_url: str,
                   product_name: str = "KRINOS",
                   convocatoria_nombre: Optional[str] = None,
                   convocatoria_codigo: Optional[str] = None,
                   rol_legible: Optional[str] = None,
                   entidad: Optional[str] = None,
                   contact_email: str = "eleainnovacionsocial@gmail.com") -> tuple[str, str]:
    """Email de bienvenida cálido + contextualizado a la convocatoria.

    Si se provee `convocatoria_nombre/codigo`, se muestra un bloque destacado
    indicando en qué proceso fue acreditado el usuario. Si no, cae al genérico.
    """
    # Saludo amable — solo primer nombre si name viene con varios
    first_name = (name or "").strip().split(" ")[0] if name else ""
    saludo = f"¡Hola {first_name}!" if first_name else "¡Hola!"

    # Bloque institucional de la convocatoria
    conv_block = ""
    if convocatoria_nombre:
        codigo_chip = (
            f'<span style="display:inline-block;background:#0F5E54;color:#FFFFFF;'
            f'font-family:Consolas,Menlo,monospace;font-size:11.5px;padding:2px 8px;'
            f'border-radius:4px;margin-right:8px;letter-spacing:0.5px;font-weight:700;">'
            f'{convocatoria_codigo}</span>' if convocatoria_codigo else ""
        )
        entidad_line = (
            f'<div style="margin-top:6px;font-size:12.5px;color:#5E6878;">'
            f'<strong>Entidad organizadora:</strong> {entidad}</div>' if entidad else ""
        )
        rol_line = (
            f'<div style="margin-top:6px;font-size:12.5px;color:#5E6878;">'
            f'<strong>Tu rol:</strong> {rol_legible}</div>' if rol_legible else ""
        )
        conv_block = f"""
        <div style="margin:18px 0;background:#FFFFFF;border:1px solid #CDE7E1;border-left:4px solid #14776A;padding:16px 18px;border-radius:8px;">
          <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:1.4px;color:#0F5E54;font-weight:700;margin-bottom:8px;">Convocatoria activa</div>
          <div style="font-size:15px;font-weight:700;color:#1A1F2C;line-height:1.35;">{codigo_chip}{convocatoria_nombre}</div>
          {entidad_line}
          {rol_line}
        </div>
        """

    creds_block = ""
    if password:
        creds_block = f"""
        <div style="margin:16px 0 8px;font-size:12.5px;color:#3F4856;">
          A continuación tus credenciales de acceso. <strong>Guárdalas en un lugar seguro</strong>:
        </div>
        <table style="margin:8px 0 6px;background:#F0F7F5;border-left:4px solid #14776A;padding:14px 18px;border-radius:6px;font-family:Consolas,Menlo,monospace;font-size:13px;">
          <tr><td style="padding:2px 0;"><strong>Usuario:</strong> {username}</td></tr>
          <tr><td style="padding:2px 0;"><strong>Contraseña temporal:</strong> {password}</td></tr>
        </table>
        <p style="font-size:12px;color:#92400E;background:#FFFBEB;border:1px solid #FDE68A;padding:8px 12px;border-radius:6px;margin:10px 0 4px;">
          🔒 Por seguridad, <strong>cambia esta contraseña</strong> la primera vez que inicies sesión (Mi Perfil → Cambiar contraseña).
        </p>
        """

    body = f"""
      <h1 style="font-size:23px;font-weight:800;margin:0 0 6px;letter-spacing:-0.4px;color:#1A1F2C;">{saludo}</h1>
      <p style="margin:0 0 14px;font-size:14.5px;color:#3F4856;">
        Te damos la bienvenida a <strong>{product_name}</strong>, la plataforma con la que gestionamos el ciclo completo de esta convocatoria — desde la inscripción de propuestas hasta la generación de actas oficiales.
      </p>
      {conv_block}
      {creds_block}
      <a href="{login_url}" style="display:inline-block;background:#14776A;color:#FFFFFF;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;margin-top:14px;">Ingresar a la plataforma →</a>
      <p style="margin-top:22px;font-size:12.5px;color:#5E6878;line-height:1.55;">
        Si tienes preguntas sobre el proceso o necesitas apoyo técnico, escríbenos a
        <a href="mailto:{contact_email}" style="color:#14776A;font-weight:600;text-decoration:none;">{contact_email}</a>
        o contacta al administrador de tu convocatoria. Estamos para acompañarte.
      </p>
      <p style="margin-top:14px;font-size:12.5px;color:#3F4856;">
        Gracias por sumarte a este proceso — tu participación es esencial para garantizar la transparencia y la calidad de los resultados.
      </p>

      <!-- Aviso de confidencialidad y tratamiento de datos personales -->
      <div style="margin-top:24px;padding-top:14px;border-top:1px solid #E2E7EC;font-size:10.5px;color:#5E6878;line-height:1.55;">
        <div style="text-transform:uppercase;letter-spacing:1.2px;font-weight:700;color:#3F4856;margin-bottom:4px;">Aviso de confidencialidad y tratamiento de datos</div>
        <p style="margin:0;">
          Este correo, sus credenciales y cualquier archivo adjunto son <strong>información confidencial</strong> dirigida exclusivamente al destinatario. Si lo ha recibido por error, por favor notifíquelo a <a href="mailto:{contact_email}" style="color:#5E6878;text-decoration:underline;">{contact_email}</a> y elimínelo de sus sistemas.
        </p>
        <p style="margin:8px 0 0;">
          En cumplimiento de la <strong>Ley 1581 de 2012</strong> y el <strong>Decreto 1377 de 2013</strong> de la República de Colombia (Protección de Datos Personales — Habeas Data), sus datos serán tratados con fines exclusivamente vinculados a la gestión de esta convocatoria. Usted puede conocer, actualizar, rectificar o suprimir su información, así como revocar la autorización de tratamiento, escribiendo a
          <a href="mailto:{contact_email}" style="color:#5E6878;text-decoration:underline;">{contact_email}</a>.
        </p>
      </div>

      <p style="margin:18px 0 0;font-size:12.5px;color:#1A1F2C;font-weight:600;">— Equipo {product_name} · ELEA Innovación Social</p>
    """

    # Versión texto plano (fallback para clientes sin HTML)
    text_lines = [
        saludo,
        "",
        f"Te damos la bienvenida a {product_name}.",
    ]
    if convocatoria_nombre:
        text_lines.append("")
        text_lines.append(f"Convocatoria: {convocatoria_codigo + ' · ' if convocatoria_codigo else ''}{convocatoria_nombre}")
        if entidad: text_lines.append(f"Entidad: {entidad}")
        if rol_legible: text_lines.append(f"Tu rol: {rol_legible}")
    if password:
        text_lines += ["", f"Usuario: {username}", f"Contraseña temporal: {password}",
                       "Por seguridad, cambia esta contraseña en tu primer inicio de sesión."]
    text_lines += [
        "", f"Ingresa en: {login_url}",
        "", f"¿Dudas o soporte? {contact_email}",
        "",
        "Gracias por sumarte a este proceso — tu participación es esencial para garantizar la",
        "transparencia y la calidad de los resultados.",
        "",
        "---",
        "AVISO DE CONFIDENCIALIDAD Y TRATAMIENTO DE DATOS",
        "Este correo y sus credenciales son información confidencial dirigida exclusivamente al",
        "destinatario. Si lo recibió por error, notifíquelo a " + contact_email + " y elimínelo.",
        "",
        "En cumplimiento de la Ley 1581 de 2012 y el Decreto 1377 de 2013 (Protección de Datos",
        "Personales — Habeas Data), sus datos son tratados con fines exclusivamente vinculados a",
        "esta convocatoria. Puede ejercer sus derechos escribiendo a " + contact_email + ".",
        "",
        f"— Equipo {product_name} · ELEA Innovación Social",
    ]
    text = "\n".join(text_lines)
    return _layout(body, product_name), text


def render_reset(name: str, reset_url: str, product_name: str = "KRINOS") -> tuple[str, str]:
    body = f"""
      <h1 style="font-size:22px;font-weight:800;margin:0 0 14px;">Recuperación de contraseña</h1>
      <p>Hola {name},</p>
      <p>Recibimos una solicitud para restablecer tu contraseña en <strong>{product_name}</strong>.</p>
      <a href="{reset_url}" style="display:inline-block;background:#14776A;color:#FFFFFF;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:13.5px;margin:18px 0;">Crear nueva contraseña</a>
      <p style="font-size:12.5px;color:#5E6878;">Este enlace expira en <strong>1 hora</strong>. Si no solicitaste este cambio, ignora este correo: tu contraseña actual seguirá siendo válida.</p>
      <p style="font-size:11.5px;color:#94A3B8;margin-top:18px;word-break:break-all;">Si el botón no funciona, copia y pega esta URL en tu navegador:<br/>{reset_url}</p>
    """
    text = f"Recuperación de contraseña\n\nHola {name},\n\nUsa este enlace para restablecer tu contraseña (expira en 1 hora):\n{reset_url}\n"
    return _layout(body, product_name), text


def render_generic(subject: str, content_html: str, product_name: str = "KRINOS") -> tuple[str, str]:
    body = f"<h1 style='font-size:20px;font-weight:800;margin:0 0 14px;'>{subject}</h1>{content_html}"
    return _layout(body, product_name), subject


def render_evals_completas(name: str, total_evals: int, actas_url: str, product_name: str = "KRINOS") -> tuple[str, str]:
    body = f"""
      <h1 style="font-size:22px;font-weight:800;margin:0 0 14px;">¡Completaste tus evaluaciones! 🎉</h1>
      <p>Hola {name},</p>
      <p>Has finalizado las <strong>{total_evals} evaluaciones individuales</strong> asignadas en <strong>{product_name}</strong>. ¡Excelente trabajo!</p>
      <div style="background:#F0F7F5;border-left:4px solid #14776A;padding:14px 18px;border-radius:6px;margin:18px 0;">
        <strong style="color:#0F5E54;">Próximo paso:</strong> firma tu acta individual consolidada.
        <p style="margin:6px 0 0;font-size:12.5px;color:#5E6878;">Es una sola acta que reúne todas tus calificaciones. Recuerda tener tu firma cargada en <em>Mi Perfil</em>.</p>
      </div>
      <a href="{actas_url}" style="display:inline-block;background:#14776A;color:#FFFFFF;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:13.5px;">Ir a firmar mi acta</a>
      <p style="margin-top:20px;font-size:12.5px;color:#5E6878;">Si tienes dudas, contacta al administrador de la convocatoria.</p>
    """
    text = f"¡Completaste tus evaluaciones, {name}!\n\nFinalizaste {total_evals} evaluaciones individuales en {product_name}.\n\nSiguiente paso: firma tu acta individual en:\n{actas_url}\n"
    return _layout(body, product_name), text


# ---------------------------------------------------------------------------
# Envío real
# ---------------------------------------------------------------------------
def _smtp_gmail_send(user: str, app_password: str, to_email: str, subject: str,
                     html_body: str, text_body: str,
                     from_name: str = "KRINOS",
                     attachments: Optional[list] = None) -> dict:
    """Envío síncrono por Gmail SMTP (587, STARTTLS). Se ejecuta en thread vía asyncio.to_thread.

    attachments: lista opcional de dicts `{filename: str, content: bytes, mime: str}`.
    """
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{user}>"
    msg["To"] = to_email
    msg.set_content(text_body or " ")
    msg.add_alternative(html_body, subtype="html")
    for att in attachments or []:
        maintype, _, subtype = (att.get("mime") or "application/octet-stream").partition("/")
        msg.add_attachment(att["content"], maintype=maintype, subtype=subtype or "octet-stream",
                           filename=att["filename"])
    context = ssl.create_default_context()
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=60) as smtp:
        smtp.starttls(context=context)
        smtp.login(user, app_password)
        smtp.send_message(msg)
    return {"ok": True, "provider": "gmail", "to": to_email}


def _sendgrid_send(api_key: str, from_email: str, from_name: str, to_email: str,
                   subject: str, html_body: str, text_body: str) -> dict:
    """Envío vía API REST de SendGrid (sin SDK). HTTPS POST a /v3/mail/send."""
    import urllib.request
    import json
    data = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": from_email, "name": from_name},
        "subject": subject,
        "content": [
            {"type": "text/plain", "value": text_body or " "},
            {"type": "text/html", "value": html_body},
        ],
    }
    req = urllib.request.Request(
        "https://api.sendgrid.com/v3/mail/send",
        data=json.dumps(data).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        if resp.status >= 300:
            raise RuntimeError(f"SendGrid HTTP {resp.status}")
    return {"ok": True, "provider": "sendgrid", "to": to_email}


async def send_email(to_email: str, subject: str, html_body: str,
                     text_body: Optional[str] = None,
                     reply_to: Optional[str] = None,
                     attachments: Optional[list] = None) -> dict:
    """Envía un correo usando el proveedor configurado en system_settings.email.

    attachments: lista opcional de dicts `{filename, content (bytes), mime}`. Solo
    soportado por Gmail SMTP. SendGrid no acepta adjuntos con este wrapper.

    Devuelve `{ok, provider, to}` o levanta excepción con detalle.
    Si el proveedor está deshabilitado, devuelve `{ok: False, mocked: True, ...}` sin error.
    """
    cfg = await get_email_config()
    provider = cfg.get("provider", "sendgrid")
    from_name = cfg.get("from_name") or "KRINOS"
    from_email = cfg.get("from_email") or ""

    if not cfg.get("enabled"):
        logger.warning(f"[EMAIL MOCKED] to={to_email} subject={subject!r}")
        return {"ok": False, "mocked": True, "reason": "email_disabled",
                "message": "Servicio de correo deshabilitado. Actívalo en Administración → Correos."}

    text_body = text_body or " "

    try:
        if provider == "gmail":
            gmail = cfg.get("gmail", {})
            user = gmail.get("user") or from_email
            app_password = gmail.get("app_password") or ""
            if not user or not app_password:
                return {"ok": False, "mocked": True, "reason": "gmail_not_configured",
                        "message": "Falta usuario Gmail o contraseña de aplicación."}
            return await asyncio.to_thread(
                _smtp_gmail_send, user, app_password, to_email,
                subject, html_body, text_body, from_name, attachments,
            )
        else:  # sendgrid
            if attachments:
                logger.warning("[EMAIL] Adjuntos no soportados en SendGrid en este wrapper; se enviará sin ellos.")
            sg = cfg.get("sendgrid", {})
            api_key = sg.get("api_key") or ""
            sender = sg.get("from_email") or from_email
            sender_name = sg.get("from_name") or from_name
            if not api_key or not sender:
                return {"ok": False, "mocked": True, "reason": "sendgrid_not_configured",
                        "message": "Falta API Key o remitente verificado en SendGrid."}
            return await asyncio.to_thread(
                _sendgrid_send, api_key, sender, sender_name, to_email,
                subject, html_body, text_body,
            )
    except Exception as e:
        logger.exception(f"Email send failed via {provider}")
        return {"ok": False, "provider": provider, "error": str(e),
                "message": f"Error de envío ({provider}): {e}"}


# ---------------------------------------------------------------------------
# Helper para registrar el envío en auditoría / cola
# ---------------------------------------------------------------------------
async def log_email(to_email: str, subject: str, kind: str, result: dict,
                    user_id: Optional[str] = None):
    db = get_db()
    await db.email_log.insert_one({
        "to": to_email,
        "subject": subject,
        "kind": kind,  # "welcome" | "reset_password" | "notification"
        "result": result,
        "user_id": user_id,
        "fecha": now_iso(),
    })
