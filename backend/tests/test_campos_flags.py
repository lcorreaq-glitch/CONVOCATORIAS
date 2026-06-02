"""Tests for new flags uso_propuesta / uso_lista on /api/campos (iter 8)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://convocatoria-hub-2.preview.emergentagent.com").rstrip("/")
ADMIN = {"username": "lcorreaq", "password": "Chocolate2026!"}


@pytest.fixture(scope="module")
def auth_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def inc2026_id(auth_session):
    r = auth_session.get(f"{BASE_URL}/api/convocatorias", timeout=15)
    assert r.status_code == 200
    items = r.json()
    inc = next((c for c in items if c.get("codigo") == "INC2026"), None)
    assert inc, "INC2026 not found"
    return inc["id"]


def _list_campos(s, conv_id):
    r = s.get(f"{BASE_URL}/api/campos?convocatoria_id={conv_id}", timeout=15)
    assert r.status_code == 200
    return r.json()


class TestINCFlagsState:
    """Estado actual de los flags en INC2026."""

    def test_all_campos_have_uso_propuesta_true(self, auth_session, inc2026_id):
        campos = _list_campos(auth_session, inc2026_id)
        assert len(campos) > 0
        offenders = [c["nombre_interno"] for c in campos if c.get("uso_propuesta") is False]
        assert offenders == [], f"Campos con uso_propuesta=False (no esperado tras script seed): {offenders}"

    def test_seven_campos_have_uso_lista_true(self, auth_session, inc2026_id):
        campos = _list_campos(auth_session, inc2026_id)
        lista_on = sorted([c["nombre_interno"] for c in campos if c.get("uso_lista") is True])
        expected = sorted(["subregion", "municipio", "tipo_organizacion", "linea",
                           "tematica", "nombre_organizacion", "nit_rut"])
        assert lista_on == expected, f"uso_lista=True esperado={expected} actual={lista_on}"


class TestCampoFlagsCRUD:
    """POST y PATCH con los nuevos flags."""

    test_internal = f"test_flag_{uuid.uuid4().hex[:8]}"

    def test_create_campo_with_new_flags(self, auth_session, inc2026_id):
        payload = {
            "convocatoria_id": inc2026_id,
            "nombre_visible": "TEST flag field",
            "nombre_interno": self.__class__.test_internal,
            "tipo": "texto_corto",
            "uso_propuesta": True,
            "uso_lista": True,
        }
        r = auth_session.post(f"{BASE_URL}/api/campos", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["uso_propuesta"] is True
        assert body["uso_lista"] is True
        self.__class__.created_id = body["id"]

        # GET verify persistence
        campos = _list_campos(auth_session, inc2026_id)
        match = next((c for c in campos if c["id"] == body["id"]), None)
        assert match is not None
        assert match["uso_propuesta"] is True
        assert match["uso_lista"] is True

    def test_patch_uso_propuesta_false(self, auth_session, inc2026_id):
        cid = self.__class__.created_id
        r = auth_session.patch(f"{BASE_URL}/api/campos/{cid}", json={"uso_propuesta": False}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["uso_propuesta"] is False
        assert body["uso_lista"] is True  # unchanged

    def test_patch_uso_lista_false(self, auth_session, inc2026_id):
        cid = self.__class__.created_id
        r = auth_session.patch(f"{BASE_URL}/api/campos/{cid}", json={"uso_lista": False}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["uso_lista"] is False
        assert body["uso_propuesta"] is False

    def test_cleanup_created_campo(self, auth_session):
        cid = self.__class__.created_id
        r = auth_session.delete(f"{BASE_URL}/api/campos/{cid}", timeout=15)
        assert r.status_code == 200


class TestPropuestasRegression:
    """Regresión: listar/crear/editar propuestas funciona."""

    def test_list_propuestas_inc2026(self, auth_session, inc2026_id):
        r = auth_session.get(f"{BASE_URL}/api/propuestas?convocatoria_id={inc2026_id}", timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1, "Esperábamos al menos 1 propuesta en INC2026"

    def test_create_edit_delete_propuesta(self, auth_session, inc2026_id):
        # CREATE
        payload = {
            "convocatoria_id": inc2026_id,
            "nombre": "TEST_REGRESION_iter8",
            "organizacion": "TEST Org",
            "datos": {"subregion": "Oriente"},
            "estado": "Registrada",
        }
        r = auth_session.post(f"{BASE_URL}/api/propuestas", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        prop = r.json()
        pid = prop["id"]
        assert prop["nombre"] == "TEST_REGRESION_iter8"

        # EDIT
        r2 = auth_session.patch(f"{BASE_URL}/api/propuestas/{pid}",
                                json={"nombre": "TEST_REGRESION_iter8_edit"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["nombre"] == "TEST_REGRESION_iter8_edit"

        # Cleanup via mongo (no DELETE endpoint exists for propuestas)
        try:
            import asyncio
            from motor.motor_asyncio import AsyncIOMotorClient
            mongo_url = os.environ.get("MONGO_URL")
            db_name = os.environ.get("DB_NAME")
            if mongo_url and db_name:
                async def _del():
                    c = AsyncIOMotorClient(mongo_url)
                    await c[db_name].propuestas.delete_one({"id": pid})
                    c.close()
                asyncio.run(_del())
        except Exception as e:
            print(f"WARN cleanup failed: {e}")
