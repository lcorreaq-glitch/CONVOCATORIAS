"""KRINOS - Iteración 14 - Tests para flujos:
- /api/settings/email (Gmail + SendGrid selector + migración)
- /api/settings/email/test (validaciones)
- /api/auth/forgot-password y /api/auth/reset-password
- /api/users/{id}/send-welcome (con / sin password_temporal)
- /api/admin/credenciales-jurado/{jid}/reset-password con enviar_correo
- /api/admin/credenciales-jurado/{jid}/send-welcome
- Permisos por rol

NOTA: El envío real está mocked porque no hay app_password real -> send_email
devuelve {ok:false, mocked:true}. Los endpoints deben manejarlo sin excepción.
"""
import os
import time
import uuid
import jwt
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://convocatoria-hub-2.preview.emergentagent.com").rstrip("/")
ADMIN_USERNAME = "lcorreaq"
ADMIN_EMAIL = "lcorreaq@gmail.com"
ADMIN_PASSWORD = "Chocolate2026!"

# JWT_SECRET solo lo usamos para generar tokens reset directamente (test e2e reset)
JWT_SECRET = "b8c4f9e2d6a1b0c3e7f8d2a4c6b9e1f3d8a0b2c4e6f8a1d3b5c7e9f1a3d5b7c9"


# ---------------------------------------------------------------------------
# Helpers / Fixtures
# ---------------------------------------------------------------------------
def _login(username, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": username, "password": password}, timeout=15)
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_USERNAME, ADMIN_PASSWORD)
    assert r.status_code == 200, f"Login admin falló: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def jurado_token():
    # jurado1 con password Pruebas2026!
    r = _login("jurado1@krinos.test", "Pruebas2026!")
    if r.status_code != 200:
        pytest.skip(f"Jurado seed no disponible (status {r.status_code}): {r.text[:200]}")
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_conv_token():
    r = _login("admin.conv@krinos.test", "Pruebas2026!")
    if r.status_code != 200:
        pytest.skip(f"admin_conv seed no disponible (status {r.status_code})")
    return r.json()["access_token"]


