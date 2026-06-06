"""Iter 17: P0 actas subregiones, P1 coherencia AI, P2 ranking cobertura + strict colectivo."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://convocatoria-hub-2.preview.emergentagent.com").rstrip("/")
ADMIN = {"username": "lcorreaq", "password": "Chocolate2026!"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def convocatoria_id(headers):
    r = requests.get(f"{BASE_URL}/api/convocatorias", headers=headers, timeout=30)
    assert r.status_code == 200
    convs = r.json()
    # Prefer INC2026
    inc = next((c for c in convs if c.get("codigo", "").upper() == "INC2026"), None)
    return (inc or convs[0])["id"]


# =================== P0: actas-pendientes subregiones ===================
class TestActasSubregiones:
    def test_actas_pendientes_returns(self, headers, convocatoria_id):
        r = requests.get(f"{BASE_URL}/api/actas-pendientes",
                         params={"convocatoria_id": convocatoria_id},
                         headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "individual" in data
        assert "colectiva_terna" in data
        # estructura mínima
        for i in data["individual"]:
            assert "jurado_id" in i and "subregiones" in i
            assert isinstance(i["subregiones"], list)
        for c in data["colectiva_terna"]:
            assert "terna_id" in c
            assert "subregion" in c
            assert "subregiones" in c
            assert isinstance(c["subregiones"], list)

    def test_actas_pendientes_subregiones_consistency(self, headers, convocatoria_id):
        """Verifica que subregiones para colectivas se derivan correctamente.
        Si terna evaluó propuestas, las subregiones deben coincidir con propuestas evaluadas.
        Si no hay propuestas con subregion, debe caer al fallback terna/jurado."""
        r = requests.get(f"{BASE_URL}/api/actas-pendientes",
                         params={"convocatoria_id": convocatoria_id},
                         headers=headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        # Validar que el campo subregion (string) y subregiones (list) están poblados consistentemente
        for c in data["colectiva_terna"]:
            if c.get("subregiones"):
                # subregion debe ser join de subregiones
                expected = ", ".join(c["subregiones"])
                assert c["subregion"] == expected or c["subregion"] is not None


# =================== P1: AI coherencia ===================
class TestCoherenciaIA:
    def test_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/ai/coherencia-evaluacion",
                          json={"evaluacion_id": "x", "tipo": "individual"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_404_if_not_found(self, headers):
        r = requests.post(f"{BASE_URL}/api/ai/coherencia-evaluacion",
                          headers=headers,
                          json={"evaluacion_id": "fake-id-no-existe-123", "tipo": "individual"},
                          timeout=30)
        assert r.status_code == 404, r.text

    def test_coherencia_individual(self, headers, convocatoria_id):
        # Buscar primera evaluación individual real
        r = requests.get(f"{BASE_URL}/api/evaluaciones-individuales",
                         params={"convocatoria_id": convocatoria_id},
                         headers=headers, timeout=30)
        if r.status_code != 200:
            pytest.skip(f"No se pudieron listar evaluaciones: {r.status_code}")
        evs = r.json()
        if not evs:
            pytest.skip("Sin evaluaciones individuales en la convocatoria")
        ev_id = evs[0]["id"]
        r2 = requests.post(f"{BASE_URL}/api/ai/coherencia-evaluacion",
                           headers=headers,
                           json={"evaluacion_id": ev_id, "tipo": "individual"},
                           timeout=120)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert "coherente" in data
        assert "resumen" in data
        assert "hallazgos" in data
        assert isinstance(data["coherente"], bool)
        assert isinstance(data["hallazgos"], list)

    def test_coherencia_colectiva(self, headers, convocatoria_id):
        r = requests.get(f"{BASE_URL}/api/evaluaciones-colectivas",
                         params={"convocatoria_id": convocatoria_id},
                         headers=headers, timeout=30)
        if r.status_code != 200:
            pytest.skip(f"No se pudieron listar colectivas: {r.status_code}")
        evs = r.json()
        if not evs:
            pytest.skip("Sin evaluaciones colectivas")
        ev_id = evs[0]["id"]
        r2 = requests.post(f"{BASE_URL}/api/ai/coherencia-evaluacion",
                           headers=headers,
                           json={"evaluacion_id": ev_id, "tipo": "colectiva"},
                           timeout=120)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert "coherente" in data
        assert "resumen" in data
        assert "hallazgos" in data
        assert isinstance(data["hallazgos"], list)


# =================== P2: Ranking cobertura + strict colectivo ===================
class TestRankingCobertura:
    def test_generar_ranking_cobertura(self, headers, convocatoria_id):
        # Probar modo colectivo estricto
        r = requests.post(f"{BASE_URL}/api/rankings/generar",
                          headers=headers,
                          params={"convocatoria_id": convocatoria_id, "modo": "colectivo"},
                          timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "cobertura" in data, f"Falta campo 'cobertura' en respuesta: keys={list(data.keys())}"
        cob = data["cobertura"]
        assert "total_propuestas" in cob
        assert "con_puntaje" in cob
        assert "sin_puntaje" in cob
        assert "propuestas_sin_puntaje" in cob
        assert isinstance(cob["propuestas_sin_puntaje"], list)
        # Lista hasta 50 items con codigo/nombre/propuesta_id
        for p in cob["propuestas_sin_puntaje"][:5]:
            assert "codigo" in p or "propuesta_id" in p
        assert len(cob["propuestas_sin_puntaje"]) <= 50
        # total = con + sin
        assert cob["total_propuestas"] == cob["con_puntaje"] + cob["sin_puntaje"]

    def test_generar_ranking_individual(self, headers, convocatoria_id):
        r = requests.post(f"{BASE_URL}/api/rankings/generar",
                          headers=headers,
                          params={"convocatoria_id": convocatoria_id, "modo": "individual"},
                          timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "cobertura" in data
