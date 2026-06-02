"""KRINOS backend regression tests (pytest).

Covers: auth, convocatorias, config (catalogos/campos/criterios/desempates),
propuestas, jurados, ternas, asignaciones, evaluaciones individuales/colectivas,
rankings, actas PDF, dashboard, reportes, users RBAC, brute-force.
"""
import os
import io
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://convocatoria-hub-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USER = "lcorreaq"
ADMIN_PASS = "Chocolate2026!"
JURADO_USER = "ana.perez@krinos.gov.co"
JURADO_PASS = "Jurado2026!"


# -------------- Fixtures --------------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert r.status_code == 200, f"login admin failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def jurado_token():
    r = requests.post(f"{API}/auth/login", json={"username": JURADO_USER, "password": JURADO_PASS})
    if r.status_code != 200:
        pytest.skip("Jurado credentials not seeded")
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def jurado_headers(jurado_token):
    return {"Authorization": f"Bearer {jurado_token}"}


@pytest.fixture(scope="session")
def convocatoria(admin_headers):
    r = requests.get(f"{API}/convocatorias", headers=admin_headers)
    assert r.status_code == 200, r.text
    convs = r.json()
    inc = next((c for c in convs if c.get("codigo") == "INC2026"), None)
    assert inc, "INC2026 seed missing"
    return inc


@pytest.fixture(scope="session")
def conv_id(convocatoria):
    return convocatoria["id"]


# -------------- Auth --------------
class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data and isinstance(data["access_token"], str) and len(data["access_token"]) > 20
        assert data["username"] == ADMIN_USER
        assert data["role"] == "admin_general"
        assert data["email"] == "lcorreaq@krinos.gov.co"

    def test_me_with_bearer(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["username"] == ADMIN_USER
        assert data["role"] == "admin_general"

    def test_me_no_token(self):
        # Use clean session to avoid any cookies
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"username": "no_such_user_xyz", "password": "wrong"})
        assert r.status_code == 401


# -------------- Convocatorias / Config --------------
class TestConfig:
    def test_list_convocatorias(self, admin_headers):
        r = requests.get(f"{API}/convocatorias", headers=admin_headers)
        assert r.status_code == 200
        codes = [c.get("codigo") for c in r.json()]
        assert "INC2026" in codes

    def test_get_convocatoria(self, admin_headers, conv_id):
        r = requests.get(f"{API}/convocatorias/{conv_id}", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["codigo"] == "INC2026"

    def test_campos_seed(self, admin_headers, conv_id):
        r = requests.get(f"{API}/campos", params={"convocatoria_id": conv_id}, headers=admin_headers)
        assert r.status_code == 200
        campos = r.json()
        assert len(campos) >= 11
        nombres = {c["nombre_interno"] for c in campos}
        for expected in ["subregion", "municipio", "linea", "fecha_radicacion", "link_expediente"]:
            assert expected in nombres, f"campo {expected} faltante"

    def test_catalogos_seed(self, admin_headers, conv_id):
        r = requests.get(f"{API}/catalogos", params={"convocatoria_id": conv_id}, headers=admin_headers)
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) >= 4
        nombres = {c["nombre"] for c in cats}
        assert {"Subregiones", "Líneas", "Tipos de Organización", "Enfoque Poblacional"}.issubset(nombres)

    def test_criterios_seed(self, admin_headers, conv_id):
        r = requests.get(f"{API}/criterios", params={"convocatoria_id": conv_id}, headers=admin_headers)
        assert r.status_code == 200
        crits = r.json()
        assert len(crits) >= 9
        oficiales = [c for c in crits if c.get("oficial")]
        difers = [c for c in crits if not c.get("oficial")]
        # Seed has 6 oficiales + 3 diferenciales; tests may have added extra
        assert len(oficiales) >= 6 and len(difers) >= 3

    def test_desempates_seed(self, admin_headers, conv_id):
        r = requests.get(f"{API}/desempates", params={"convocatoria_id": conv_id}, headers=admin_headers)
        assert r.status_code == 200
        assert len(r.json()) == 7

    def test_patch_convocatoria(self, admin_headers, conv_id):
        r = requests.patch(f"{API}/convocatorias/{conv_id}", json={"descripcion": "Descripción actualizada test"}, headers=admin_headers)
        assert r.status_code == 200
        # Verify GET reflects change
        r2 = requests.get(f"{API}/convocatorias/{conv_id}", headers=admin_headers)
        assert r2.json()["descripcion"] == "Descripción actualizada test"

    def test_create_campo_and_duplicate(self, admin_headers, conv_id):
        nombre_interno = f"TEST_campo_{uuid.uuid4().hex[:6]}"
        payload = {"convocatoria_id": conv_id, "nombre_visible": "Test Campo", "nombre_interno": nombre_interno,
                   "tipo": "texto_corto", "obligatorio": False, "orden": 99}
        r = requests.post(f"{API}/campos", json=payload, headers=admin_headers)
        assert r.status_code in (200, 201), r.text
        # Duplicate
        r2 = requests.post(f"{API}/campos", json=payload, headers=admin_headers)
        assert r2.status_code in (400, 409), f"expected duplicate error, got {r2.status_code}"

    def test_create_criterio(self, admin_headers, conv_id):
        payload = {"convocatoria_id": conv_id, "nombre": f"TEST Criterio {uuid.uuid4().hex[:5]}",
                   "descripcion": "Test", "puntaje_min": 0, "puntaje_max": 5, "ponderacion": 0,
                   "oficial": False, "diferencial": False, "orden": 99}
        r = requests.post(f"{API}/criterios", json=payload, headers=admin_headers)
        assert r.status_code in (200, 201), r.text

    def test_create_catalogo(self, admin_headers, conv_id):
        payload = {"convocatoria_id": conv_id, "nombre": f"TEST_Cat_{uuid.uuid4().hex[:5]}",
                   "descripcion": "test", "activo": True, "valores": [{"valor": "X", "activo": True}]}
        r = requests.post(f"{API}/catalogos", json=payload, headers=admin_headers)
        assert r.status_code in (200, 201), r.text


