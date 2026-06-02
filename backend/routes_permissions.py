"""KRINOS - Permisos predefinidos (matriz rol × módulo × acción).
Versión 1: solo lectura. Los permisos están hard-coded y se exponen para visualización en el panel de Admin."""
from fastapi import APIRouter, Depends
from auth import require_roles

router = APIRouter(prefix="/api/permissions", tags=["permissions"])


# Estructura: rol -> { módulo: [acciones permitidas] }
# Acciones canónicas: view, create, edit, delete, evaluate, sign, generate, approve, export, audit
ROLE_PERMISSIONS = {
    "admin_general": {
        "convocatorias":   ["view", "create", "edit", "delete", "approve"],
        "campos":          ["view", "create", "edit", "delete"],
        "catalogos":       ["view", "create", "edit", "delete"],
        "criterios":       ["view", "create", "edit", "delete"],
        "desempates":      ["view", "create", "edit", "delete"],
        "propuestas":      ["view", "create", "edit", "delete", "export"],
        "jurados":         ["view", "create", "edit", "delete"],
        "ternas":          ["view", "create", "edit", "delete"],
        "asignaciones":    ["view", "create", "edit", "delete"],
        "evaluaciones":    ["view", "edit", "evaluate", "sign", "reopen"],
        "ranking":         ["view", "generate"],
        "actas":           ["view", "generate", "sign"],
        "reportes":        ["view", "export"],
        "dashboard":       ["view"],
        "auditoria":       ["view", "export"],
        "usuarios":        ["view", "create", "edit", "delete"],
        "settings":        ["view", "edit"],
        "ia":              ["view", "use", "configure"],
    },
    "admin_convocatoria": {
        "convocatorias":   ["view", "edit"],  # solo las asignadas
        "campos":          ["view", "create", "edit", "delete"],
        "catalogos":       ["view", "create", "edit"],
        "criterios":       ["view", "create", "edit"],
        "desempates":      ["view", "create", "edit"],
        "propuestas":      ["view", "create", "edit", "export"],
        "jurados":         ["view", "create", "edit"],
        "ternas":          ["view", "create", "edit"],
        "asignaciones":    ["view", "create", "edit"],
        "evaluaciones":    ["view", "reopen"],
        "ranking":         ["view", "generate"],
        "actas":           ["view", "generate"],
        "reportes":        ["view", "export"],
        "dashboard":       ["view"],
        "auditoria":       ["view"],
        "usuarios":        [],
        "settings":        [],
        "ia":              ["use"],
    },
    "supervisor": {
        "convocatorias":   ["view"],
        "campos":          ["view"], "catalogos": ["view"], "criterios": ["view"], "desempates": ["view"],
        "propuestas":      ["view", "export"],
        "jurados":         ["view"], "ternas": ["view"], "asignaciones": ["view"],
        "evaluaciones":    ["view"],
        "ranking":         ["view"],
        "actas":           ["view"],
        "reportes":        ["view", "export"],
        "dashboard":       ["view"],
        "auditoria":       ["view"],
        "usuarios": [], "settings": [], "ia": [],
    },
    "jurado": {
        "convocatorias":   ["view"],
        "campos": [], "catalogos": [], "criterios": ["view"], "desempates": ["view"],
        "propuestas":      ["view"],  # solo asignadas
        "jurados":         [], "ternas": ["view"], "asignaciones": ["view"],  # solo propias
        "evaluaciones":    ["view", "evaluate", "sign"],
        "ranking":         [],
        "actas":           ["view"],  # solo propias
        "reportes":        [],
        "dashboard":       ["view"],
        "auditoria":       [],
        "usuarios": [], "settings": [], "ia": ["use"],
    },
    "integrante_terna": {
        "convocatorias":   ["view"],
        "campos": [], "catalogos": [], "criterios": ["view"], "desempates": ["view"],
        "propuestas":      ["view"],
        "jurados": [], "ternas": ["view"], "asignaciones": ["view"],
        "evaluaciones":    ["view", "evaluate", "sign"],  # colectivas
        "ranking":         ["view"],
        "actas":           ["view", "sign"],  # colectivas
        "reportes":        [],
        "dashboard":       ["view"],
        "auditoria":       [],
        "usuarios": [], "settings": [], "ia": ["use"],
    },
    "invitado": {
        "convocatorias":   ["view"],
        "propuestas":      ["view"],
        "ranking":         ["view"],
        "actas":           ["view"],
        "reportes":        ["view"],
        "dashboard":       ["view"],
        "campos": [], "catalogos": [], "criterios": [], "desempates": [],
        "jurados": [], "ternas": [], "asignaciones": [], "evaluaciones": [],
        "usuarios": [], "settings": [], "auditoria": [], "ia": [],
    },
    "auditor": {
        "convocatorias":   ["view"],
        "campos": ["view"], "catalogos": ["view"], "criterios": ["view"], "desempates": ["view"],
        "propuestas":      ["view"],
        "jurados":         ["view"], "ternas": ["view"], "asignaciones": ["view"],
        "evaluaciones":    ["view"],
        "ranking":         ["view"],
        "actas":           ["view"],
        "reportes":        ["view", "export"],
        "dashboard":       ["view"],
        "auditoria":       ["view", "export"],
        "usuarios":        ["view"],
        "settings":        ["view"],
        "ia":              [],
    },
}

ALL_ROLES = list(ROLE_PERMISSIONS.keys())
ALL_MODULES = sorted({m for r in ROLE_PERMISSIONS.values() for m in r.keys()})
ALL_ACTIONS = ["view", "create", "edit", "delete", "evaluate", "sign", "reopen", "generate", "approve", "export", "use", "configure"]


@router.get("/matrix")
async def get_permission_matrix(user: dict = Depends(require_roles("admin_general", "auditor", "supervisor"))):
    """Devuelve la matriz completa para visualización."""
    return {
        "roles": ALL_ROLES,
        "modules": ALL_MODULES,
        "actions": ALL_ACTIONS,
        "permissions": ROLE_PERMISSIONS,
        "version": "1.0",
        "editable": False,
        "note": "Permisos predefinidos por rol (v1). La edición granular se libera en una segunda fase.",
    }


@router.get("/me")
async def get_my_permissions(user: dict = Depends(require_roles("admin_general", "admin_convocatoria", "supervisor", "jurado", "integrante_terna", "invitado", "auditor"))):
    """Devuelve los permisos del usuario actual según su rol."""
    role = user.get("role", "invitado")
    perms = ROLE_PERMISSIONS.get(role, {})
    return {"role": role, "permissions": perms}
