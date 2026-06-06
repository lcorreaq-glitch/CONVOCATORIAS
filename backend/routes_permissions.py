"""KRINOS - Roles y Permisos (CRUD editable persistido en MongoDB).

Colección `roles`: cada documento representa un rol con su matriz de permisos.
Estructura:
{
  id: str,                # uuid
  code: str,              # identificador único interno (ej. 'admin_general')
  name: str,              # nombre visible
  description: str,
  is_system: bool,        # roles del sistema NO se pueden eliminar (pero sí editar permisos)
  permissions: { modulo: [acciones], ... },
  created_at, updated_at
}
"""
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from db import get_db, now_iso
from auth import require_roles, audit, get_current_user

router = APIRouter(prefix="/api/permissions", tags=["permissions"])


# ---------------------------------------------------------------------------
# Catálogo canónico de módulos y acciones del sistema
# ---------------------------------------------------------------------------
# Cada módulo tiene un set de acciones disponibles. La UI usa esto para
# construir la matriz de permisos editable.
MODULES_CATALOG = [
    {"code": "dashboard",     "label": "Dashboard",                 "actions": ["view"]},
    {"code": "convocatorias", "label": "Convocatorias",             "actions": ["view", "create", "edit", "delete", "approve"]},
    {"code": "configuracion", "label": "Configuración",             "actions": ["view", "edit"]},
    {"code": "campos",        "label": "Campos personalizados",     "actions": ["view", "create", "edit", "delete"]},
    {"code": "catalogos",     "label": "Catálogos",                 "actions": ["view", "create", "edit", "delete"]},
    {"code": "criterios",     "label": "Criterios",                 "actions": ["view", "create", "edit", "delete"]},
    {"code": "desempates",    "label": "Desempates",                "actions": ["view", "create", "edit", "delete"]},
    {"code": "propuestas",    "label": "Propuestas",                "actions": ["view", "create", "edit", "delete", "import", "export"]},
    {"code": "jurados",       "label": "Jurados",                   "actions": ["view", "create", "edit", "delete", "import", "send_welcome", "reset_password"]},
    {"code": "ternas",        "label": "Ternas / Grupos",           "actions": ["view", "create", "edit", "delete"]},
    {"code": "asignaciones",  "label": "Asignaciones",              "actions": ["view", "create", "edit", "delete", "auto"]},
    {"code": "evaluaciones",  "label": "Evaluaciones",              "actions": ["view", "evaluate", "sign", "reopen", "delete"]},
    {"code": "ranking",       "label": "Ranking & Resultados",      "actions": ["view", "generate", "delete"]},
    {"code": "actas",         "label": "Actas",                     "actions": ["view", "generate", "sign", "configure"]},
    {"code": "reportes",      "label": "Reportes",                  "actions": ["view", "export"]},
    {"code": "auditoria",     "label": "Auditoría",                 "actions": ["view", "export"]},
    {"code": "administracion","label": "Administración (panel)",    "actions": ["view"]},
    {"code": "usuarios",      "label": "Usuarios",                  "actions": ["view", "create", "edit", "delete", "send_welcome"]},
    {"code": "roles",         "label": "Roles & Permisos",          "actions": ["view", "create", "edit", "delete"]},
    {"code": "sistema",       "label": "Sistema (reset operativo)", "actions": ["view", "reset", "seed"]},
    {"code": "settings",      "label": "Configuración global",      "actions": ["view", "edit"]},
    {"code": "ia",            "label": "IA Asistida",               "actions": ["view", "use", "configure"]},
    {"code": "email",         "label": "Correos (Gmail/SendGrid)",  "actions": ["view", "configure", "send"]},
    {"code": "mi_perfil",     "label": "Mi perfil",                 "actions": ["view", "edit"]},
]

ALL_ACTIONS = sorted({a for m in MODULES_CATALOG for a in m["actions"]})


