"""Backend tests for INC2026 form alignment (Iteration 6)."""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://convocatoria-hub-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USER = "lcorreaq"
ADMIN_PASS = "Chocolate2026!"

EXPECTED_FIELDS_ORDER = [
    "subregion", "municipio", "tipo_organizacion", "enfoque_poblacional",
    "nombre_organizacion", "nit_rut", "id_organismo_comunal", "representante_legal",
    "linea", "tematica", "ganador_2024", "ganador_2025",
    "fecha_radicacion", "hora_radicacion", "priorizada", "link_expediente",
]

# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s

@pytest.fixture(scope="module")
def inc2026_id(session):
    r = session.get(f"{API}/convocatorias")
    assert r.status_code == 200
    for c in r.json():
        if c.get("codigo") == "INC2026":
            return c["id"]
    pytest.fail("INC2026 not found")


# ---------- Tests: campos ----------

class TestCampos:
    def test_get_campos_returns_list(self, session, inc2026_id):
        r = session.get(f"{API}/campos?convocatoria_id={inc2026_id}")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_campos_contain_expected(self, session, inc2026_id):
        r = session.get(f"{API}/campos?convocatoria_id={inc2026_id}")
        campos = r.json()
        nombres = [c["nombre_interno"] for c in campos]
        missing = [f for f in EXPECTED_FIELDS_ORDER if f not in nombres]
        assert not missing, f"Missing campos: {missing}. Found: {nombres}"

    def test_campos_order(self, session, inc2026_id):
        r = session.get(f"{API}/campos?convocatoria_id={inc2026_id}")
        campos = sorted(r.json(), key=lambda c: c.get("orden", 999))
        nombres_orden = [c["nombre_interno"] for c in campos if c["nombre_interno"] in EXPECTED_FIELDS_ORDER]
        # Verify same relative order
        expected = [f for f in EXPECTED_FIELDS_ORDER if f in nombres_orden]
        assert nombres_orden == expected, f"Order mismatch. Got {nombres_orden}, expected {expected}"

    def test_lista_campos_have_catalogo(self, session, inc2026_id):
        r = session.get(f"{API}/campos?convocatoria_id={inc2026_id}")
        campos = {c["nombre_interno"]: c for c in r.json()}
        expected_lista = {
            "subregion": "Subregiones",
            "municipio": "Municipios",
            "tipo_organizacion": "Tipos de Organización",
            "linea": "Líneas",
            "tematica": "Temáticas",
        }
        for nombre_interno in expected_lista:
            assert nombre_interno in campos, f"{nombre_interno} missing"
            c = campos[nombre_interno]
            assert c.get("catalogo_id"), f"{nombre_interno} has no catalogo_id"
            assert c.get("tipo") == "lista", f"{nombre_interno} tipo={c.get('tipo')}"

    def test_enfoque_poblacional_multi(self, session, inc2026_id):
        r = session.get(f"{API}/campos?convocatoria_id={inc2026_id}")
        c = next((x for x in r.json() if x["nombre_interno"] == "enfoque_poblacional"), None)
        assert c is not None
        assert c["tipo"] == "seleccion_multiple"
        assert c.get("catalogo_id")


# ---------- Tests: catalogos ----------

class TestCatalogos:
    def test_municipios_125(self, session, inc2026_id):
        r = session.get(f"{API}/catalogos?convocatoria_id={inc2026_id}")
        assert r.status_code == 200
        cat = next((x for x in r.json() if x["nombre"] == "Municipios"), None)
        assert cat, "Catalogo Municipios not found"
        active_vals = [v for v in cat["valores"] if v.get("activo") is not False]
        assert len(active_vals) >= 120, f"Only {len(active_vals)} municipios"

    def test_tematicas_8(self, session, inc2026_id):
        r = session.get(f"{API}/catalogos?convocatoria_id={inc2026_id}")
        cat = next((x for x in r.json() if x["nombre"] == "Temáticas"), None)
        assert cat, "Catalogo Temáticas not found"
        assert len(cat["valores"]) == 8, f"Got {len(cat['valores'])} temáticas"


# ---------- Tests: propuestas CRUD ----------

class TestPropuestasCRUD:
    @pytest.fixture(scope="class")
    def created_ids(self):
        return []

    def test_create_propuesta(self, session, inc2026_id, created_ids):
        payload = {
            "convocatoria_id": inc2026_id,
            "nombre": f"TEST_Propuesta_{uuid.uuid4().hex[:6]}",
            "organizacion": "TEST Org",
            "datos": {
                "subregion": "Oriente",
                "municipio": "Rionegro",
                "tipo_organizacion": "Junta de Acción Comunal",
                "nombre_organizacion": "TEST Org",
                "nit_rut": "900111-1",
                "linea": "Cultura",
                "tematica": "1_1 · Línea 1 — Acción Comunal Activa",
                "fecha_radicacion": "2026-02-15",
                "hora_radicacion": "10:30",
                "link_expediente": "https://example.com/exp",
                "ganador_2024": False,
            },
            "estado": "Registrada",
        }
        r = session.post(f"{API}/propuestas", json=payload)
        assert r.status_code in (200, 201), f"Create failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("codigo", "").startswith("P-"), f"codigo not autogenerated: {data.get('codigo')}"
        assert data["nombre"] == payload["nombre"]
        assert data["datos"]["municipio"] == "Rionegro"
        created_ids.append(data["id"])

    def test_get_propuesta_persisted(self, session, created_ids):
        assert created_ids, "Previous test did not create"
        pid = created_ids[0]
        r = session.get(f"{API}/propuestas/{pid}")
        assert r.status_code == 200
        d = r.json()
        assert d["datos"]["subregion"] == "Oriente"

    def test_patch_propuesta(self, session, created_ids):
        pid = created_ids[0]
        r = session.patch(f"{API}/propuestas/{pid}", json={"datos": {"subregion": "Oriente", "municipio": "La Ceja"}})
        assert r.status_code == 200, f"Patch failed: {r.text}"
        # Verify
        r2 = session.get(f"{API}/propuestas/{pid}")
        assert r2.json()["datos"]["municipio"] == "La Ceja"

    def test_cleanup(self, session, created_ids):
        for pid in created_ids:
            session.delete(f"{API}/propuestas/{pid}")


# ---------- Tests: regression on excel template ----------

class TestExcelRegression:
    def test_template_download(self, session, inc2026_id):
        r = session.get(f"{API}/propuestas-template?convocatoria_id={inc2026_id}")
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "spreadsheet" in ct or "octet-stream" in ct or "excel" in ct.lower(), f"Got CT={ct}"
        assert len(r.content) > 500
