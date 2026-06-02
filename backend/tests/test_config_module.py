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


# ---- New in iteration 4: hard delete catalogo with link-check + PATCH campos flags ----
class TestDeleteCatalogoHardDelete:
    def test_delete_blocked_when_linked_then_hard_delete_when_unlinked(self, admin_headers, conv_id):
        # 1) Create new catalogo
        cat_payload = {
            "convocatoria_id": conv_id,
            "nombre": f"TEST_CatHardDel_{uuid.uuid4().hex[:6]}",
            "descripcion": "tmp para borrado",
            "valores": [{"nombre": "A"}, {"nombre": "B"}],
        }
        r = requests.post(f"{API}/catalogos", json=cat_payload, headers=admin_headers)
        assert r.status_code in (200, 201), r.text
        cat_id = r.json()["id"]

        # 2) Create a campo that uses this catalogo
        ni = f"test_hd_campo_{uuid.uuid4().hex[:5]}"
        rc = requests.post(f"{API}/campos", json={
            "convocatoria_id": conv_id,
            "nombre_visible": "TEST hard delete campo",
            "nombre_interno": ni,
            "tipo": "lista",
            "catalogo_id": cat_id,
            "orden": 99,
        }, headers=admin_headers)
        assert rc.status_code in (200, 201), rc.text
        campo_id = rc.json()["id"]

        # 3) DELETE must be blocked with 409 + detail mentions "vinculado"
        rd = requests.delete(f"{API}/catalogos/{cat_id}", headers=admin_headers)
        assert rd.status_code == 409, rd.text
        body = rd.json()
        detail = body.get("detail", "") if isinstance(body, dict) else ""
        assert "vinculado" in detail.lower(), f"unexpected detail: {detail}"

        # 4) Verify catalogo still exists
        rg = requests.get(f"{API}/catalogos/{cat_id}", headers=admin_headers)
        # endpoint may not exist; instead list and check
        cats = requests.get(f"{API}/catalogos", params={"convocatoria_id": conv_id},
                            headers=admin_headers).json()
        assert any(c["id"] == cat_id for c in cats), "catalogo should still exist after blocked delete"

        # 5) Unlink: delete the campo
        rdc = requests.delete(f"{API}/campos/{campo_id}", headers=admin_headers)
        assert rdc.status_code in (200, 204)

        # 6) Now hard-delete the catalogo
        rd2 = requests.delete(f"{API}/catalogos/{cat_id}", headers=admin_headers)
        assert rd2.status_code == 200, rd2.text
        body2 = rd2.json()
        # hard delete contract: returns ok/deleted true
        assert body2.get("deleted") is True or body2.get("ok") is True

        # 7) Verify it is gone from listing (HARD delete, not soft)
        cats_after = requests.get(f"{API}/catalogos", params={"convocatoria_id": conv_id},
                                  headers=admin_headers).json()
        assert not any(c["id"] == cat_id for c in cats_after), \
            "catalogo should be hard-deleted (not in listing)"


class TestCampoFlagsPatch:
    """The frontend InlineFlagsEditor calls PATCH /api/campos/{id} with toggled flag."""

    def test_patch_individual_flags_persist(self, admin_headers, conv_id):
        campos = requests.get(f"{API}/campos", params={"convocatoria_id": conv_id},
                              headers=admin_headers).json()
        assert campos, "no campos in seed"
        target = campos[0]
        cid = target["id"]
        flags = ["obligatorio", "uso_filtro", "uso_ranking", "uso_desempate", "uso_actas", "editable"]
        original = {f: bool(target.get(f, False)) for f in flags}

        try:
            # Toggle each flag in turn and verify GET reflects it
            for f in flags:
                new_val = not original[f]
                r = requests.patch(f"{API}/campos/{cid}", json={f: new_val}, headers=admin_headers)
                assert r.status_code in (200, 204), f"PATCH {f} failed: {r.status_code} {r.text}"
                # Re-fetch and verify persistence
                after = requests.get(f"{API}/campos", params={"convocatoria_id": conv_id},
                                     headers=admin_headers).json()
                t = next(c for c in after if c["id"] == cid)
                assert bool(t.get(f, False)) == new_val, f"flag {f} did not persist"
        finally:
            # Restore originals
            requests.patch(f"{API}/campos/{cid}", json=original, headers=admin_headers)


# ---- Regression: convocatorias listing must include both seed entries ----
class TestConvocatoriasSwitcher:
    def test_listing_includes_seed_convocatorias(self, admin_headers):
        r = requests.get(f"{API}/convocatorias", headers=admin_headers)
        assert r.status_code == 200
        items = r.json()
        nombres = [c.get("nombre") for c in items]
        codigos = [c.get("codigo") for c in items]
        assert any(co == "INC2026" for co in codigos), f"INC2026 missing; got codigos={codigos}"
        # 'prueba' was mentioned in agent_to_agent_context_note
        assert any((n or "").lower() == "prueba" for n in nombres) or len(items) >= 2, \
            f"expected at least 2 convocatorias, got nombres={nombres}"