# ---------------------------------------------------------------------------
# Roles SEED (defaults que se crean si no existen)
# ---------------------------------------------------------------------------
SYSTEM_ROLES = [
    {
        "code": "admin_general", "name": "Administrador General", "is_system": True,
        "description": "Acceso total al sistema. No se puede eliminar.",
        "permissions": {m["code"]: list(m["actions"]) for m in MODULES_CATALOG},
    },
    {
        "code": "admin_convocatoria", "name": "Administrador de Convocatoria", "is_system": True,
        "description": "Gestiona una convocatoria específica. Sin acceso a usuarios/roles ni sistema.",
        "permissions": {
            "dashboard": ["view"], "convocatorias": ["view", "edit"],
            "configuracion": ["view", "edit"],
            "campos": ["view", "create", "edit", "delete"],
            "catalogos": ["view", "create", "edit", "delete"],
            "criterios": ["view", "create", "edit", "delete"],
            "desempates": ["view", "create", "edit", "delete"],
            "propuestas": ["view", "create", "edit", "delete", "import", "export"],
            "jurados": ["view", "create", "edit", "delete", "import", "send_welcome", "reset_password"],
            "ternas": ["view", "create", "edit", "delete"],
            "asignaciones": ["view", "create", "edit", "delete", "auto"],
            "evaluaciones": ["view", "evaluate", "reopen"],
            "ranking": ["view", "generate"],
            "actas": ["view", "generate", "configure"],
            "reportes": ["view", "export"],
            "auditoria": ["view"],
            "administracion": ["view"],
            "usuarios": ["view", "send_welcome"],
            "roles": [],
            "sistema": [],
            "settings": ["view"],
            "ia": ["view", "use"],
            "email": ["view"],
            "mi_perfil": ["view", "edit"],
        },
    },
    {
        "code": "supervisor", "name": "Supervisor", "is_system": True,
        "description": "Monitorea el avance. Solo lectura + exportes.",
        "permissions": {
            "dashboard": ["view"], "convocatorias": ["view"],
            "configuracion": ["view"], "campos": ["view"], "catalogos": ["view"],
            "criterios": ["view"], "desempates": ["view"],
            "propuestas": ["view", "export"],
            "jurados": ["view"], "ternas": ["view"], "asignaciones": ["view"],
            "evaluaciones": ["view"], "ranking": ["view"], "actas": ["view"],
            "reportes": ["view", "export"], "auditoria": ["view"],
            "mi_perfil": ["view", "edit"],
        },
    },
    {
        "code": "jurado", "name": "Jurado", "is_system": True,
        "description": "Evalúa propuestas asignadas.",
        "permissions": {
            "dashboard": ["view"],
            "propuestas": ["view"], "criterios": ["view"], "desempates": ["view"],
            "ternas": ["view"], "asignaciones": ["view"],
            "evaluaciones": ["view", "evaluate", "sign"],
            "actas": ["view"], "mi_perfil": ["view", "edit"],
            "ia": ["use"],
        },
    },
    {
        "code": "integrante_terna", "name": "Integrante de Terna", "is_system": True,
        "description": "Participa en deliberación colectiva.",
        "permissions": {
            "dashboard": ["view"],
            "propuestas": ["view"], "criterios": ["view"],
            "ternas": ["view"], "asignaciones": ["view"],
            "evaluaciones": ["view", "evaluate", "sign"],
            "actas": ["view", "sign"], "ranking": ["view"],
            "mi_perfil": ["view", "edit"],
            "ia": ["use"],
        },
    },
    {
        "code": "invitado", "name": "Invitado de Consulta", "is_system": True,
        "description": "Solo lectura de resultados públicos.",
        "permissions": {
            "dashboard": ["view"], "convocatorias": ["view"],
            "propuestas": ["view"], "ranking": ["view"], "actas": ["view"],
            "reportes": ["view"], "mi_perfil": ["view", "edit"],
        },
    },
    {
        "code": "auditor", "name": "Auditor", "is_system": True,
        "description": "Acceso completo de lectura para trazabilidad.",
        "permissions": {
            "dashboard": ["view"], "convocatorias": ["view"],
            "configuracion": ["view"], "campos": ["view"], "catalogos": ["view"],
            "criterios": ["view"], "desempates": ["view"],
            "propuestas": ["view"], "jurados": ["view"], "ternas": ["view"],
            "asignaciones": ["view"], "evaluaciones": ["view"],
            "ranking": ["view"], "actas": ["view"],
            "reportes": ["view", "export"], "auditoria": ["view", "export"],
            "usuarios": ["view"], "settings": ["view"],
            "mi_perfil": ["view", "edit"],
        },
    },
]


async def seed_roles():
    """Crea (idempotente) los roles del sistema. Se llama al startup."""
    db = get_db()
    # Backfill: asegurar que cualquier rol existente sin flag 'active' quede activo por defecto.
    await db.roles.update_many({"active": {"$exists": False}}, {"$set": {"active": True}})
    for r in SYSTEM_ROLES:
        existing = await db.roles.find_one({"code": r["code"]})
        if existing:
            # Asegurar permisos mínimos del sistema en cada módulo nuevo
            updated = dict(existing.get("permissions") or {})
            changed = False
            for mod_code, default_acts in r["permissions"].items():
                if mod_code not in updated:
                    updated[mod_code] = list(default_acts)
                    changed = True
            if changed:
                await db.roles.update_one({"code": r["code"]}, {"$set": {"permissions": updated}})
        else:
            doc = {
                "id": str(uuid.uuid4()),
                "code": r["code"], "name": r["name"],
                "description": r["description"],
                "is_system": True,
                "active": True,
                "permissions": r["permissions"],
                "created_at": now_iso(), "updated_at": now_iso(),
            }
            await db.roles.insert_one(doc)


