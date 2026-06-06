"""KRINOS - User management (Admin General creates other users)."""
import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, EmailStr, Field

from db import get_db, now_iso
from auth import get_current_user, require_roles, hash_password, audit

router = APIRouter(prefix="/api/users", tags=["users"])


async def _valid_role_codes() -> set[str]:
    """Devuelve todos los códigos de rol válidos (del sistema + custom). Lee desde DB."""
    db = get_db()
    codes = set()
    async for r in db.roles.find({}, {"code": 1, "_id": 0}):
        codes.add(r["code"])
    return codes


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
    valid_roles = await _valid_role_codes()
    if payload.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Rol inválido. Códigos válidos: {sorted(valid_roles)}")
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
        valid_roles = await _valid_role_codes()
        if payload.role not in valid_roles:
            raise HTTPException(status_code=400, detail=f"Rol inválido. Códigos válidos: {sorted(valid_roles)}")
        updates["role"] = payload.role
    if payload.active is not None: updates["active"] = payload.active
    if payload.password: updates["password_hash"] = hash_password(payload.password)
    if payload.convocatoria_roles is not None:
        updates["convocatoria_roles"] = payload.convocatoria_roles

    # Si cambia el email, propagar y mantener consistencia con username y jurado vinculado.
    new_email = updates.get("email")
    if new_email and new_email != (existing.get("email") or "").lower():
        old_email = (existing.get("email") or "").lower()
        old_username = (existing.get("username") or "").lower()
        # 1) username se sincroniza si era igual al email (caso típico de jurados/usuarios creados con email como user)
        if old_username == old_email:
            updates["username"] = new_email
        # 2) Si tiene jurado vinculado, propagar el email
        if existing.get("jurado_id"):
            await db.jurados.update_one(
                {"id": existing["jurado_id"]},
                {"$set": {"email": new_email, "updated_at": now_iso()}}
            )
        # 3) Si no tiene jurado_id pero su rol es jurado y existe un jurado con el email viejo, vincularlo y migrarlo
        elif (updates.get("role") or existing.get("role")) == "jurado" and old_email:
            jur = await db.jurados.find_one({"email": old_email}, {"_id": 0, "id": 1})
            if jur:
                await db.jurados.update_one({"id": jur["id"]},
                                             {"$set": {"email": new_email, "updated_at": now_iso()}})
                updates["jurado_id"] = jur["id"]

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
async def send_welcome_email(user_id: str, payload: WelcomePayload, request: Request,
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

    base = payload.base_url or request.headers.get("origin") or "https://convocatoria-hub-2.emergent.host"
    login_url = f"{base.rstrip('/')}/login"

    branding_doc = await db.system_settings.find_one({"id": "global"}, {"_id": 0}) or {}
    product_name = (branding_doc.get("branding") or {}).get("product_name", "KRINOS")
    entidad = (branding_doc.get("branding") or {}).get("entidad_nombre")

    # Si se provee password temporal, también actualizamos el hash
    if payload.password_temporal:
        await db.users.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(payload.password_temporal)}})

    # Rol legible para el cuerpo del correo
    ROLE_LABELS = {
        "admin_general": "Administrador General",
        "admin_convocatoria": "Administrador de Convocatoria",
        "supervisor": "Supervisor",
        "jurado": "Jurado evaluador",
        "invitado": "Invitado de Consulta",
        "auditor": "Auditor",
    }
    rol_legible = ROLE_LABELS.get(u.get("role"), u.get("role"))

    # Si tiene una sola convocatoria asignada (caso típico), la mostramos
    conv = None
    convs = u.get("convocatoria_roles") or []
    if len(convs) == 1 and convs[0].get("convocatoria_id"):
        conv = await db.convocatorias.find_one({"id": convs[0]["convocatoria_id"]},
                                                {"_id": 0, "nombre": 1, "codigo": 1})

    html, text = render_welcome(
        u.get("name") or u["username"],
        u["username"],
        payload.password_temporal,
        login_url,
        product_name,
        convocatoria_nombre=(conv or {}).get("nombre"),
        convocatoria_codigo=(conv or {}).get("codigo"),
        rol_legible=rol_legible,
        entidad=entidad,
    )
    subject_suffix = f" · {(conv or {}).get('codigo','')}".rstrip(" ·") if conv else ""
    result = await send_email(u["email"], f"Bienvenido(a) a {product_name}{subject_suffix}", html, text_body=text)
    await log_email(u["email"], "Bienvenida", "welcome", result, user_id=u["id"])
    await audit(actor, "send_welcome", "users", u["id"],
                detalle=f"provider={result.get('provider','?')} ok={result.get('ok')}")
    if not result.get("ok"):
        # mocked o error
        return {"ok": False, "mocked": result.get("mocked", False),
                "message": result.get("message") or result.get("error") or "Servicio de correo no configurado.",
                "reason": result.get("reason")}
    return {"ok": True, "to": u["email"], "provider": result.get("provider")}
