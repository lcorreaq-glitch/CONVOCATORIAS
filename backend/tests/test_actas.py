"""Backend tests for Actas module (Phase A+B+C+D)."""
import os
import pytest
import requests

_b = os.environ.get('REACT_APP_BACKEND_URL')
if not _b:
    # Read from frontend/.env
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    _b = line.split('=', 1)[1].strip()
                    break
    except Exception:
        pass
BASE = (_b or '').rstrip('/')
ADMIN = {"username": "lcorreaq", "password": "Chocolate2026!"}
JURADO = {"username": "yicell.gonzalez@fodc.org.co", "password": "Jurado2026!"}
CID = "43b9b70a-eedf-4580-9f78-927a473e8b96"  # INC2026
TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def jurado_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=JURADO, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    me = s.get(f"{BASE}/api/auth/me", timeout=10).json()
    return s, me


# ---------- TEMPLATES ----------
def test_get_acta_templates(admin_h):
    r = requests.get(f"{BASE}/api/convocatorias/{CID}/acta-templates", headers=admin_h, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["is_inc2026"] is True
    assert d["uso_acta_subregional"] is True
    for tipo in ("individual", "colectiva_terna", "subregional"):
        assert tipo in d["templates"]
        for k in ("encabezado", "considerandos", "certificacion", "tabla_titulo",
                  "tabla_subtitulo", "texto_cierre", "pie_firmantes_titulo"):
            assert k in d["templates"][tipo], f"missing {k} in {tipo}"
    assert len(d["merge_tags"]) == 11


def test_patch_template_persists(admin_h):
    payload = {"tabla_titulo": "TEST CUSTOM TITULO"}
    r = requests.patch(f"{BASE}/api/convocatorias/{CID}/acta-templates/individual",
                       json=payload, headers=admin_h, timeout=15)
    assert r.status_code == 200, r.text
    r2 = requests.get(f"{BASE}/api/convocatorias/{CID}/acta-templates", headers=admin_h, timeout=15)
    tpl = r2.json()["templates"]["individual"]
    assert tpl["tabla_titulo"] == "TEST CUSTOM TITULO"
    assert tpl["_is_default"] is False
    # Restore by patching back to default
    restore = "PUNTAJES ASIGNADOS EN EL APLICATIVO"
    requests.patch(f"{BASE}/api/convocatorias/{CID}/acta-templates/individual",
                   json={"tabla_titulo": restore}, headers=admin_h, timeout=15)


def test_toggle_uso_subregional(admin_h):
    # off
    r = requests.patch(f"{BASE}/api/convocatorias/{CID}/uso-acta-subregional",
                       json={"enabled": False}, headers=admin_h, timeout=15)
    assert r.status_code == 200
    p = requests.get(f"{BASE}/api/actas-pendientes?convocatoria_id={CID}", headers=admin_h, timeout=20).json()
    assert p["uso_acta_subregional"] is False
    assert p["subregional"] == []
    # back on
    r = requests.patch(f"{BASE}/api/convocatorias/{CID}/uso-acta-subregional",
                       json={"enabled": True}, headers=admin_h, timeout=15)
    assert r.status_code == 200
    p = requests.get(f"{BASE}/api/actas-pendientes?convocatoria_id={CID}", headers=admin_h, timeout=20).json()
    assert p["uso_acta_subregional"] is True


# ---------- LISTADO PENDIENTES ----------
def test_actas_pendientes_shape(admin_h):
    r = requests.get(f"{BASE}/api/actas-pendientes?convocatoria_id={CID}", headers=admin_h, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert set(["individual", "colectiva_terna", "subregional", "uso_acta_subregional", "is_inc2026"]).issubset(d.keys())
    assert d["is_inc2026"] is True
    # validate keys when lists are non-empty
    if d["individual"]:
        ind = d["individual"][0]
        for k in ("jurado_id", "jurado_nombre", "total", "finalizadas", "estado", "tiene_firma", "porcentaje"):
            assert k in ind


# ---------- FORZAR + PDF INDIVIDUAL ----------
def test_forzar_y_pdf_individual(admin_h):
    # pick a jurado that has evaluaciones (from /actas-pendientes individual list)
    r = requests.get(f"{BASE}/api/actas-pendientes?convocatoria_id={CID}", headers=admin_h, timeout=20)
    inds = r.json()["individual"]
    if not inds:
        pytest.skip("No hay individuales con evaluaciones")
    jid = inds[0]["jurado_id"]
    fr = requests.post(f"{BASE}/api/actas/individual-jurado/{jid}/forzar", headers=admin_h, timeout=15)
    assert fr.status_code == 200, fr.text
    r2 = requests.get(f"{BASE}/api/actas-pendientes?convocatoria_id={CID}", headers=admin_h, timeout=20)
    found = next((x for x in r2.json()["individual"] if x["jurado_id"] == jid), None)
    assert found and found["forzada"] is True
    pdf = requests.get(f"{BASE}/api/actas/individual-jurado/{jid}", headers=admin_h, timeout=30)
    assert pdf.status_code == 200
    assert pdf.headers.get("content-type", "").startswith("application/pdf")
    assert pdf.content[:4] == b"%PDF"


# ---------- PDF COLECTIVA TERNA ----------
def test_pdf_colectiva_terna(admin_h):
    tr = requests.get(f"{BASE}/api/ternas?convocatoria_id={CID}", headers=admin_h, timeout=15)
    assert tr.status_code == 200
    ternas = tr.json()
    if not ternas:
        pytest.skip("No ternas")
    tid = ternas[0]["id"] if isinstance(ternas, list) else ternas.get("items", [{}])[0].get("id")
    pdf = requests.get(f"{BASE}/api/actas/colectiva-terna/{tid}", headers=admin_h, timeout=30)
    assert pdf.status_code == 200, pdf.text[:300]
    assert pdf.content[:4] == b"%PDF"


# ---------- PDF SUBREGIONAL ----------
def test_pdf_subregional(admin_h):
    pdf = requests.get(f"{BASE}/api/actas/subregional?convocatoria_id={CID}&subregion=Urabá",
                       headers=admin_h, timeout=30)
    assert pdf.status_code == 200, pdf.text[:300]
    assert pdf.content[:4] == b"%PDF"


# ---------- FIRMA JURADO ----------
def test_firma_colectiva_y_subregional(jurado_session, admin_h):
    s, me = jurado_session
    # 1) ensure firma_url is set via PATCH /jurados/me
    pr = s.patch(f"{BASE}/api/jurados/me", json={"datos": {"firma_url": TINY_PNG}}, timeout=15)
    assert pr.status_code in (200, 204), pr.text
    # 2) get jurado info (auth/me doesn't include jurado_id; fetch via /jurados/me)
    juradoinfo = s.get(f"{BASE}/api/jurados/me", timeout=10).json()
    juradoid = juradoinfo.get("id")
    assert juradoid, f"jurado not found: {juradoinfo}"
    # 3) find ternas the user belongs to
    tr = s.get(f"{BASE}/api/ternas?convocatoria_id={CID}", timeout=15).json()
    target_terna = None
    items = tr if isinstance(tr, list) else tr.get("items", [])
    for t in items:
        ints = t.get("integrantes") or []
        if any(i.get("jurado_id") == juradoid for i in ints):
            target_terna = t
            break
    if target_terna:
        fr = s.post(f"{BASE}/api/actas/colectiva-terna/{target_terna['id']}/firmar", timeout=15)
        assert fr.status_code == 200, fr.text
        assert fr.json().get("firmas_totales", 0) >= 1
    # 4) subregional firmar
    subs = juradoinfo.get("subregiones") or []
    if not subs:
        pytest.skip("jurado sin subregiones")
    sr = s.post(f"{BASE}/api/actas/subregional/firmar",
                json={"convocatoria_id": CID, "subregion": subs[0]}, timeout=15)
    assert sr.status_code == 200, sr.text
    assert sr.json().get("firmas_totales", 0) >= 1