# -------------- Propuestas / Jurados / Ternas / Asignaciones --------------
class TestData:
    def test_propuestas_seed(self, admin_headers, conv_id):
        r = requests.get(f"{API}/propuestas", params={"convocatoria_id": conv_id}, headers=admin_headers)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 12

    def test_propuestas_filtros(self, admin_headers, conv_id):
        r = requests.get(f"{API}/propuestas", params={"convocatoria_id": conv_id, "subregion": "Urabá"}, headers=admin_headers)
        assert r.status_code == 200
        for p in r.json():
            assert p.get("datos", {}).get("subregion") == "Urabá"
        r2 = requests.get(f"{API}/propuestas", params={"convocatoria_id": conv_id, "linea": "Cultura"}, headers=admin_headers)
        assert r2.status_code == 200
        for p in r2.json():
            assert p.get("datos", {}).get("linea") == "Cultura"
        r3 = requests.get(f"{API}/propuestas", params={"convocatoria_id": conv_id, "search": "Huerta"}, headers=admin_headers)
        assert r3.status_code == 200
        assert any("Huerta" in p.get("nombre", "") for p in r3.json())

    def test_propuestas_template(self, admin_headers, conv_id):
        r = requests.get(f"{API}/propuestas-template", params={"convocatoria_id": conv_id}, headers=admin_headers)
        assert r.status_code == 200
        assert "spreadsheet" in r.headers.get("content-type", "")

    def test_create_propuesta(self, admin_headers, conv_id):
        payload = {"convocatoria_id": conv_id, "nombre": f"TEST_Propuesta_{uuid.uuid4().hex[:5]}",
                   "organizacion": "Test Org", "datos": {"subregion": "Urabá", "municipio": "Test"}}
        r = requests.post(f"{API}/propuestas", json=payload, headers=admin_headers)
        assert r.status_code in (200, 201), r.text
        pid = r.json()["id"]
        # Verify
        g = requests.get(f"{API}/propuestas/{pid}", headers=admin_headers)
        assert g.status_code == 200

    def test_jurados_seed(self, admin_headers, conv_id):
        r = requests.get(f"{API}/jurados", params={"convocatoria_id": conv_id}, headers=admin_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 6

    def test_create_jurado_creates_user(self, admin_headers, conv_id):
        email = f"test.jurado.{uuid.uuid4().hex[:6]}@krinos.test"
        payload = {"convocatoria_id": conv_id, "nombre": "Test Jurado", "email": email,
                   "especialidad": "test", "linea_experiencia": "Cultura"}
        r = requests.post(f"{API}/jurados", json=payload, headers=admin_headers)
        assert r.status_code in (200, 201), r.text
        # Verify user created
        users_r = requests.get(f"{API}/users", headers=admin_headers)
        assert users_r.status_code == 200
        users = users_r.json()
        assert any(u["email"] == email and u["role"] == "jurado" for u in users)

    def test_ternas_seed(self, admin_headers, conv_id):
        r = requests.get(f"{API}/ternas", params={"convocatoria_id": conv_id}, headers=admin_headers)
        assert r.status_code == 200
        ternas = r.json()
        assert len(ternas) >= 3
        codes = {t["codigo"] for t in ternas}
        assert {"T1", "T2", "T3"}.issubset(codes)
        for t in ternas:
            assert len(t.get("integrantes", [])) >= 1

    def test_asignaciones_seed(self, admin_headers, conv_id):
        r = requests.get(f"{API}/asignaciones", params={"convocatoria_id": conv_id}, headers=admin_headers)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 36, f"expected >=36, got {len(items)}"

    def test_create_asignacion_auto_creates_eval(self, admin_headers, conv_id):
        # Get a jurado and propuesta
        jr = requests.get(f"{API}/jurados", params={"convocatoria_id": conv_id}, headers=admin_headers).json()[0]
        # create new propuesta to avoid conflicts
        p_payload = {"convocatoria_id": conv_id, "nombre": f"TEST_Asig_{uuid.uuid4().hex[:5]}",
                     "datos": {"subregion": "Oriente"}}
        prop = requests.post(f"{API}/propuestas", json=p_payload, headers=admin_headers).json()
        payload = {"convocatoria_id": conv_id, "propuesta_id": prop["id"], "jurado_id": jr["id"],
                   "tipo_evaluacion": "individual"}
        r = requests.post(f"{API}/asignaciones", json=payload, headers=admin_headers)
        assert r.status_code in (200, 201), r.text
        # Verify evaluation auto-created
        evs = requests.get(f"{API}/evaluaciones-individuales",
                           params={"convocatoria_id": conv_id, "propuesta_id": prop["id"]},
                           headers=admin_headers).json()
        assert any(e["jurado_id"] == jr["id"] and e["estado"] == "Borrador" for e in evs)


# -------------- Evaluaciones --------------
class TestEvaluaciones:
    def test_list_evaluaciones(self, admin_headers, conv_id):
        r = requests.get(f"{API}/evaluaciones-individuales", params={"convocatoria_id": conv_id}, headers=admin_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 24

    def test_full_eval_flow(self, admin_headers, conv_id):
        # Get an eval in Borrador
        evs = requests.get(f"{API}/evaluaciones-individuales",
                           params={"convocatoria_id": conv_id}, headers=admin_headers).json()
        ev = next((e for e in evs if e["estado"] == "Borrador"), None)
        assert ev, "No Borrador evaluation found"
        eid = ev["id"]
        # Get criterios
        crits = requests.get(f"{API}/criterios", params={"convocatoria_id": conv_id}, headers=admin_headers).json()
        # Test 1: PATCH partial without finalizar - should transition to En edición
        partial = {c["id"]: c["puntaje_max"] for c in crits[:2]}
        r = requests.patch(f"{API}/evaluaciones-individuales/{eid}",
                           json={"puntajes": partial, "observaciones": {}, "observacion_final": "WIP"},
                           headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.json()["estado"] in ("En edición", "Borrador")

        # Test 2: finalizar with missing puntaje obligatorio -> 400
        r_bad = requests.patch(f"{API}/evaluaciones-individuales/{eid}",
                               json={"puntajes": partial, "observaciones": {}, "finalizar": True},
                               headers=admin_headers)
        assert r_bad.status_code == 400

        # Test 3: finalizar with out-of-range puntaje -> 400
        bad_scores = {c["id"]: c["puntaje_max"] + 100 for c in crits}
        r_bad2 = requests.patch(f"{API}/evaluaciones-individuales/{eid}",
                                json={"puntajes": bad_scores, "observaciones": {}, "finalizar": True},
                                headers=admin_headers)
        assert r_bad2.status_code == 400

        # Test 4: finalizar OK
        full = {c["id"]: c["puntaje_max"] for c in crits}
        r_ok = requests.patch(f"{API}/evaluaciones-individuales/{eid}",
                              json={"puntajes": full, "observaciones": {}, "observacion_final": "OK", "finalizar": True},
                              headers=admin_headers)
        assert r_ok.status_code == 200, r_ok.text
        data = r_ok.json()
        assert data["estado"] == "Finalizada"
        assert data["puntaje_total"] > 0

        # Test 5: firmar
        r_sig = requests.post(f"{API}/evaluaciones-individuales/{eid}/firmar", headers=admin_headers)
        assert r_sig.status_code == 200

        # Test 6: acta individual PDF
        r_pdf = requests.get(f"{API}/actas/individual/{eid}", headers=admin_headers)
        assert r_pdf.status_code == 200
        assert r_pdf.headers.get("content-type", "").startswith("application/pdf")
        assert r_pdf.content[:4] == b"%PDF"

    def test_evaluacion_colectiva_and_ranking(self, admin_headers, conv_id):
        # Finalizar TODAS las individuales de la primera propuesta de Urabá
        props = requests.get(f"{API}/propuestas",
                             params={"convocatoria_id": conv_id, "subregion": "Urabá"},
                             headers=admin_headers).json()
        # Use propuesta from seed (P-0001..0003)
        seed_prop = next((p for p in props if p.get("codigo", "").startswith("P-000")), None)
        assert seed_prop
        pid = seed_prop["id"]
        evs = requests.get(f"{API}/evaluaciones-individuales",
                           params={"convocatoria_id": conv_id, "propuesta_id": pid},
                           headers=admin_headers).json()
        crits = requests.get(f"{API}/criterios", params={"convocatoria_id": conv_id}, headers=admin_headers).json()
        # Finalize all of them (admin can edit)
        terna_id = None
        for ev in evs:
            full = {c["id"]: c["puntaje_max"] for c in crits}
            requests.patch(f"{API}/evaluaciones-individuales/{ev['id']}",
                           json={"puntajes": full, "observaciones": {}, "observacion_final": "OK", "finalizar": True},
                           headers=admin_headers)
        # Determine terna for this propuesta from asignaciones
        asigs = requests.get(f"{API}/asignaciones",
                             params={"convocatoria_id": conv_id, "propuesta_id": pid},
                             headers=admin_headers).json()
        terna_id = next((a.get("terna_id") for a in asigs if a.get("terna_id")), None)
        assert terna_id, "No terna found for this propuesta"

        # Create colectiva
        r_col = requests.post(f"{API}/evaluaciones-colectivas",
                              json={"convocatoria_id": conv_id, "propuesta_id": pid, "terna_id": terna_id},
                              headers=admin_headers)
        assert r_col.status_code in (200, 201), r_col.text
        col = r_col.json()
        col_id = col["id"]
        assert col.get("puntaje_final", 0) > 0

        # Cerrar (skip if already closed from previous run)
        if col.get("estado") != "Cerrada":
            r_close = requests.patch(f"{API}/evaluaciones-colectivas/{col_id}",
                                     json={"cerrar": True}, headers=admin_headers)
            assert r_close.status_code == 200
            assert r_close.json()["estado"] == "Cerrada"

        # Try editing closed -> should fail
        r_block = requests.patch(f"{API}/evaluaciones-colectivas/{col_id}",
                                 json={"observacion_consolidada": "x"}, headers=admin_headers)
        assert r_block.status_code == 400

        # Acta colectiva
        r_pdf = requests.get(f"{API}/actas/colectiva/{col_id}", headers=admin_headers)
        assert r_pdf.status_code == 200
        assert r_pdf.headers["content-type"].startswith("application/pdf")

        # Generate ranking
        r_rk = requests.post(f"{API}/rankings/generar",
                             params={"convocatoria_id": conv_id, "agrupar_por": "subregion", "modo": "colectivo"},
                             headers=admin_headers)
        assert r_rk.status_code == 200, r_rk.text
        rk = r_rk.json()
        assert "grupos" in rk and len(rk["grupos"]) > 0
        # Each item should have a puesto
        for g in rk["grupos"]:
            for it in g["items"]:
                assert "puesto" in it
        rk_id = rk["id"]

        # List rankings
        r_list = requests.get(f"{API}/rankings", params={"convocatoria_id": conv_id}, headers=admin_headers)
        assert r_list.status_code == 200
        assert any(x["id"] == rk_id for x in r_list.json())

        # Acta ranking PDF
        r_pdfrk = requests.get(f"{API}/actas/ranking/{rk_id}", headers=admin_headers)
        assert r_pdfrk.status_code == 200
        assert r_pdfrk.headers["content-type"].startswith("application/pdf")


# -------------- Reports / Dashboard --------------
class TestReports:
    def test_dashboard(self, admin_headers, conv_id):
        r = requests.get(f"{API}/dashboard", params={"convocatoria_id": conv_id}, headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["total_propuestas"] >= 12
        assert d["jurados_activos"] >= 6
        assert d["ternas_activas"] >= 3

    def test_reporte_avance_jurado(self, admin_headers, conv_id):
        r = requests.get(f"{API}/reportes/avance-jurado", params={"convocatoria_id": conv_id}, headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 6

    def test_reporte_avance_terna(self, admin_headers, conv_id):
        r = requests.get(f"{API}/reportes/avance-terna", params={"convocatoria_id": conv_id}, headers=admin_headers)
        assert r.status_code == 200

    def test_reporte_consolidado(self, admin_headers, conv_id):
        r = requests.get(f"{API}/reportes/consolidado-individual",
                         params={"convocatoria_id": conv_id}, headers=admin_headers)
        assert r.status_code == 200

    def test_export_excel(self, admin_headers, conv_id):
        r = requests.get(f"{API}/reportes/export-excel",
                         params={"reporte": "avance-jurado", "convocatoria_id": conv_id}, headers=admin_headers)
        assert r.status_code == 200
        assert "spreadsheet" in r.headers["content-type"]

    def test_auditoria_admin(self, admin_headers):
        r = requests.get(f"{API}/reportes/auditoria", headers=admin_headers)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        # Should contain at least a login action
        acciones = {it["accion"] for it in items}
        assert "login" in acciones

    def test_auditoria_forbidden_for_jurado(self, jurado_headers):
        r = requests.get(f"{API}/reportes/auditoria", headers=jurado_headers)
        assert r.status_code == 403


# -------------- Users RBAC --------------
class TestUsersRBAC:
    def test_list_users_admin(self, admin_headers):
        r = requests.get(f"{API}/users", headers=admin_headers)
        assert r.status_code == 200

    def test_list_users_jurado_forbidden(self, jurado_headers):
        r = requests.get(f"{API}/users", headers=jurado_headers)
        assert r.status_code == 403

    def test_create_user(self, admin_headers):
        username = f"test_user_{uuid.uuid4().hex[:6]}"
        payload = {"username": username, "email": f"{username}@krinos.gov.co",
                   "name": "Test User", "password": "Test2026!", "role": "supervisor"}
        r = requests.post(f"{API}/users", json=payload, headers=admin_headers)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data["username"] == username.lower()
        assert "password_hash" not in data

    def test_create_user_invalid_role(self, admin_headers):
        payload = {"username": f"bad_{uuid.uuid4().hex[:5]}", "email": f"bad_{uuid.uuid4().hex[:5]}@x.co",
                   "name": "Bad", "password": "x", "role": "invalid_role_xyz"}
        r = requests.post(f"{API}/users", json=payload, headers=admin_headers)
        assert r.status_code == 400


# -------------- Asignación masiva --------------
class TestMasivaSubregion:
    def test_masiva(self, admin_headers, conv_id):
        # Get a terna and a subregion
        ternas = requests.get(f"{API}/ternas", params={"convocatoria_id": conv_id}, headers=admin_headers).json()
        t = next((x for x in ternas if x["codigo"] == "T2"), ternas[0])
        payload = {"convocatoria_id": conv_id, "terna_id": t["id"], "subregion": "Oriente"}
        r = requests.post(f"{API}/asignaciones/masiva-subregion", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "asignaciones_creadas" in d


# -------------- Brute force (run last) --------------
class TestBruteForce:
    def test_brute_force_lockout(self):
        """5 failed login attempts -> 429"""
        # Use unique identifier so we don't lock real admin
        identifier = f"brute_test_{uuid.uuid4().hex[:6]}"
        last_status = None
        for i in range(6):
            r = requests.post(f"{API}/auth/login", json={"username": identifier, "password": "wrong"})
            last_status = r.status_code
            if r.status_code == 429:
                break
        assert last_status == 429, f"expected 429 after 5 fails, got {last_status}"

        # Cleanup: clear admin attempts via successful login (admin attempts not affected since identifier differs)
        # Verify admin can still login
        r2 = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
        assert r2.status_code == 200
