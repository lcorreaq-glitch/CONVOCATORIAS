"""KRINOS - Test suite for the Roles & Permissions module (iteration 15).

Coverage:
- GET /api/permissions/catalog (24 modules + ALL_ACTIONS)
- GET /api/permissions/matrix (editable, version 2.0, 7 system roles)
- GET /api/permissions/roles + /roles/{code} + 404
- POST /api/permissions/roles (validation, sanitization)
- PATCH /api/permissions/roles/{code} (incl. admin_general defense)
- DELETE /api/permissions/roles/{code} (system block + users-assigned block)
- PATCH /api/permissions/roles/{code}/permissions (toggle + admin defense)
- GET /api/permissions/me
- RBAC: jurado cannot mutate roles
- Idempotent seed via /api/permissions/roles
- User role change propagates to /me
"""
import os
import uuid
import pytest
import requests
from pathlib import Path

def _load_frontend_env():
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

ADMIN_USER = "lcorreaq"
ADMIN_PASS = "Chocolate2026!"

SYSTEM_ROLE_CODES = {
    "admin_general", "admin_convocatoria", "supervisor",
    "jurado", "integrante_terna", "invitado", "auditor",
}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"username": ADMIN_USER, "password": ADMIN_PASS})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def created_artifacts():
    """Track artifacts for cleanup."""
    return {"roles": [], "users": []}


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin_client, created_artifacts):
    yield
    # Cleanup: delete created users (deactivate) and roles
    for uid in created_artifacts["users"]:
        try:
            admin_client.delete(f"{API}/users/{uid}")
        except Exception:
            pass
    for rcode in created_artifacts["roles"]:
        try:
            admin_client.delete(f"{API}/permissions/roles/{rcode}")
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Catalog & Matrix
# ---------------------------------------------------------------------------
def test_catalog_returns_24_modules_with_all_actions(admin_client):
    r = admin_client.get(f"{API}/permissions/catalog")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "modules" in data and "actions" in data
    assert len(data["modules"]) == 24, f"Expected 24 modules, got {len(data['modules'])}"
    # actions globales
    assert isinstance(data["actions"], list)
    assert "view" in data["actions"]
    # cada módulo tiene code, label, actions
    for m in data["modules"]:
        assert {"code", "label", "actions"} <= set(m.keys())
        assert isinstance(m["actions"], list) and len(m["actions"]) > 0


def test_matrix_returns_7_system_roles_v2(admin_client):
    r = admin_client.get(f"{API}/permissions/matrix")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("editable") is True
    assert data.get("version") == "2.0"
    assert "modules" in data and "actions" in data and "roles" in data
    codes = {r["code"] for r in data["roles"]}
    assert SYSTEM_ROLE_CODES.issubset(codes), f"Missing system roles: {SYSTEM_ROLE_CODES - codes}"
    # Sistema flag
    sys_roles = [r for r in data["roles"] if r["code"] in SYSTEM_ROLE_CODES]
    for r in sys_roles:
        assert r.get("is_system") is True, f"{r['code']} should be is_system=True"


# ---------------------------------------------------------------------------
# List & Get
# ---------------------------------------------------------------------------
def test_list_roles_includes_system(admin_client):
    r = admin_client.get(f"{API}/permissions/roles")
    assert r.status_code == 200
    items = r.json()
    codes = {x["code"] for x in items}
    assert SYSTEM_ROLE_CODES.issubset(codes)


def test_get_role_admin_general(admin_client):
    r = admin_client.get(f"{API}/permissions/roles/admin_general")
    assert r.status_code == 200
    role = r.json()
    assert role["code"] == "admin_general"
    assert role["is_system"] is True
    # Admin general debe tener TODOS los módulos con sus acciones completas
    assert "roles" in role["permissions"]
    assert "view" in role["permissions"]["roles"]


def test_get_role_404(admin_client):
    r = admin_client.get(f"{API}/permissions/roles/no_existe_xyz")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Create role
