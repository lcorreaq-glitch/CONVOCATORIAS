"""Smoke regression for iteration 5: clonar/export/import + resumen endpoints."""
import os
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"username": "lcorreaq", "password": "Chocolate2026!"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def convs(headers):
    r = requests.get(f"{BASE}/api/convocatorias", headers=headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 2, f"Need at least 2 convocatorias for clonar test, got {len(data)}"
    return data


def test_resumen(headers, convs):
    for c in convs:
        r = requests.get(f"{BASE}/api/convocatorias/{c['id']}/configuracion/resumen", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "counts" in body
        for k in ("campos", "catalogos", "criterios", "desempates"):
            assert k in body["counts"]


def test_export(headers, convs):
    src = convs[0]
    r = requests.get(f"{BASE}/api/convocatorias/{src['id']}/configuracion/export", headers=headers, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body.get("krinos_export_version") == 1
    assert "campos" in body and "catalogos" in body and "criterios" in body and "desempates" in body


def test_clonar_agregar(headers, convs):
    # Find a non-empty source and a target
    src = None
    target = None
    for c in convs:
        rr = requests.get(f"{BASE}/api/convocatorias/{c['id']}/configuracion/resumen", headers=headers, timeout=30)
        counts = rr.json()["counts"]
        total = sum(counts.values())
        if total > 0 and src is None:
            src = c
        elif src is not None and c["id"] != src["id"]:
            target = c
            break
    assert src is not None and target is not None, "Need one non-empty and one other convocatoria"

    payload = {
        "source_convocatoria_id": src["id"],
        "modo": "agregar",
        "incluir_campos": True,
        "incluir_catalogos": True,
        "incluir_criterios": True,
        "incluir_desempates": True,
    }
    r = requests.post(f"{BASE}/api/convocatorias/{target['id']}/configuracion/clonar", json=payload, headers=headers, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "resultado" in body
    for k in ("campos", "catalogos", "criterios", "desempates"):
        assert k in body["resultado"]
    assert "origen" in body and "destino" in body


def test_import_validates_payload(headers, convs):
    # Export from one then import to it (no-op clone via JSON)
    src = convs[0]
    e = requests.get(f"{BASE}/api/convocatorias/{src['id']}/configuracion/export", headers=headers, timeout=30)
    data = e.json()
    payload = {
        "data": data,
        "modo": "agregar",
        "incluir_campos": True,
        "incluir_catalogos": True,
        "incluir_criterios": True,
        "incluir_desempates": True,
    }
    r = requests.post(f"{BASE}/api/convocatorias/{src['id']}/configuracion/import", json=payload, headers=headers, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "resultado" in body
