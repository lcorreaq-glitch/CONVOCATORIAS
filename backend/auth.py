"""KRINOS - JWT Authentication helpers and routes."""
import os
import uuid
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, Field

from db import get_db, now_iso

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 8  # 8 horas para experiencia institucional
REFRESH_TOKEN_DAYS = 7
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, username: str, role: str) -> str:
    payload = {
        "sub": user_id, "username": username, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie(
        "access_token", access_token, httponly=True, secure=False,
        samesite="lax", max_age=ACCESS_TOKEN_MINUTES * 60, path="/",
    )
    response.set_cookie(
        "refresh_token", refresh_token, httponly=True, secure=False,
        samesite="lax", max_age=REFRESH_TOKEN_DAYS * 86400, path="/",
    )


def clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token inválido")
        db = get_db()
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user or not user.get("active", True):
            raise HTTPException(status_code=401, detail="Usuario inactivo o no encontrado")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesión expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


def require_roles(*roles: str):
    async def checker(user: dict = Depends(get_current_user)):
        if user["role"] not in roles and user["role"] != "admin_general":
            raise HTTPException(status_code=403, detail="Acceso restringido")
        return user
    return checker


# ============== Audit Helper ==============
async def audit(user: Optional[dict], accion: str, entidad: str,
                registro_id: Optional[str] = None,
                valor_anterior=None, valor_nuevo=None,
                detalle: Optional[str] = None):
    db = get_db()
    await db.auditoria.insert_one({
        "id": str(uuid.uuid4()),
        "usuario_id": user["id"] if user else "system",
        "username": user["username"] if user else "system",
        "rol": user["role"] if user else "system",
        "accion": accion,
        "entidad": entidad,
        "registro_id": registro_id,
        "valor_anterior": valor_anterior,
        "valor_nuevo": valor_nuevo,
        "detalle": detalle,
        "fecha": now_iso(),
    })


# ============== Brute force ==============
async def check_lockout(identifier: str):
    db = get_db()
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if not rec:
        return
    if rec.get("count", 0) >= MAX_FAILED_ATTEMPTS:
        last = rec.get("last_attempt")
        if last:
            try:
                last_dt = datetime.fromisoformat(last)
                if datetime.now(timezone.utc) - last_dt < timedelta(minutes=LOCKOUT_MINUTES):
                    raise HTTPException(status_code=429, detail=f"Demasiados intentos fallidos. Intenta en {LOCKOUT_MINUTES} minutos.")
            except ValueError:
                pass
        await db.login_attempts.delete_one({"identifier": identifier})


async def register_failed_attempt(identifier: str):
    db = get_db()
    await db.login_attempts.update_one(
        {"identifier": identifier},
        {"$inc": {"count": 1}, "$set": {"last_attempt": now_iso()}},
        upsert=True,
    )


async def clear_attempts(identifier: str):
    db = get_db()
    await db.login_attempts.delete_one({"identifier": identifier})


# ============== Router ==============
router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: str
    username: str
    email: str
    name: str
    role: str
    active: bool = True
    convocatoria_roles: list = Field(default_factory=list)
    jurado_id: Optional[str] = None  # solo para usuarios con rol jurado


@router.post("/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    ident = (payload.username or "").strip().lower()
    if not ident:
        raise HTTPException(status_code=400, detail="Usuario requerido")
    ip = request.client.host if request.client else "anon"
    # Use identifier-only key (k8s ingress IPs are unstable)
    lock_key = ident
    await check_lockout(lock_key)

    db = get_db()
    user = await db.users.find_one({"$or": [{"username": ident}, {"email": ident}]})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        await register_failed_attempt(lock_key)
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Usuario inactivo")

    await clear_attempts(lock_key)
    access = create_access_token(user["id"], user["username"], user["role"])
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    await audit(user, "login", "auth", user["id"], detalle=f"IP {ip}")

    return {
        "id": user["id"], "username": user["username"], "email": user["email"],
        "name": user["name"], "role": user["role"], "active": user.get("active", True),
        "convocatoria_roles": user.get("convocatoria_roles", []),
        "access_token": access,
    }


@router.post("/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    await audit(user, "logout", "auth", user["id"])
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(**user)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
async def change_password(payload: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    """Permite que el usuario autenticado cambie SU propia contraseña.
    Requiere la contraseña actual + la nueva (mín. 6 caracteres).
    """
    if not payload.new_password or len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 6 caracteres.")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe ser distinta de la actual.")
    db = get_db()
    u = await db.users.find_one({"id": current_user["id"]})
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if not verify_password(payload.current_password, u["password_hash"]):
        raise HTTPException(status_code=400, detail="La contraseña actual es incorrecta.")
    await db.users.update_one(
        {"id": u["id"]},
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    await audit(u, "change_password", "auth", u["id"], detalle="self-service via /mi-perfil")
    return {"ok": True, "message": "Contraseña actualizada correctamente."}


class UpdateMeRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None


@router.patch("/me")
async def update_me(payload: UpdateMeRequest, current_user: dict = Depends(get_current_user)):
    """Permite que el usuario autenticado actualice su nombre y email."""
    db = get_db()
    updates = {}
    if payload.name is not None:
        updates["name"] = payload.name.strip()
    if payload.email is not None:
        new_email = payload.email.strip().lower()
        # Verificar que no esté usado por otro usuario
        existing = await db.users.find_one({"email": new_email, "id": {"$ne": current_user["id"]}})
        if existing:
            raise HTTPException(status_code=400, detail="Ese correo ya está en uso.")
        updates["email"] = new_email
    if not updates:
        return {"ok": True, "message": "Sin cambios."}
    await db.users.update_one({"id": current_user["id"]}, {"$set": updates})
    await audit(current_user, "update", "users", current_user["id"], valor_nuevo=updates)
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "password_hash": 0})
    return user
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Token inválido")
        db = get_db()
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        access = create_access_token(user["id"], user["username"], user["role"])
        response.set_cookie("access_token", access, httponly=True, secure=False,
                            samesite="lax", max_age=ACCESS_TOKEN_MINUTES * 60, path="/")
        return {"ok": True}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


# ===========================================================================
# Recuperar contraseña — flujo estándar con token (expira 1 hora)
# ===========================================================================
RESET_TOKEN_MINUTES = 60


def _create_reset_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id, "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_MINUTES),
        "type": "reset",
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


class ForgotPasswordRequest(BaseModel):
    email: str
    base_url: Optional[str] = None  # URL del frontend (origin) para construir el link


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, request: Request):
    """Solicita el envío de un correo con link de recuperación.

    Por seguridad SIEMPRE devuelve `{ok: true}`, no revela si el email existe o no.
    """
    from email_service import send_email, render_reset, log_email, get_email_config

    ident = (payload.email or "").strip().lower()
    if not ident:
        raise HTTPException(status_code=400, detail="Email requerido")
    db = get_db()
    user = await db.users.find_one({"$or": [{"email": ident}, {"username": ident}]})

    # Siempre responder OK para no revelar usuarios existentes
    if not user:
        return {"ok": True, "message": "Si el correo está registrado, recibirás un enlace en breve."}

    token = _create_reset_token(user["id"], user["email"])
    base = payload.base_url or (request.headers.get("origin") or "").rstrip("/")
    reset_url = f"{base}/reset-password?token={token}"

    # Cargar branding
    doc_settings = await db.system_settings.find_one({"id": "global"}, {"_id": 0}) or {}
    product_name = (doc_settings.get("branding") or {}).get("product_name", "KRINOS")

    html, text = render_reset(user.get("name", user["username"]), reset_url, product_name)
    result = await send_email(user["email"], "Recuperar contraseña — KRINOS", html, text_body=text)
    await log_email(user["email"], "Recuperar contraseña", "reset_password", result, user_id=user["id"])
    await audit(user, "forgot_password", "auth", user["id"],
                detalle=f"provider={result.get('provider','?')} ok={result.get('ok')}")
    return {"ok": True, "message": "Si el correo está registrado, recibirás un enlace en breve."}


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    if not payload.new_password or len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres.")
    try:
        data = jwt.decode(payload.token, _secret(), algorithms=[JWT_ALGORITHM])
        if data.get("type") != "reset":
            raise HTTPException(status_code=400, detail="Token inválido.")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="El enlace de recuperación ha expirado. Solicita uno nuevo.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=400, detail="Token inválido.")

    db = get_db()
    user = await db.users.find_one({"id": data["sub"]})
    if not user:
        raise HTTPException(status_code=400, detail="Usuario no encontrado.")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    # Limpiar bloqueos previos por brute force
    await db.login_attempts.delete_one({"identifier": user["username"]})
    await db.login_attempts.delete_one({"identifier": user["email"]})
    await audit(user, "reset_password", "auth", user["id"], detalle="self-service")
    return {"ok": True, "message": "Contraseña actualizada. Ya puedes iniciar sesión."}