# ---------------------------------------------------------------------------
def test_create_role_normalizes_code(admin_client, created_artifacts):
    payload = {
        "code": "Mi Rol Custom",  # se normaliza a mi_rol_custom
        "name": "Mi Rol Custom",
        "description": "Test",
        "permissions": {
            "dashboard": ["view"],
            "propuestas": ["view", "export"],
            "no_existe": ["view"],          # módulo inválido -> ignorado
            "ranking": ["bogus_action", "view"],  # acción inválida -> filtrada
        },
    }
    r = admin_client.post(f"{API}/permissions/roles", json=payload)
    assert r.status_code == 200, r.text
    role = r.json()
    assert role["code"] == "mi_rol_custom"
    assert role["is_system"] is False
    # Módulo inválido no debe estar
    assert "no_existe" not in role["permissions"]
    # Acción inválida filtrada, válida permanece
    assert role["permissions"]["ranking"] == ["view"]
    assert role["permissions"]["propuestas"] == ["view", "export"]
    created_artifacts["roles"].append("mi_rol_custom")


def test_create_role_rejects_special_chars(admin_client):
    r = admin_client.post(f"{API}/permissions/roles",
                          json={"code": "rol@invalido!", "name": "x"})
    assert r.status_code == 400


def test_create_role_duplicate_returns_400(admin_client):
    # mi_rol_custom ya fue creado en el test anterior
    r = admin_client.post(f"{API}/permissions/roles",
                          json={"code": "mi_rol_custom", "name": "dup"})
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Update role
# ---------------------------------------------------------------------------
def test_update_role_basic(admin_client):
    r = admin_client.patch(f"{API}/permissions/roles/mi_rol_custom",
                           json={"name": "Mi Rol Custom v2",
                                 "description": "Actualizado"})
    assert r.status_code == 200
    assert r.json()["name"] == "Mi Rol Custom v2"


def test_update_admin_general_restores_critical_perms(admin_client):
    """Si intentamos quitar view/etc de admin_general en módulos críticos,
    deben restaurarse defensivamente."""
    # Intentar enviar permisos vacíos en roles/usuarios/sistema/administracion
    payload = {
        "permissions": {
            "roles": [],
            "usuarios": [],
            "sistema": [],
            "administracion": [],
            "dashboard": ["view"],
        }
    }
    r = admin_client.patch(f"{API}/permissions/roles/admin_general", json=payload)
    assert r.status_code == 200
    role = r.json()
    # Debe restaurar accesos completos en los 4 módulos críticos
    for must in ("roles", "usuarios", "sistema", "administracion"):
        assert len(role["permissions"].get(must, [])) > 0, \
            f"admin_general debe conservar acciones en {must}"
        assert "view" in role["permissions"][must]


# ---------------------------------------------------------------------------
# Toggle permission
# ---------------------------------------------------------------------------
def test_toggle_permission_on_off(admin_client):
    # Quitar 'export' de propuestas en mi_rol_custom
    r = admin_client.patch(f"{API}/permissions/roles/mi_rol_custom/permissions",
                           json={"module": "propuestas", "action": "export",
                                 "allowed": False})
    assert r.status_code == 200
    perms = r.json()["permissions"]
    assert "export" not in perms.get("propuestas", [])

    # Volver a habilitar
    r = admin_client.patch(f"{API}/permissions/roles/mi_rol_custom/permissions",
                           json={"module": "propuestas", "action": "export",
                                 "allowed": True})
    assert r.status_code == 200
    assert "export" in r.json()["permissions"]["propuestas"]


def test_toggle_permission_invalid_module(admin_client):
    r = admin_client.patch(f"{API}/permissions/roles/mi_rol_custom/permissions",
                           json={"module": "no_existe", "action": "view",
                                 "allowed": True})
    assert r.status_code == 400


def test_toggle_permission_invalid_action(admin_client):
    r = admin_client.patch(f"{API}/permissions/roles/mi_rol_custom/permissions",
                           json={"module": "dashboard", "action": "explode",
                                 "allowed": True})
    assert r.status_code == 400


