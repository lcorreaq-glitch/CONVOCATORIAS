"""KRINOS - Backend tests for the /api/admin module (iteration 13).

Tests cover:
- Login admin and obtain access_token.
- POST /api/admin/seed-test-users (idempotent, creates 8 test users, 3 jurados linked to convocatoria).
- POST /api/admin/seed-estados-propuesta (idempotent catalog).
- POST /api/jurados returns 'credenciales' when creating a brand new user.
- POST /api/admin/credenciales-jurado/{jid}/reset-password works and new password lets the user login.
- DELETE /api/admin/propuestas/{pid} cascades to asignaciones / evaluaciones.
- DELETE /api/admin/jurados/{jid} cascades (users, ternas pull, asignaciones, evaluaciones).
- DELETE /api/admin/evaluaciones-individuales / colectivas / rankings (incl. 404 paths).
- Permissions: jurado role cannot call /api/admin/*.
- POST /api/admin/reset-datos (final, destructive): wrong confirmation => 400; valid => purges
  operational collections, removes users except admin_general, preserves config, admin still logs in.
- After reset, seed-test-users again and admin_convocatoria can login.

NOTE: This suite runs in an explicit order via the chosen test names (alphabetical) to honour the
sequence demanded by the main agent (destructive reset goes near the end).
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://convocatoria-hub-2.preview.emergentagent.com").rstrip("/")
ADMIN_USER = "lcorreaq"
ADMIN_PASS = "Chocolate2026!"

# Shared in-memory context across tests (single-session sequential run)
CTX = {
    "admin_token": None,
    "convocatoria_id": None,
    "test_jurado_id": None,
    "test_jurado_email": None,
    "test_jurado_pwd": None,
    "propuesta_id": None,
    "asignacion_id": None,
    "eval_ind_id": None,
    "eval_col_id": None,
    "ranking_id": None,
    "terna_id": None,
}


def _h(token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _login(username, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": username, "password": password}, timeout=20)
    return r


# ---------------------------------------------------------------------------
# 00: Health + Admin login
# ---------------------------------------------------------------------------
def test_00_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_01_admin_login():
    r = _login(ADMIN_USER, ADMIN_PASS)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data
    CTX["admin_token"] = data["access_token"]


def test_02_resolve_inc2026_convocatoria():
    assert CTX["admin_token"]
    r = requests.get(f"{BASE_URL}/api/convocatorias", headers=_h(CTX["admin_token"]), timeout=15)
    assert r.status_code == 200, r.text
    convs = r.json()
    inc = next((c for c in convs if c.get("codigo") == "INC2026"), None)
    if inc is None and convs:
        inc = convs[0]
    assert inc is not None, "No convocatoria found in DB"
    CTX["convocatoria_id"] = inc["id"]


# ---------------------------------------------------------------------------
# 10: seed-test-users + seed-estados-propuesta
# ---------------------------------------------------------------------------
def test_10_seed_test_users_first_call():
    cid = CTX["convocatoria_id"]
    r = requests.post(
        f"{BASE_URL}/api/admin/seed-test-users",
        params={"convocatoria_id": cid}, headers=_h(CTX["admin_token"]), timeout=30
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    creds = data.get("credenciales", [])
    assert len(creds) == 8, f"Expected 8 test users, got {len(creds)}"
    roles = sorted({c["role"] for c in creds})
    for expected in ("admin_convocatoria", "supervisor", "invitado", "auditor", "integrante_terna", "jurado"):
        assert expected in roles, f"missing role {expected}"
    # 3 jurados
    juras = [c for c in creds if c["role"] == "jurado"]
    assert len(juras) == 3


def test_11_seed_test_users_idempotent_second_call():
    """Calling again should mark all 8 as actualizados (not crash)."""
    cid = CTX["convocatoria_id"]
    r = requests.post(
        f"{BASE_URL}/api/admin/seed-test-users",
        params={"convocatoria_id": cid}, headers=_h(CTX["admin_token"]), timeout=30
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["actualizados"] >= 8, data


def test_12_login_admin_convocatoria_test_user():
    r = _login("admin.conv@krinos.test", "Pruebas2026!")
    assert r.status_code == 200, r.text
    assert "access_token" in r.json()


def test_13_seed_estados_propuesta_first_call():
    cid = CTX["convocatoria_id"]
    r = requests.post(
        f"{BASE_URL}/api/admin/seed-estados-propuesta",
        params={"convocatoria_id": cid}, headers=_h(CTX["admin_token"]), timeout=20
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    # First call could be already_existed if a previous test run created it; just assert structure
    assert "catalogo_id" in data


def test_14_seed_estados_propuesta_idempotent():
    cid = CTX["convocatoria_id"]
    r = requests.post(
        f"{BASE_URL}/api/admin/seed-estados-propuesta",
        params={"convocatoria_id": cid}, headers=_h(CTX["admin_token"]), timeout=20
    )
    assert r.status_code == 200
    data = r.json()
    assert data["ya_existia"] is True


# ---------------------------------------------------------------------------
# 20: create jurado returns credenciales
# ---------------------------------------------------------------------------
def test_20_create_jurado_returns_credenciales():
    cid = CTX["convocatoria_id"]
    email = f"test.jurado.{uuid.uuid4().hex[:8]}@krinos.test"
    pwd = "JuradoTest123!"
    payload = {
        "convocatoria_id": cid,
        "nombre": "Jurado Test Iter13",
        "email": email,
        "telefono": "+57 300 555 0000",
        "perfil": "Jurado de prueba iter13",
        "subregiones": ["Urabá"],
        "crear_usuario": True,
        "password": pwd,
    }
    r = requests.post(f"{BASE_URL}/api/jurados", json=payload,
                      headers=_h(CTX["admin_token"]), timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "credenciales" in data, f"expected 'credenciales' in response, got {data.keys()}"
    creds = data["credenciales"]
    assert creds["username"] == email.lower()
    assert creds["password"] == pwd
    assert creds["rol"] == "jurado"
    CTX["test_jurado_id"] = data["id"]
    CTX["test_jurado_email"] = email.lower()
    CTX["test_jurado_pwd"] = pwd

    # Verify login with returned creds works
    r2 = _login(email.lower(), pwd)
    assert r2.status_code == 200, r2.text


def test_21_create_jurado_existing_user_no_credentials():
    """If user already exists, no credenciales should be returned."""
    cid = CTX["convocatoria_id"]
    # Reuse the email of test_20
    payload = {
        "convocatoria_id": cid,
        "nombre": "Jurado Test Dup",
        "email": CTX["test_jurado_email"],
        "crear_usuario": True,
        "password": "Otra123!",
    }
    r = requests.post(f"{BASE_URL}/api/jurados", json=payload,
                      headers=_h(CTX["admin_token"]), timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "credenciales" not in data, f"should NOT return credenciales when user exists: {data}"


# ---------------------------------------------------------------------------
# 30: reset-password jurado
# ---------------------------------------------------------------------------
def test_30_reset_password_jurado_autogen():
    jid = CTX["test_jurado_id"]
    r = requests.post(f"{BASE_URL}/api/admin/credenciales-jurado/{jid}/reset-password",
                      json={}, headers=_h(CTX["admin_token"]), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    new_pwd = data["password"]
    assert isinstance(new_pwd, str) and len(new_pwd) >= 8
    username = data["username"]
    # Login with new pwd
    r2 = _login(username, new_pwd)
    assert r2.status_code == 200, r2.text
    CTX["test_jurado_pwd"] = new_pwd


def test_31_reset_password_jurado_explicit():
    jid = CTX["test_jurado_id"]
    explicit = "Explicito2026!"
    r = requests.post(f"{BASE_URL}/api/admin/credenciales-jurado/{jid}/reset-password",
                      json={"nueva_password": explicit}, headers=_h(CTX["admin_token"]), timeout=15)
    assert r.status_code == 200
    assert r.json()["password"] == explicit
    r2 = _login(CTX["test_jurado_email"], explicit)
    assert r2.status_code == 200


def test_32_reset_password_404():
    r = requests.post(f"{BASE_URL}/api/admin/credenciales-jurado/{uuid.uuid4().hex}/reset-password",
                      json={}, headers=_h(CTX["admin_token"]), timeout=10)
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 40: DELETE propuesta cascade
# ---------------------------------------------------------------------------
def test_40_delete_propuesta_cascade():
    cid = CTX["convocatoria_id"]
    # Create propuesta
    r = requests.post(f"{BASE_URL}/api/propuestas",
                      json={"convocatoria_id": cid, "nombre": "TEST_Propuesta cascade"},
                      headers=_h(CTX["admin_token"]), timeout=15)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    CTX["propuesta_id"] = pid

    # Create asignacion (individual) -> generates an evaluacion_individual borrador
    r2 = requests.post(f"{BASE_URL}/api/asignaciones",
                       json={"convocatoria_id": cid, "propuesta_id": pid,
                             "jurado_id": CTX["test_jurado_id"],
                             "tipo_evaluacion": "individual"},
                       headers=_h(CTX["admin_token"]), timeout=15)
    assert r2.status_code == 200, r2.text
    aid = r2.json()["id"]
    CTX["asignacion_id"] = aid

    # Verify asignacion exists
    rcheck = requests.get(f"{BASE_URL}/api/asignaciones",
                          params={"convocatoria_id": cid, "propuesta_id": pid},
                          headers=_h(CTX["admin_token"]), timeout=10)
    assert rcheck.status_code == 200
    assert any(a["id"] == aid for a in rcheck.json())

    # DELETE propuesta
    rd = requests.delete(f"{BASE_URL}/api/admin/propuestas/{pid}",
                         headers=_h(CTX["admin_token"]), timeout=15)
    assert rd.status_code == 200, rd.text

    # GET propuesta -> 404
    r404 = requests.get(f"{BASE_URL}/api/propuestas/{pid}",
                        headers=_h(CTX["admin_token"]), timeout=10)
    assert r404.status_code == 404

    # Asignaciones for the propuesta should be gone (delete_many, not soft)
    r3 = requests.get(f"{BASE_URL}/api/asignaciones",
                      params={"convocatoria_id": cid, "propuesta_id": pid},
                      headers=_h(CTX["admin_token"]), timeout=10)
    assert r3.status_code == 200
    assert len(r3.json()) == 0, f"expected no asignaciones after cascade, got {r3.json()}"


def test_41_delete_propuesta_404():
    r = requests.delete(f"{BASE_URL}/api/admin/propuestas/{uuid.uuid4().hex}",
                        headers=_h(CTX["admin_token"]), timeout=10)
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 50: DELETE evaluaciones / ranking 404
# ---------------------------------------------------------------------------
def test_50_delete_evaluacion_individual_404():
    r = requests.delete(f"{BASE_URL}/api/admin/evaluaciones-individuales/{uuid.uuid4().hex}",
                        headers=_h(CTX["admin_token"]), timeout=10)
    assert r.status_code == 404


def test_51_delete_evaluacion_colectiva_404():
    r = requests.delete(f"{BASE_URL}/api/admin/evaluaciones-colectivas/{uuid.uuid4().hex}",
                        headers=_h(CTX["admin_token"]), timeout=10)
    assert r.status_code == 404


def test_52_delete_ranking_404():
    r = requests.delete(f"{BASE_URL}/api/admin/rankings/{uuid.uuid4().hex}",
                        headers=_h(CTX["admin_token"]), timeout=10)
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 60: DELETE jurado cascade (user, ternas pull, asignaciones, evals)
# ---------------------------------------------------------------------------
def test_60_delete_jurado_cascade():
    cid = CTX["convocatoria_id"]
    jid = CTX["test_jurado_id"]
    # Create a terna with this jurado as integrante
    rt = requests.post(f"{BASE_URL}/api/ternas",
                       json={"convocatoria_id": cid, "nombre": "TEST_Terna cascade",
                             "integrantes": [{"jurado_id": jid, "rol": "evaluador"}]},
                       headers=_h(CTX["admin_token"]), timeout=15)
    assert rt.status_code == 200, rt.text
    CTX["terna_id"] = rt.json()["id"]

    # Create a propuesta + asignacion to verify cascade
    rp = requests.post(f"{BASE_URL}/api/propuestas",
                       json={"convocatoria_id": cid, "nombre": "TEST_Propuesta para jurado cascade"},
                       headers=_h(CTX["admin_token"]), timeout=15)
    assert rp.status_code == 200
    pid2 = rp.json()["id"]
    ra = requests.post(f"{BASE_URL}/api/asignaciones",
                       json={"convocatoria_id": cid, "propuesta_id": pid2,
                             "jurado_id": jid, "tipo_evaluacion": "individual"},
                       headers=_h(CTX["admin_token"]), timeout=15)
    assert ra.status_code == 200

    # DELETE jurado
    rd = requests.delete(f"{BASE_URL}/api/admin/jurados/{jid}",
                         headers=_h(CTX["admin_token"]), timeout=15)
    assert rd.status_code == 200, rd.text

    # Jurado removed from terna
    rt2 = requests.get(f"{BASE_URL}/api/ternas",
                       params={"convocatoria_id": cid},
                       headers=_h(CTX["admin_token"]), timeout=10)
    assert rt2.status_code == 200
    terna_doc = next((t for t in rt2.json() if t["id"] == CTX["terna_id"]), None)
    assert terna_doc is not None
    assert not any(i.get("jurado_id") == jid for i in terna_doc.get("integrantes", []))

    # Asignaciones of jurado gone
    ra2 = requests.get(f"{BASE_URL}/api/asignaciones",
                       params={"convocatoria_id": cid, "jurado_id": jid},
                       headers=_h(CTX["admin_token"]), timeout=10)
    assert ra2.status_code == 200
    assert len(ra2.json()) == 0

    # User no longer can login (deleted)
    rlogin = _login(CTX["test_jurado_email"], CTX["test_jurado_pwd"])
    assert rlogin.status_code in (401, 403, 404), f"expected unauthorized after user delete, got {rlogin.status_code}"


def test_61_delete_jurado_404():
    r = requests.delete(f"{BASE_URL}/api/admin/jurados/{uuid.uuid4().hex}",
                        headers=_h(CTX["admin_token"]), timeout=10)
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 70: Permissions - jurado role cannot hit /api/admin/*
# ---------------------------------------------------------------------------
def test_70_jurado_cannot_call_admin():
    # Login as jurado test user
    r = _login("jurado1@krinos.test", "Pruebas2026!")
    assert r.status_code == 200, r.text
    jtoken = r.json()["access_token"]

    # Try seed-test-users (admin_general only)
    r1 = requests.post(f"{BASE_URL}/api/admin/seed-test-users",
                       params={"convocatoria_id": CTX["convocatoria_id"]},
                       headers=_h(jtoken), timeout=10)
    assert r1.status_code == 403, r1.text

    # Try DELETE propuesta (admin_general / admin_convocatoria)
    r2 = requests.delete(f"{BASE_URL}/api/admin/propuestas/{uuid.uuid4().hex}",
                         headers=_h(jtoken), timeout=10)
    assert r2.status_code == 403, r2.text

    # Try reset-datos
    r3 = requests.post(f"{BASE_URL}/api/admin/reset-datos",
                       json={"confirmacion": "REINICIAR", "incluir_usuarios": False},
                       headers=_h(jtoken), timeout=10)
    assert r3.status_code == 403


def test_71_admin_convocatoria_can_use_delete_but_not_reset():
    """admin_convocatoria can DELETE but cannot reset-datos (admin_general only)."""
    r = _login("admin.conv@krinos.test", "Pruebas2026!")
    assert r.status_code == 200
    ac_token = r.json()["access_token"]

    # reset-datos -> 403
    r1 = requests.post(f"{BASE_URL}/api/admin/reset-datos",
                       json={"confirmacion": "REINICIAR", "incluir_usuarios": False},
                       headers=_h(ac_token), timeout=10)
    assert r1.status_code == 403, r1.text

    # DELETE rankings (admin_general/admin_convocatoria) -> 404 (no resource) but NOT 403
    r2 = requests.delete(f"{BASE_URL}/api/admin/rankings/{uuid.uuid4().hex}",
                         headers=_h(ac_token), timeout=10)
    assert r2.status_code == 404, r2.text


# ---------------------------------------------------------------------------
# 80: reset-datos
# ---------------------------------------------------------------------------
def test_80_reset_datos_wrong_confirmation():
    r = requests.post(f"{BASE_URL}/api/admin/reset-datos",
                      json={"confirmacion": "no", "incluir_usuarios": False},
                      headers=_h(CTX["admin_token"]), timeout=15)
    assert r.status_code == 400, r.text


def test_81_reset_datos_executes_and_preserves_config():
    # Snapshot config counts before
    cid_before_r = requests.get(f"{BASE_URL}/api/convocatorias",
                                headers=_h(CTX["admin_token"]), timeout=15)
    conv_count_before = len(cid_before_r.json())
    cat_before_r = requests.get(f"{BASE_URL}/api/catalogos",
                                params={"convocatoria_id": CTX["convocatoria_id"]},
                                headers=_h(CTX["admin_token"]), timeout=15)
    cat_count_before = len(cat_before_r.json()) if cat_before_r.status_code == 200 else 0

    r = requests.post(f"{BASE_URL}/api/admin/reset-datos",
                      json={"confirmacion": "REINICIAR",
                            "incluir_usuarios": True,
                            "incluir_auditoria": False,
                            "convocatoria_id": None},
                      headers=_h(CTX["admin_token"]), timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    resumen = data["resumen"]
    # auditoria should NOT be in resumen (preserved)
    assert "auditoria" not in resumen
    # Users-except-admin key exists
    assert "users (excepto admin_general)" in resumen

    # Verify propuestas, jurados, ternas are empty for that convocatoria
    rp = requests.get(f"{BASE_URL}/api/propuestas",
                      params={"convocatoria_id": CTX["convocatoria_id"]},
                      headers=_h(CTX["admin_token"]), timeout=15)
    assert rp.status_code == 200
    assert rp.json() == [], f"propuestas should be empty after reset, got {len(rp.json())}"
    rj = requests.get(f"{BASE_URL}/api/jurados",
                      params={"convocatoria_id": CTX["convocatoria_id"]},
                      headers=_h(CTX["admin_token"]), timeout=15)
    assert rj.status_code == 200
    assert rj.json() == [], "jurados should be empty after reset"

    # Config preserved
    cid_after_r = requests.get(f"{BASE_URL}/api/convocatorias",
                               headers=_h(CTX["admin_token"]), timeout=15)
    assert len(cid_after_r.json()) == conv_count_before, "convocatorias debe ser preservadas"
    cat_after_r = requests.get(f"{BASE_URL}/api/catalogos",
                               params={"convocatoria_id": CTX["convocatoria_id"]},
                               headers=_h(CTX["admin_token"]), timeout=15)
    assert cat_after_r.status_code == 200
    assert len(cat_after_r.json()) == cat_count_before, "catalogos preservados"


def test_82_admin_general_still_logs_in_after_reset():
    r = _login(ADMIN_USER, ADMIN_PASS)
    assert r.status_code == 200, r.text
    CTX["admin_token"] = r.json()["access_token"]


def test_83_test_users_were_deleted_by_reset():
    """After reset with incluir_usuarios=True, admin.conv@krinos.test should NOT be able to login."""
    r = _login("admin.conv@krinos.test", "Pruebas2026!")
    assert r.status_code in (401, 403, 404), f"expected user deleted, got {r.status_code}"


def test_84_re_seed_test_users_and_login_admin_convocatoria():
    cid = CTX["convocatoria_id"]
    r = requests.post(f"{BASE_URL}/api/admin/seed-test-users",
                      params={"convocatoria_id": cid},
                      headers=_h(CTX["admin_token"]), timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["creados"] >= 8

    # Login admin_convocatoria
    r2 = _login("admin.conv@krinos.test", "Pruebas2026!")
    assert r2.status_code == 200, r2.text


# ---------------------------------------------------------------------------
# 90: cleanup - restart backend so seed_demo_data repopulates
# ---------------------------------------------------------------------------
def test_99_zzz_marker():
    """Just a marker - the supervisor restart is performed by the testing agent post-suite."""
    assert True
