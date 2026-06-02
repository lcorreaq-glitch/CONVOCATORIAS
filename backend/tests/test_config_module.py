"""KRINOS - tests for the redesigned Configuración module:
resumen, reordenar (campos/criterios/desempates), clonar, export/import.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USER = "lcorreaq"
ADMIN_PASS = "Chocolate2026!"


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def conv_id(admin_headers):
    r = requests.get(f"{API}/convocatorias", headers=admin_headers)
    assert r.status_code == 200
    inc = next((c for c in r.json() if c.get("codigo") == "INC2026"), None)
    assert inc, "INC2026 seed missing"
    return inc["id"]


# ---- Resumen ----
class TestResumen:
    def test_resumen_full_shape(self, admin_headers, conv_id):
        r = requests.get(f"{API}/convocatorias/{conv_id}/configuracion/resumen", headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        # Top-level keys
        for k in ("convocatoria", "counts", "catalogo_usage", "catalogos_by_id", "desempate_refs", "alertas", "stats"):
            assert k in d, f"missing key {k}"
        # counts content
        c = d["counts"]
        for k in ("campos", "catalogos", "criterios", "desempates", "propuestas",
                  "evaluaciones_individuales", "evaluaciones_colectivas", "puntaje_max_total"):
            assert k in c
        assert c["campos"] >= 11
        assert c["catalogos"] >= 4
        assert c["criterios"] >= 9
        assert c["desempates"] == 7
        # Alertas content
        a = d["alertas"]
        assert "campos_lista_sin_catalogo" in a
        assert "criterios_sin_ponderacion" in a
        assert "puntaje_total_no_100" in a
        assert isinstance(a["campos_lista_sin_catalogo"], list)
        assert isinstance(a["puntaje_total_no_100"], bool)
        # Desempate refs: each has fuente in (criterio, campo, sorteo, indefinida)
        assert len(d["desempate_refs"]) == 7
        fuentes = {x["referencia"]["fuente"] for x in d["desempate_refs"]}
        # at least one resolved fuente (criterio/campo/sorteo)
        assert fuentes & {"criterio", "campo", "sorteo"}
        # Catalogo usage shape: dict id -> list
        assert isinstance(d["catalogo_usage"], dict)
        assert isinstance(d["catalogos_by_id"], dict)

    def test_resumen_404(self, admin_headers):
        r = requests.get(f"{API}/convocatorias/does-not-exist/configuracion/resumen", headers=admin_headers)
        assert r.status_code == 404


# ---- Reordenar ----
class TestReordenar:
    def test_reordenar_campos(self, admin_headers, conv_id):
        items = requests.get(f"{API}/campos", params={"convocatoria_id": conv_id}, headers=admin_headers).json()
        assert len(items) >= 3
        ids = [c["id"] for c in items]
        reversed_ids = list(reversed(ids))
        r = requests.post(f"{API}/campos/reordenar",
                          json={"convocatoria_id": conv_id, "ids": reversed_ids}, headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.json()["count"] == len(reversed_ids)
        # Verify persistence -> GET returns sorted by orden 1..n in reversed order
        after = requests.get(f"{API}/campos", params={"convocatoria_id": conv_id}, headers=admin_headers).json()
        # Build {id: orden}
        ord_map = {c["id"]: c["orden"] for c in after}
        for idx, _id in enumerate(reversed_ids):
            assert ord_map[_id] == idx + 1, f"orden mismatch for {_id}"
        # Restore original order so other tests are not affected
        rr = requests.post(f"{API}/campos/reordenar",
                           json={"convocatoria_id": conv_id, "ids": ids}, headers=admin_headers)
        assert rr.status_code == 200

    def test_reordenar_criterios(self, admin_headers, conv_id):
        items = requests.get(f"{API}/criterios", params={"convocatoria_id": conv_id}, headers=admin_headers).json()
        ids = [c["id"] for c in items][:5]
        rev = list(reversed(ids))
        r = requests.post(f"{API}/criterios/reordenar",
                          json={"convocatoria_id": conv_id, "ids": rev}, headers=admin_headers)
        assert r.status_code == 200
        after = requests.get(f"{API}/criterios", params={"convocatoria_id": conv_id}, headers=admin_headers).json()
        ord_map = {c["id"]: c["orden"] for c in after}
        for idx, _id in enumerate(rev):
            assert ord_map[_id] == idx + 1

    def test_reordenar_desempates(self, admin_headers, conv_id):
        items = requests.get(f"{API}/desempates", params={"convocatoria_id": conv_id}, headers=admin_headers).json()
        ids = [c["id"] for c in items]
        rev = list(reversed(ids))
        r = requests.post(f"{API}/desempates/reordenar",
                          json={"convocatoria_id": conv_id, "ids": rev}, headers=admin_headers)
        assert r.status_code == 200
        after = requests.get(f"{API}/desempates", params={"convocatoria_id": conv_id}, headers=admin_headers).json()
        ord_map = {c["id"]: c["orden"] for c in after}
        for idx, _id in enumerate(rev):
            assert ord_map[_id] == idx + 1


# ---- Clonar + Export/Import ----
@pytest.fixture(scope="module")
def temp_conv(admin_headers):
    """Create an empty temp convocatoria for clone/import targets."""
    code = f"TST{uuid.uuid4().hex[:5].upper()}"
    payload = {"codigo": code, "nombre": f"TEST_Convocatoria_{code}", "descripcion": "tmp",
               "tipo": "Pública", "estado": "Borrador", "etapa_actual": "Configuración"}
    r = requests.post(f"{API}/convocatorias", json=payload, headers=admin_headers)
    assert r.status_code in (200, 201), r.text
    cid = r.json()["id"]
    yield cid
    # Cleanup: hard delete (no evaluaciones)
    requests.delete(f"{API}/convocatorias/{cid}", headers=admin_headers)


class TestClonar:
    def test_clonar_same_400(self, admin_headers, conv_id):
        r = requests.post(f"{API}/convocatorias/{conv_id}/configuracion/clonar",
                          json={"source_convocatoria_id": conv_id}, headers=admin_headers)
        assert r.status_code == 400

    def test_clonar_404(self, admin_headers, conv_id):
        r = requests.post(f"{API}/convocatorias/{conv_id}/configuracion/clonar",
                          json={"source_convocatoria_id": "nope"}, headers=admin_headers)
        assert r.status_code == 404

    def test_clonar_agregar_then_skips(self, admin_headers, conv_id, temp_conv):
        # Ensure source has at least one campo with catalogo_id (seed has none) to validate remap
        cats = requests.get(f"{API}/catalogos", params={"convocatoria_id": conv_id}, headers=admin_headers).json()
        assert cats, "Source has no catalogos"
        src_cat_id = cats[0]["id"]
        # Create a campo vinculated to that catalogo (idempotent via nombre_interno)
        ni = f"test_vinc_campo_{uuid.uuid4().hex[:5]}"
        requests.post(f"{API}/campos", json={
            "convocatoria_id": conv_id, "nombre_visible": "TEST vínculo", "nombre_interno": ni,
            "tipo": "lista", "catalogo_id": src_cat_id, "orden": 50,
        }, headers=admin_headers)

        # First clone (empty target -> everything imported)
        r1 = requests.post(f"{API}/convocatorias/{temp_conv}/configuracion/clonar",
                           json={"source_convocatoria_id": conv_id, "modo": "agregar"},
                           headers=admin_headers)
        assert r1.status_code == 200, r1.text
        res1 = r1.json()["resultado"]
        assert res1["campos"] >= 11
        assert res1["catalogos"] >= 4
        assert res1["criterios"] >= 9
        assert res1["desempates"] == 7

        # Verify campos in target have catalogo_id remapped to NEW catalogos in target
        target_cats = requests.get(f"{API}/catalogos", params={"convocatoria_id": temp_conv},
                                   headers=admin_headers).json()
        target_cat_ids = {c["id"] for c in target_cats}
        target_campos = requests.get(f"{API}/campos", params={"convocatoria_id": temp_conv},
                                     headers=admin_headers).json()
        with_cat = [c for c in target_campos if c.get("catalogo_id")]
        assert any(with_cat), "Expected at least one campo with catalogo_id after clone"
        for c in with_cat:
            assert c["catalogo_id"] in target_cat_ids, (
                f"catalogo_id not remapped: campo={c['nombre_interno']} cat={c['catalogo_id']}")

        # Second clone with modo=agregar -> all should be skipped (same nombres/internos)
        r2 = requests.post(f"{API}/convocatorias/{temp_conv}/configuracion/clonar",
                           json={"source_convocatoria_id": conv_id, "modo": "agregar"},
                           headers=admin_headers)
        assert r2.status_code == 200
        res2 = r2.json()["resultado"]
        assert res2["campos"] == 0
        assert res2["catalogos"] == 0
        assert res2["criterios"] == 0
        # Desempates have no unique constraint -> they are re-added
        assert len(res2["saltados"]) > 0


class TestExportImport:
    def test_export_shape(self, admin_headers, conv_id):
        r = requests.get(f"{API}/convocatorias/{conv_id}/configuracion/export", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["krinos_export_version"] == 1
        for k in ("campos", "catalogos", "criterios", "desempates", "exported_at", "convocatoria"):
            assert k in d
        assert isinstance(d["campos"], list) and len(d["campos"]) >= 11
        assert isinstance(d["catalogos"], list) and len(d["catalogos"]) >= 4

    def test_import_into_temp(self, admin_headers, conv_id):
        # Create a fresh temp conv just for this import test
        code = f"IMP{uuid.uuid4().hex[:5].upper()}"
        payload = {"codigo": code, "nombre": f"TEST_Import_{code}", "estado": "Borrador",
                   "etapa_actual": "Configuración"}
        r0 = requests.post(f"{API}/convocatorias", json=payload, headers=admin_headers)
        assert r0.status_code in (200, 201)
        target_id = r0.json()["id"]
        try:
            exp = requests.get(f"{API}/convocatorias/{conv_id}/configuracion/export",
                               headers=admin_headers).json()
            r = requests.post(f"{API}/convocatorias/{target_id}/configuracion/import",
                              json={"data": exp, "modo": "agregar"}, headers=admin_headers)
            assert r.status_code == 200, r.text
            res = r.json()["resultado"]
            assert res["campos"] >= 11
            assert res["catalogos"] >= 4
            # Verify remap of catalogo_id in imported campos
            t_cats = requests.get(f"{API}/catalogos", params={"convocatoria_id": target_id},
                                  headers=admin_headers).json()
            t_cat_ids = {c["id"] for c in t_cats}
            t_campos = requests.get(f"{API}/campos", params={"convocatoria_id": target_id},
                                    headers=admin_headers).json()
            with_cat = [c for c in t_campos if c.get("catalogo_id")]
            assert any(with_cat)
            for c in with_cat:
                assert c["catalogo_id"] in t_cat_ids
        finally:
            requests.delete(f"{API}/convocatorias/{target_id}", headers=admin_headers)

    def test_import_invalid_version(self, admin_headers, conv_id):
        r = requests.post(f"{API}/convocatorias/{conv_id}/configuracion/import",
                          json={"data": {"krinos_export_version": 999}}, headers=admin_headers)
        assert r.status_code == 400