# ---------------------------------------------------------------------------
# GET catálogo de módulos + acciones
# ---------------------------------------------------------------------------
@router.get("/catalog")
async def get_catalog(user: dict = Depends(get_current_user)):
    """Devuelve el catálogo canónico de módulos + todas las acciones posibles."""
    return {"modules": MODULES_CATALOG, "actions": ALL_ACTIONS}


# ---------------------------------------------------------------------------
# GET roles (lista)
# ---------------------------------------------------------------------------
@router.get("/roles")
async def list_roles(user: dict = Depends(get_current_user)):
    db = get_db()
    items = []
    async for r in db.roles.find({}, {"_id": 0}).sort("is_system", -1):
        items.append(r)
    return items


@router.get("/roles/{code}")
async def get_role(code: str, user: dict = Depends(get_current_user)):
    db = get_db()
    r = await db.roles.find_one({"code": code}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    return r


# ---------------------------------------------------------------------------
# CRUD Roles
# ---------------------------------------------------------------------------
class RoleCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = ""
    permissions: Optional[dict] = None


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[dict] = None
    active: Optional[bool] = None


@router.post("/roles")
async def create_role(payload: RoleCreate, user: dict = Depends(require_roles("admin_general"))):
    code = payload.code.strip().lower().replace(" ", "_")
    if not code or not code.replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="El código solo puede contener letras, números y guiones bajos.")
    db = get_db()
    existing = await db.roles.find_one({"code": code})
    if existing:
        raise HTTPException(status_code=400, detail=f"Ya existe un rol con código '{code}'.")
    # Sanear permisos contra el catálogo
    perms_clean = {}
    valid_modules = {m["code"]: set(m["actions"]) for m in MODULES_CATALOG}
    for mod, acts in (payload.permissions or {}).items():
        if mod in valid_modules and isinstance(acts, list):
            perms_clean[mod] = [a for a in acts if a in valid_modules[mod]]
    doc = {
        "id": str(uuid.uuid4()),
        "code": code, "name": payload.name.strip(),
        "description": (payload.description or "").strip(),
        "is_system": False,
        "active": True,
        "permissions": perms_clean,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.roles.insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "create", "roles", doc["id"], valor_nuevo={"code": code, "name": payload.name})
    return doc


@router.patch("/roles/{code}")
async def update_role(code: str, payload: RoleUpdate, user: dict = Depends(require_roles("admin_general"))):
    db = get_db()
    role = await db.roles.find_one({"code": code})
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    updates = {}
    if payload.name is not None:
        updates["name"] = payload.name.strip()
    if payload.description is not None:
        updates["description"] = payload.description.strip()
    if payload.permissions is not None:
        valid_modules = {m["code"]: set(m["actions"]) for m in MODULES_CATALOG}
        perms_clean = {}
        for mod, acts in payload.permissions.items():
            if mod in valid_modules and isinstance(acts, list):
                perms_clean[mod] = [a for a in acts if a in valid_modules[mod]]
        # Para admin_general, asegurar siempre acceso completo al menos a roles/usuarios/sistema
        # (evitar que el admin se auto-bloquee).
        if code == "admin_general":
            for must in ("roles", "usuarios", "sistema", "administracion"):
                if must not in perms_clean or not perms_clean[must]:
                    perms_clean[must] = list(valid_modules[must])
        updates["permissions"] = perms_clean
    if payload.active is not None:
        if code == "admin_general" and payload.active is False:
            raise HTTPException(status_code=400, detail="El rol Administrador General no puede desactivarse.")
        updates["active"] = bool(payload.active)
    if updates:
        updates["updated_at"] = now_iso()
        await db.roles.update_one({"code": code}, {"$set": updates})
    role = await db.roles.find_one({"code": code}, {"_id": 0})
    await audit(user, "update", "roles", role["id"], valor_nuevo=list(updates.keys()))
    return role


