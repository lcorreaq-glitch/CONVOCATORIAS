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


@router.post("/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    ident = (payload.username or "").strip().lower()
    if not ident:
        raise HTTPException(status_code=400, detail="Usuario requerido")
    ip = request.client.host if request.client else "anon"
    lock_key = f"{ip}:{ident}"
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


@router.post("/refresh")
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
