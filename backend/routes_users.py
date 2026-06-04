"""KRINOS - User management (Admin General creates other users)."""
import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field

from db import get_db, now_iso
from auth import get_current_user, require_roles, hash_password, audit

router = APIRouter(prefix="/api/users", tags=["users"])

ALLOWED_ROLES = ["admin_general", "admin_convocatoria", "supervisor",
                 "jurado", "integrante_terna", "invitado", "auditor"]


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    name: str
    password: str
    role: str
    convocatoria_roles: List[dict] = Field(default_factory=list)


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    password: Optional[str] = None
    convocatoria_roles: Optional[List[dict]] = None


@router.get("")
async def list_users(user: dict = Depends(require_roles("admin_general"))):
    db = get_db()
    items = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(2000)
    return items


@router.post("")
async def create_user(payload: UserCreate, user: dict = Depends(require_roles("admin_general"))):
    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Rol inválido")
    db = get_db()
    if await db.users.find_one({"$or": [{"username": payload.username.lower()}, {"email": payload.email.lower()}]}):
        raise HTTPException(status_code=409, detail="Usuario o email ya registrado")
    doc = {
        "id": str(uuid.uuid4()),
        "username": payload.username.lower(),
        "email": payload.email.lower(),
        "name": payload.name,
        "password_hash": hash_password(payload.password),
        "role": payload.role,
        "active": True,
        "convocatoria_roles": payload.convocatoria_roles or [],
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    await audit(user, "create", "users", doc["id"], valor_nuevo={"username": doc["username"], "role": doc["role"]})
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc


@router.patch("/{user_id}")
async def update_user(user_id: str, payload: UserUpdate, user: dict = Depends(require_roles("admin_general"))):
    db = get_db()
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    updates = {}
    if payload.name is not None: updates["name"] = payload.name
    if payload.email is not None: updates["email"] = payload.email.lower()
    if payload.role is not None:
        if payload.role not in ALLOWED_ROLES:
            raise HTTPException(status_code=400, detail="Rol inválido")
        updates["role"] = payload.role
    if payload.active is not None: updates["active"] = payload.active
    if payload.password: updates["password_hash"] = hash_password(payload.password)
    if payload.convocatoria_roles is not None:
        updates["convocatoria_roles"] = payload.convocatoria_roles
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
    await audit(user, "update", "users", user_id, valor_nuevo=updates)
    out = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return out


@router.delete("/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_roles("admin_general"))):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propio usuario")
    db = get_db()
    await db.users.update_one({"id": user_id}, {"$set": {"active": False}})
    await audit(user, "deactivate", "users", user_id)
    return {"ok": True}



# ===========================================================================
# Envío de correo de bienvenida (Admin → Usuario)
# ===========================================================================
class WelcomePayload(BaseModel):
    password_temporal: Optional[str] = None  # si se pasa, se incluye en el correo
    base_url: Optional[str] = None


@router.post("/{user_id}/send-welcome")
async def send_welcome_email(user_id: str, payload: WelcomePayload,
                             actor: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    """Envía un correo de bienvenida al usuario con su username y (opcional) contraseña temporal.

    Si no se envía contraseña, el correo simplemente le da la bienvenida y le indica
    que puede usar el flujo de "Recuperar contraseña" en el login.
    """
    from email_service import send_email, render_welcome, log_email
    db = get_db()
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if not u.get("email"):
        raise HTTPException(status_code=400, detail="El usuario no tiene email configurado")

    base = payload.base_url or "https://convocatoria-hub-2.preview.emergentagent.com"
    login_url = f"{base.rstrip('/')}/login"

    branding_doc = await db.system_settings.find_one({"id": "global"}, {"_id": 0}) or {}
    product_name = (branding_doc.get("branding") or {}).get("product_name", "KRINOS")

    # Si se provee password temporal, también actualizamos el hash
    if payload.password_temporal:
        await db.users.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(payload.password_temporal)}})

    html, text = render_welcome(
        u.get("name") or u["username"],
        u["username"],
        payload.password_temporal,
        login_url,
        product_name,
    )
    result = await send_email(u["email"], f"Bienvenido(a) a {product_name}", html, text_body=text)
    await log_email(u["email"], "Bienvenida", "welcome", result, user_id=u["id"])
    await audit(actor, "send_welcome", "users", u["id"],
                detalle=f"provider={result.get('provider','?')} ok={result.get('ok')}")
    if not result.get("ok"):
        # mocked o error
        return {"ok": False, "mocked": result.get("mocked", False),
                "message": result.get("message") or result.get("error") or "Servicio de correo no configurado.",
                "reason": result.get("reason")}
    return {"ok": True, "to": u["email"], "provider": result.get("provider")}