@router.delete("/roles/{code}")
async def delete_role(code: str, user: dict = Depends(require_roles("admin_general"))):
    db = get_db()
    role = await db.roles.find_one({"code": code})
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    if role.get("is_system"):
        raise HTTPException(status_code=400, detail="No se puede eliminar un rol del sistema. Puedes editar sus permisos.")
    # Verificar si hay usuarios asignados a este rol
    count = await db.users.count_documents({"role": code})
    if count > 0:
        raise HTTPException(status_code=400, detail=f"No se puede eliminar: {count} usuario(s) tienen asignado este rol. Reasígnalos primero.")
    await db.roles.delete_one({"code": code})
    await audit(user, "delete", "roles", role["id"], detalle=f"code={code}, name={role.get('name')}")
    return {"ok": True}


# ---------------------------------------------------------------------------
# PATCH activar / desactivar rol (toggle dedicado)
# ---------------------------------------------------------------------------
class RoleActiveToggle(BaseModel):
    active: bool


@router.patch("/roles/{code}/active")
async def set_role_active(code: str, payload: RoleActiveToggle,
                          user: dict = Depends(require_roles("admin_general"))):
    """Activa o desactiva un rol. Un rol inactivo bloquea el login de cualquier
    usuario que lo tenga asignado. El rol Administrador General no puede desactivarse."""
    db = get_db()
    role = await db.roles.find_one({"code": code})
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    if code == "admin_general" and payload.active is False:
        raise HTTPException(status_code=400, detail="El rol Administrador General no puede desactivarse.")
    affected = await db.users.count_documents({"role": code, "active": True})
    await db.roles.update_one(
        {"code": code},
        {"$set": {"active": bool(payload.active), "updated_at": now_iso()}},
    )
    await audit(user, "toggle_active", "roles", role["id"],
                detalle=f"code={code}, active={payload.active}, usuarios_afectados={affected}")
    return {"ok": True, "active": bool(payload.active), "usuarios_afectados": affected}


# ---------------------------------------------------------------------------
# PATCH permisos granular (toggle de una acción específica)
# ---------------------------------------------------------------------------
class TogglePermission(BaseModel):
    module: str
    action: str
    allowed: bool


@router.patch("/roles/{code}/permissions")
async def toggle_permission(code: str, payload: TogglePermission, user: dict = Depends(require_roles("admin_general"))):
    db = get_db()
    role = await db.roles.find_one({"code": code})
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    valid_modules = {m["code"]: set(m["actions"]) for m in MODULES_CATALOG}
    if payload.module not in valid_modules:
        raise HTTPException(status_code=400, detail="Módulo inválido.")
    if payload.action not in valid_modules[payload.module]:
        raise HTTPException(status_code=400, detail="Acción inválida para este módulo.")
    perms = dict(role.get("permissions") or {})
    current = set(perms.get(payload.module, []))
    if payload.allowed:
        current.add(payload.action)
    else:
        # admin_general no puede perder acceso crítico
        if code == "admin_general" and payload.module in ("roles", "usuarios", "sistema", "administracion") and payload.action == "view":
            raise HTTPException(status_code=400, detail="No se puede quitar el acceso de administración al rol Administrador General.")
        current.discard(payload.action)
    perms[payload.module] = sorted(current)
    await db.roles.update_one({"code": code}, {"$set": {"permissions": perms, "updated_at": now_iso()}})
    await audit(user, "toggle_permission", "roles", role["id"],
                detalle=f"{code} · {payload.module}.{payload.action} = {payload.allowed}")
    return {"ok": True, "permissions": perms}


# ---------------------------------------------------------------------------
# GET matriz completa (para el panel de admin)
# ---------------------------------------------------------------------------
@router.get("/matrix")
async def get_matrix(user: dict = Depends(get_current_user)):
    """Devuelve roles + módulos + permisos consolidados para el panel UI."""
    db = get_db()
    roles = []
    async for r in db.roles.find({}, {"_id": 0}).sort("is_system", -1):
        roles.append(r)
    return {
        "modules": MODULES_CATALOG,
        "actions": ALL_ACTIONS,
        "roles": roles,
        "editable": True,
        "version": "2.0",
    }


# ---------------------------------------------------------------------------
# GET permisos del usuario actual
# ---------------------------------------------------------------------------
@router.get("/me")
async def get_my_permissions(user: dict = Depends(get_current_user)):
    db = get_db()
    role = await db.roles.find_one({"code": user.get("role")}, {"_id": 0})
    if not role:
        # Fallback: invitado de solo lectura
        return {"role": user.get("role"), "permissions": {"dashboard": ["view"], "mi_perfil": ["view", "edit"]}}
    return {"role": role["code"], "name": role.get("name"),
            "permissions": role.get("permissions", {})}