# ---------------------------------------------------------------------------
# 1. /api/settings - email block (migración + has_app_password)
# ---------------------------------------------------------------------------
class TestSettingsEmailGet:
    def test_get_settings_has_email_block(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/settings", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "email" in d, "Falta bloque 'email'"
        em = d["email"]
        assert "provider" in em
        assert "gmail" in em and "sendgrid" in em
        # has_app_password y has_api_key deben existir (booleans) tras migración
        assert "has_app_password" in em["gmail"], "Falta has_app_password en gmail"
        assert "has_api_key" in em["sendgrid"], "Falta has_api_key en sendgrid"
        # password no debe venir en claro
        assert "app_password" not in em["gmail"]
        assert "api_key" not in em["sendgrid"]


# ---------------------------------------------------------------------------
# 2. PATCH /api/settings/email - guardar gmail y enmascarar
# ---------------------------------------------------------------------------
class TestSettingsEmailPatch:
    def test_patch_email_gmail_full(self, admin_headers):
        body = {
            "provider": "gmail", "enabled": True,
            "from_email": "test@gmail.com", "from_name": "KRINOS",
            "gmail": {"user": "test@gmail.com", "app_password": "abcd efgh ijkl mnop"},
            "test_recipient": "t@t.co",
        }
        r = requests.patch(f"{BASE_URL}/api/settings/email", json=body, headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        em = d["email"]
        assert em["provider"] == "gmail"
        assert em["enabled"] is True
        assert em["from_email"] == "test@gmail.com"
        assert em["gmail"]["has_app_password"] is True
        # Verificar enmascaramiento
        assert "app_password" not in em["gmail"]
        assert em["gmail"].get("app_password_masked", "")  # debe existir y no vacío

    def test_patch_email_partial_does_not_clear_gmail(self, admin_headers):
        # Cambiar solo provider a sendgrid - NO debe borrar gmail
        r = requests.patch(f"{BASE_URL}/api/settings/email",
                           json={"provider": "sendgrid"}, headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        em = r.json()["email"]
        assert em["provider"] == "sendgrid"
        assert em["gmail"]["has_app_password"] is True, "Gmail app_password se perdió tras patch parcial"
        assert em["gmail"].get("user") == "test@gmail.com"

    def test_patch_email_invalid_provider(self, admin_headers):
        r = requests.patch(f"{BASE_URL}/api/settings/email",
                           json={"provider": "yahoo"}, headers=admin_headers, timeout=15)
        assert r.status_code == 400, f"Esperaba 400, fue {r.status_code}: {r.text}"


# ---------------------------------------------------------------------------
# 3. POST /api/settings/email/test - validaciones
# ---------------------------------------------------------------------------
class TestEmailTestEndpoint:
    def test_email_test_disabled(self, admin_headers):
        # Forzar enabled=False
        requests.patch(f"{BASE_URL}/api/settings/email",
                       json={"enabled": False}, headers=admin_headers, timeout=15)
        r = requests.post(f"{BASE_URL}/api/settings/email/test", headers=admin_headers, timeout=15)
        assert r.status_code == 400, f"Esperaba 400, fue {r.status_code}: {r.text}"
        assert "deshabilitado" in r.text.lower() or "disabled" in r.text.lower()

    def test_email_test_missing_credentials(self, admin_headers):
        # Activar pero sin sendgrid api_key real (la actual está vacía o dummy) → ok:false mocked
        # Cambiar a sendgrid sin api_key real + enabled=true
        requests.patch(f"{BASE_URL}/api/settings/email", json={
            "provider": "sendgrid", "enabled": True,
            "from_email": "noreply@krinos.test", "from_name": "KRINOS",
            "test_recipient": "test@krinos.test",
            "sendgrid": {"api_key": "", "from_email": "noreply@krinos.test", "from_name": "KRINOS"},
        }, headers=admin_headers, timeout=15)
        r = requests.post(f"{BASE_URL}/api/settings/email/test", headers=admin_headers, timeout=15)
        # Debe devolver 400 (no 500) - send_email retorna mocked y endpoint lanza HTTPException
        assert r.status_code == 400, f"Esperaba 400 por credenciales faltantes, fue {r.status_code}: {r.text}"
        # No debe ser un 500 con traceback


# ---------------------------------------------------------------------------
# 4. /api/auth/forgot-password
# ---------------------------------------------------------------------------
class TestForgotPassword:
    def test_forgot_password_email_inexistente(self):
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                          json={"email": f"noexiste-{uuid.uuid4().hex[:8]}@example.com"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_forgot_password_email_admin(self):
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                          json={"email": ADMIN_EMAIL,
                                "base_url": "https://convocatoria-hub-2.preview.emergentagent.com"},
                          timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        # mocked=True esperado en dev (sin app_password real)
        # delivered podría ser False, pero NO debe levantar 500


# ---------------------------------------------------------------------------
# 5. /api/auth/reset-password
# ---------------------------------------------------------------------------
class TestResetPassword:
    def test_reset_password_invalid_token(self):
        r = requests.post(f"{BASE_URL}/api/auth/reset-password",
                          json={"token": "not-a-real-token", "new_password": "NuevaPass2026!"},
                          timeout=15)
        assert r.status_code == 400, r.text
        assert "inválido" in r.text.lower() or "invalid" in r.text.lower()

    def test_reset_password_expired_token(self, admin_headers):
        # Conseguir el user_id del admin
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers, timeout=10).json()
        # Crear token expirado
        payload = {
            "sub": me["id"], "email": me["email"], "type": "reset",
            "exp": datetime.now(timezone.utc) - timedelta(minutes=5),
        }
        expired = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
        r = requests.post(f"{BASE_URL}/api/auth/reset-password",
                          json={"token": expired, "new_password": "NuevaPass2026!"}, timeout=15)
        assert r.status_code == 400, r.text
        assert "expir" in r.text.lower()

    def test_reset_password_too_short(self):
        # No importa que el token sea inválido, la validación de longitud es primero
        r = requests.post(f"{BASE_URL}/api/auth/reset-password",
                          json={"token": "x", "new_password": "abc"}, timeout=15)
        assert r.status_code == 400, r.text
        assert "6 caracteres" in r.text or "caracteres" in r.text


# ---------------------------------------------------------------------------
# 6. Flujo end-to-end reset (crea usuario TEST, genera token manual, login)
# ---------------------------------------------------------------------------
class TestResetPasswordE2E:
    @pytest.fixture(scope="class")
    def test_user(self, admin_headers):
        # Creamos un usuario TEST_ para reset password e2e
        suffix = uuid.uuid4().hex[:6]
        body = {
            "username": f"test_reset_{suffix}",
            "email": f"test_reset_{suffix}@example.com",
            "name": "TEST Reset User",
            "role": "invitado",
            "password": "OldPassword2026!",
        }
        r = requests.post(f"{BASE_URL}/api/users", json=body, headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), f"No se pudo crear user de prueba: {r.status_code} {r.text}"
        u = r.json()
        yield {"id": u["id"], "username": body["username"], "email": body["email"],
               "old_pwd": "OldPassword2026!"}
        # Cleanup
        requests.delete(f"{BASE_URL}/api/users/{u['id']}", headers=admin_headers, timeout=10)

    def test_reset_full_flow(self, test_user):
        # 1) Forgot password (mocked en dev)
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                          json={"email": test_user["email"]}, timeout=15)
        assert r.status_code == 200

        # 2) Crear token reset manualmente (porque envío real está mocked)
        payload = {
            "sub": test_user["id"], "email": test_user["email"], "type": "reset",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")

        new_pwd = "NuevoSecreto2026!"
        r = requests.post(f"{BASE_URL}/api/auth/reset-password",
                          json={"token": token, "new_password": new_pwd}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

        # 3) Login con nueva pass
        r = _login(test_user["username"], new_pwd)
        assert r.status_code == 200, f"Login con nueva pass falló: {r.status_code} {r.text}"

        # 4) Login con vieja pass debe fallar
        r = _login(test_user["username"], test_user["old_pwd"])
        assert r.status_code == 401, f"Login con vieja pass NO debería funcionar: {r.status_code}"


# ---------------------------------------------------------------------------
# 7. /api/users/{id}/send-welcome
# ---------------------------------------------------------------------------
class TestUsersSendWelcome:
    @pytest.fixture(scope="class")
    def test_user(self, admin_headers):
        suffix = uuid.uuid4().hex[:6]
        body = {
            "username": f"test_welcome_{suffix}",
            "email": f"test_welcome_{suffix}@example.com",
            "name": "TEST Welcome User", "role": "invitado",
            "password": "OriginalPwd2026!",
        }
        r = requests.post(f"{BASE_URL}/api/users", json=body, headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), r.text
        u = r.json()
        yield {**body, "id": u["id"]}
        requests.delete(f"{BASE_URL}/api/users/{u['id']}", headers=admin_headers, timeout=10)

    def test_send_welcome_with_password_updates(self, admin_headers, test_user):
        nueva = "WelcomeNueva2026!"
        r = requests.post(f"{BASE_URL}/api/users/{test_user['id']}/send-welcome",
                          json={"password_temporal": nueva}, headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        # En mocked devuelve ok:false con mocked:true (correcto, no 500)
        body = r.json()
        assert "ok" in body
        # Verificar que la pwd cambió
        r2 = _login(test_user["username"], nueva)
        assert r2.status_code == 200, f"Login con pass nueva falló: {r2.status_code} {r2.text}"
        # Y la vieja ya no funciona
        r3 = _login(test_user["username"], test_user["password"])
        assert r3.status_code == 401

    def test_send_welcome_without_password_keeps_current(self, admin_headers, test_user):
        # Después del anterior, la pwd actual es "WelcomeNueva2026!"
        r = requests.post(f"{BASE_URL}/api/users/{test_user['id']}/send-welcome",
                          json={}, headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        # Pwd no debe haber cambiado
        r2 = _login(test_user["username"], "WelcomeNueva2026!")
        assert r2.status_code == 200, "Send-welcome sin password no debería alterar credenciales"


# ---------------------------------------------------------------------------
# 8. Permisos
# ---------------------------------------------------------------------------
class TestPermissions:
    def test_jurado_cannot_patch_email(self, jurado_token):
        h = {"Authorization": f"Bearer {jurado_token}", "Content-Type": "application/json"}
        r = requests.patch(f"{BASE_URL}/api/settings/email",
                           json={"provider": "sendgrid"}, headers=h, timeout=10)
        assert r.status_code == 403, f"Jurado no debería poder editar email: {r.status_code}"

    def test_jurado_cannot_send_welcome(self, jurado_token, admin_headers):
        # Necesitamos un user_id válido
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers, timeout=10).json()
        h = {"Authorization": f"Bearer {jurado_token}", "Content-Type": "application/json"}
        r = requests.post(f"{BASE_URL}/api/users/{me['id']}/send-welcome",
                          json={}, headers=h, timeout=10)
        assert r.status_code == 403, f"Jurado no debería poder send-welcome: {r.status_code}"

    def test_admin_conv_can_send_welcome(self, admin_conv_token, admin_headers):
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers, timeout=10).json()
        h = {"Authorization": f"Bearer {admin_conv_token}", "Content-Type": "application/json"}
        r = requests.post(f"{BASE_URL}/api/users/{me['id']}/send-welcome",
                          json={}, headers=h, timeout=20)
        assert r.status_code == 200, f"admin_conv debe poder send-welcome: {r.status_code} {r.text}"

    def test_admin_conv_cannot_patch_email(self, admin_conv_token):
        h = {"Authorization": f"Bearer {admin_conv_token}", "Content-Type": "application/json"}
        r = requests.patch(f"{BASE_URL}/api/settings/email",
                           json={"provider": "sendgrid"}, headers=h, timeout=10)
        assert r.status_code == 403, f"admin_conv no debería poder patch email: {r.status_code}"


# ---------------------------------------------------------------------------
# 9. Credenciales-jurado reset / send-welcome
# ---------------------------------------------------------------------------
class TestCredencialesJurado:
    @pytest.fixture(scope="class")
    def jurado_target(self, admin_headers):
        # Necesitamos pasar convocatoria_id como query param
        rc = requests.get(f"{BASE_URL}/api/convocatorias", headers=admin_headers, timeout=15)
        if rc.status_code != 200:
            pytest.skip("No se pudieron listar convocatorias")
        cs = rc.json()
        cs = cs if isinstance(cs, list) else (cs.get("items") or [])
        if not cs:
            pytest.skip("No hay convocatorias")
        conv_id = cs[0]["id"]
        r = requests.get(f"{BASE_URL}/api/jurados", params={"convocatoria_id": conv_id},
                         headers=admin_headers, timeout=15)
        if r.status_code != 200:
            pytest.skip(f"No se pudo listar jurados (status {r.status_code}): {r.text[:200]}")
        data = r.json()
        if isinstance(data, dict):
            data = data.get("items") or data.get("jurados") or []
        if not data:
            pytest.skip("No hay jurados en BD para testear")
        return data[0]

    def test_reset_password_enviar_correo(self, admin_headers, jurado_target):
        jid = jurado_target["id"]
        r = requests.post(f"{BASE_URL}/api/admin/credenciales-jurado/{jid}/reset-password",
                          json={"enviar_correo": True}, headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert "password" in d
        assert "email_result" in d, "Debe incluir email_result cuando enviar_correo=true"
        # email_result puede ser mocked - lo importante es que no sea None
        assert d["email_result"] is not None

    def test_send_welcome_jurado(self, admin_headers, jurado_target):
        jid = jurado_target["id"]
        r = requests.post(f"{BASE_URL}/api/admin/credenciales-jurado/{jid}/send-welcome",
                          json={}, headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        # ok puede ser true o false (mocked); pero no debe ser 500
        assert "ok" in d


# ---------------------------------------------------------------------------
# 10. Cleanup: restaurar email a estado por defecto deshabilitado
# ---------------------------------------------------------------------------
def test_zz_cleanup_email_settings(admin_headers):
    """Final teardown: deja el email deshabilitado y limpio."""
    r = requests.patch(f"{BASE_URL}/api/settings/email", json={
        "provider": "sendgrid", "enabled": False,
        "from_email": "", "from_name": "KRINOS",
        "test_recipient": "",
        "gmail": {"user": "", "app_password": ""},
        "sendgrid": {"api_key": "", "from_email": "", "from_name": "KRINOS"},
    }, headers=admin_headers, timeout=15)
    assert r.status_code == 200
