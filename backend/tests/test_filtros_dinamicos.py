"""Iter 9 - Tests for dynamic filters on /api/propuestas (filtros JSON param).

Scope:
- Backend accepts query param `filtros` as JSON dict and applies to datos.<key>
- __all__ / empty values ignored
- arrays use $in operator
- single value uses equality
- combined filters use AND
"""
import os
import json
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

ADMIN_USER = "lcorreaq"
ADMIN_PASS = "Chocolate2026!"
CONV_CODE = "INC2026"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def conv_id(headers):
    r = requests.get(f"{BASE_URL}/api/convocatorias", headers=headers, timeout=15)
    assert r.status_code == 200
    inc = [c for c in r.json() if c.get("codigo") == CONV_CODE]
    assert inc, f"INC2026 not found. Available: {[c.get('codigo') for c in r.json()]}"
    return inc[0]["id"]


# Helper to call list_propuestas with filtros JSON
def _list_props(headers, conv_id, filtros=None, extra_params=None):
    params = {"convocatoria_id": conv_id}
    if filtros is not None:
        params["filtros"] = json.dumps(filtros)
    if extra_params:
        params.update(extra_params)
    r = requests.get(f"{BASE_URL}/api/propuestas", headers=headers, params=params, timeout=15)
    return r


# ==================== Tests ====================
class TestFiltrosBackend:
    def test_baseline_no_filters(self, headers, conv_id):
        r = _list_props(headers, conv_id)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) > 0, "INC2026 should have propuestas seeded"
        # ensure no _id leaks
        assert all("_id" not in p for p in items)

    def test_filtro_subregion_oriente_only_returns_oriente(self, headers, conv_id):
        # NOTE: main agent claimed 4 Oriente propuestas but seed data has 3 (P-0004,P-0005,P-0006).
        # The filter itself works correctly - asserting subset behavior only.
        baseline = _list_props(headers, conv_id).json()
        r = _list_props(headers, conv_id, filtros={"subregion": "Oriente"})
        assert r.status_code == 200
        items = r.json()
        assert len(items) > 0, "expected at least one Oriente propuesta"
        assert len(items) < len(baseline), "filter must reduce result set"
        for p in items:
            assert p["datos"]["subregion"] == "Oriente"

    def test_filtro_combinado_uraba_jac_returns_1_P0001(self, headers, conv_id):
        r = _list_props(headers, conv_id, filtros={
            "subregion": "Urabá",
            "tipo_organizacion": "Junta de Acción Comunal"
        })
        assert r.status_code == 200
        items = r.json()
        assert len(items) == 1, f"expected 1, got {len(items)}: {[p['codigo'] for p in items]}"
        assert items[0]["codigo"] == "P-0001"
        assert items[0]["datos"]["subregion"] == "Urabá"
        assert items[0]["datos"]["tipo_organizacion"] == "Junta de Acción Comunal"

    def test_filtro_all_sentinel_ignored(self, headers, conv_id):
        # baseline length
        base = _list_props(headers, conv_id).json()
        r = _list_props(headers, conv_id, filtros={"subregion": "__all__"})
        assert r.status_code == 200
        assert len(r.json()) == len(base), "__all__ should be ignored"

    def test_filtro_empty_string_ignored(self, headers, conv_id):
        base = _list_props(headers, conv_id).json()
        r = _list_props(headers, conv_id, filtros={"subregion": ""})
        assert r.status_code == 200
        assert len(r.json()) == len(base), "empty string should be ignored"

    def test_filtro_array_uses_in_operator(self, headers, conv_id):
        # Use array to match multiple subregions via $in
        r_or = _list_props(headers, conv_id, filtros={"subregion": ["Oriente"]})
        r_single = _list_props(headers, conv_id, filtros={"subregion": "Oriente"})
        assert r_or.status_code == 200 and r_single.status_code == 200
        assert len(r_or.json()) == len(r_single.json()), "array of 1 must match single value"

        # array with multiple values must return union
        items_multi = _list_props(headers, conv_id, filtros={"subregion": ["Oriente", "Urabá"]}).json()
        items_or = _list_props(headers, conv_id, filtros={"subregion": "Oriente"}).json()
        items_ur = _list_props(headers, conv_id, filtros={"subregion": "Urabá"}).json()
        assert len(items_multi) == len(items_or) + len(items_ur)

    def test_filtro_invalid_json_does_not_break(self, headers, conv_id):
        # Send malformed json string - should not error (silently ignored)
        r = requests.get(f"{BASE_URL}/api/propuestas", headers=headers,
                         params={"convocatoria_id": conv_id, "filtros": "{not-json}"}, timeout=15)
        assert r.status_code == 200, f"got {r.status_code} {r.text}"
        assert len(r.json()) > 0

    def test_filtro_combined_with_estado_search(self, headers, conv_id):
        # combine new filtros param with the legacy `estado` / `search` query params
        r = requests.get(f"{BASE_URL}/api/propuestas", headers=headers,
                         params={"convocatoria_id": conv_id,
                                 "filtros": json.dumps({"subregion": "Oriente"})},
                         timeout=15)
        assert r.status_code == 200
        # baseline 4 Oriente; estado filter applied on top should be <= 4
        oriente = r.json()
        r2 = requests.get(f"{BASE_URL}/api/propuestas", headers=headers,
                          params={"convocatoria_id": conv_id,
                                  "filtros": json.dumps({"subregion": "Oriente"}),
                                  "estado": "Registrada"},
                          timeout=15)
        assert r2.status_code == 200
        for p in r2.json():
            assert p["estado"] == "Registrada"
            assert p["datos"]["subregion"] == "Oriente"
        assert len(r2.json()) <= len(oriente)


class TestCamposFiltroFlag:
    def test_inc2026_has_8_filtro_campos(self, headers, conv_id):
        r = requests.get(f"{BASE_URL}/api/campos", headers=headers,
                         params={"convocatoria_id": conv_id}, timeout=15)
        assert r.status_code == 200
        campos = r.json()
        filtro_campos = [c for c in campos if c.get("uso_filtro")]
        nombres = sorted([c["nombre_interno"] for c in filtro_campos])
        expected = sorted(["subregion", "municipio", "tipo_organizacion",
                           "enfoque_poblacional", "linea", "tematica",
                           "ganador_2024", "ganador_2025"])
        assert nombres == expected, f"got {nombres} expected {expected}"