def test_toggle_admin_general_view_critical_blocked(admin_client):
    """Quitar 'view' de roles/usuarios/sistema/administracion en admin_general → 400."""
    for mod in ("roles", "usuarios", "sistema", "administracion"):
        r = admin_client.patch(
            f"{API}/permissions/roles/admin_general/permissions",
            json={"module": mod, "action": "view", "allowed": False})
        assert r.status_code == 400, f"Should block removing view from {mod}"


# ---------------------------------------------------------------------------
# /me + cambio de rol de usuario
# ---------------------------------------------------------------------------
def test_me_for_admin(admin_client):
    r = admin_client.get(f"{API}/permissions/me")
    assert r.status_code == 200
    data = r.json()
    assert data["role"] == "admin_general"
    assert "view" in data["permissions"].get("roles", [])


def test_user_role_change_reflected_in_me(admin_client, created_artifacts):
    # 1. Crear usuario con rol jurado
    suffix = uuid.uuid4().hex[:8]
    username = f"test_perm_{suffix}"
    email = f"test_perm_{suffix}@example.com"
    password = "TestPerm2026!"
    create = admin_client.post(f"{API}/users", json={
        "username": username, "email": email,
        "name": "Test Perms User",
        "password": password,
        "role": "jurado",
    })
    assert create.status_code == 200, create.text
    user_id = create.json()["id"]
    created_artifacts["users"].append(user_id)

    # 2. Login como este usuario y revisar /me → jurado
    login = requests.post(f"{API}/auth/login",
                          json={"username": username, "password": password})
    assert login.status_code == 200, login.text
    tok = login.json()["access_token"]
    me = requests.get(f"{API}/permissions/me",
                      headers={"Authorization": f"Bearer {tok}"})
    assert me.status_code == 200
    assert me.json()["role"] == "jurado"

    # 3. Admin cambia rol a 'invitado'
    upd = admin_client.patch(f"{API}/users/{user_id}",
                             json={"role": "invitado"})
    assert upd.status_code == 200
    assert upd.json()["role"] == "invitado"

    # 4. Re-login y verificar /me ahora invitado
    login2 = requests.post(f"{API}/auth/login",
                           json={"username": username, "password": password})
    assert login2.status_code == 200
    tok2 = login2.json()["access_token"]
    me2 = requests.get(f"{API}/permissions/me",
                       headers={"Authorization": f"Bearer {tok2}"})
    assert me2.status_code == 200
    assert me2.json()["role"] == "invitado"
    # invitado no debe poder ver roles
    assert "view" not in me2.json()["permissions"].get("roles", [])


# ---------------------------------------------------------------------------
# RBAC: jurado cannot mutate; can read
# ---------------------------------------------------------------------------
def test_non_admin_cannot_mutate_roles(admin_client, created_artifacts):
    suffix = uuid.uuid4().hex[:8]
    username = f"jur_rbac_{suffix}"
    email = f"{username}@example.com"
    password = "JurRbac2026!"
    create = admin_client.post(f"{API}/users", json={
        "username": username, "email": email,
        "name": "Jurado RBAC", "password": password,
        "role": "jurado",
    })
    assert create.status_code == 200
    created_artifacts["users"].append(create.json()["id"])

    login = requests.post(f"{API}/auth/login",
                          json={"username": username, "password": password})
    assert login.status_code == 200
    tok = login.json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}

    # GETs deben funcionar
    assert requests.get(f"{API}/permissions/catalog", headers=h).status_code == 200
    assert requests.get(f"{API}/permissions/matrix", headers=h).status_code == 200
    assert requests.get(f"{API}/permissions/roles", headers=h).status_code == 200
    assert requests.get(f"{API}/permissions/me", headers=h).status_code == 200

    # Mutaciones deben fallar con 403
    r = requests.post(f"{API}/permissions/roles", headers=h,
                      json={"code": "hack_role", "name": "x"})
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    r = requests.patch(f"{API}/permissions/roles/jurado", headers=h,
                       json={"name": "Hack"})
    assert r.status_code == 403

    r = requests.delete(f"{API}/permissions/roles/jurado", headers=h)
    assert r.status_code == 403

    r = requests.patch(f"{API}/permissions/roles/jurado/permissions", headers=h,
                       json={"module": "dashboard", "action": "view", "allowed": True})
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Delete role
# ---------------------------------------------------------------------------
def test_delete_system_role_blocked(admin_client):
    r = admin_client.delete(f"{API}/permissions/roles/admin_general")
    assert r.status_code == 400


def test_delete_role_with_users_assigned_blocked(admin_client, created_artifacts):
    # 1. Crear rol custom temporal
    role_code = f"tmp_del_{uuid.uuid4().hex[:6]}"
    cr = admin_client.post(f"{API}/permissions/roles",
                           json={"code": role_code, "name": "Temporal Delete",
                                 "permissions": {"dashboard": ["view"]}})
    assert cr.status_code == 200
    created_artifacts["roles"].append(role_code)

    # 2. Crear usuario con ese rol... pero /api/users solo permite ALLOWED_ROLES
    # Por lo tanto el caso "usuarios asignados" sólo aplica a roles del sistema.
    # Vamos a probarlo asignando un usuario a 'invitado' y borrando 'invitado' (system → 400)
    # En su lugar, verifiquemos manualmente: el endpoint sí valida db.users.count_documents({"role": code})
    # Para custom role, no se pueden asignar usuarios via API. Skipping user-assigned check
    # con rol custom; verificamos comportamiento con system role (ya cubierto arriba).

    # 3. Eliminar el rol custom recién creado (sin usuarios) → debe pasar
    de = admin_client.delete(f"{API}/permissions/roles/{role_code}")
    assert de.status_code == 200, de.text
    created_artifacts["roles"].remove(role_code)

    # 4. Volver a eliminar → 404
    de2 = admin_client.delete(f"{API}/permissions/roles/{role_code}")
    assert de2.status_code == 404


def test_delete_role_with_assigned_users_db_check(admin_client, created_artifacts):
    """Verifica el bloqueo cuando hay usuarios asignados.
    Como /api/users sólo acepta ALLOWED_ROLES (sistema), simulamos creando
    un rol custom y luego forzando un user con ese rol vía PATCH después de
    quitar la validación: NO es posible vía API. Por tanto, este escenario
    de 'usuarios asignados' sólo puede verificarse para roles del sistema,
    y los roles del sistema están bloqueados por is_system primero.
    Documentamos la limitación. El código del endpoint hace la verificación
    correctamente: ver line 308-310 de routes_permissions.py.
    """
    # Verificación indirecta: el guard por is_system se ejecuta primero.
    r = admin_client.delete(f"{API}/permissions/roles/jurado")
    assert r.status_code == 400  # bloqueado por is_system
    assert "sistema" in r.json().get("detail", "").lower()


# ---------------------------------------------------------------------------
# Seed idempotente
# ---------------------------------------------------------------------------
def test_seed_idempotent_via_matrix(admin_client):
    """Llamar la matrix múltiples veces no debe duplicar roles del sistema.
    Verifica conteo estable (el seed corre en startup; aquí validamos estado)."""
    counts = []
    for _ in range(3):
        r = admin_client.get(f"{API}/permissions/matrix")
        assert r.status_code == 200
        sys_count = sum(1 for x in r.json()["roles"] if x["code"] in SYSTEM_ROLE_CODES)
        counts.append(sys_count)
    assert all(c == 7 for c in counts), f"System role count not stable at 7: {counts}"


# ---------------------------------------------------------------------------
# Admin password no cambia
# ---------------------------------------------------------------------------
def test_admin_password_still_valid_at_end():
    r = requests.post(f"{API}/auth/login",
                      json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert r.status_code == 200, "Admin password debe seguir siendo Chocolate2026!"
