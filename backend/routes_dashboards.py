"""KRINOS - Motor de Dashboards inteligentes y parametrizables.

Cada dashboard es una colección de widgets. Cada widget tiene:
  - tipo: kpi | progress | bar | pie | ranking | territorial
  - data_source: identificador del agregador (computado server-side)
  - roles: lista de roles autorizados a verlo

Los dashboards se derivan de la convocatoria (campos configurados) + presets INC2026.
"""
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from collections import Counter, defaultdict
from db import get_db
from auth import get_current_user

router = APIRouter(prefix="/api", tags=["dashboards"])

# ============================================================
# CATÁLOGO de dashboards por rol (auto-derivados)
# ============================================================
def _dashboards_for_role(role: str, is_inc2026: bool, campos: list) -> List[dict]:
    """Devuelve los dashboards que el usuario verá según su rol."""
    campo_names = {c.get("nombre_interno") for c in campos}
    base = []

    # ---------- AVANCE GENERAL ----------
    if role in ("admin_general", "admin_convocatoria", "supervisor"):
        base.append({
            "id": "avance_general", "titulo": "Avance general de la convocatoria",
            "subtitulo": "Indicadores macro del proceso", "icon": "Activity",
            "widgets": [
                {"id": "kpi_total_propuestas", "tipo": "kpi", "titulo": "Propuestas registradas", "ds": "count_propuestas", "color": "verde"},
                {"id": "kpi_total_jurados", "tipo": "kpi", "titulo": "Jurados activos", "ds": "count_jurados", "color": "amber"},
                {"id": "kpi_total_ternas", "tipo": "kpi", "titulo": "Ternas conformadas", "ds": "count_ternas", "color": "azul"},
                {"id": "progress_eval_individuales", "tipo": "progress", "titulo": "Evaluaciones individuales finalizadas", "ds": "progress_eval_individuales"},
                {"id": "progress_eval_colectivas", "tipo": "progress", "titulo": "Evaluaciones colectivas cerradas", "ds": "progress_eval_colectivas"},
                {"id": "estado_propuestas", "tipo": "pie", "titulo": "Estado de propuestas", "ds": "dist_estado_propuestas"},
            ],
        })

    # ---------- AVANCE POR JURADO ----------
    if role in ("admin_general", "admin_convocatoria", "supervisor"):
        base.append({
            "id": "avance_jurado", "titulo": "Avance por jurado",
            "subtitulo": "Carga, finalización y promedio por evaluador", "icon": "Users",
            "widgets": [
                {"id": "bar_carga_jurado", "tipo": "bar", "titulo": "Carga de trabajo por jurado", "ds": "carga_jurado"},
                {"id": "ranking_jurado_avance", "tipo": "ranking", "titulo": "Top jurados por avance", "ds": "ranking_avance_jurado"},
            ],
        })

    # ---------- AVANCE POR TERNA ----------
    if role in ("admin_general", "admin_convocatoria", "supervisor", "integrante_terna"):
        base.append({
            "id": "avance_terna", "titulo": "Avance por terna",
            "subtitulo": "Estado y promedio por equipo colegiado", "icon": "UsersRound",
            "widgets": [
                {"id": "bar_carga_terna", "tipo": "bar", "titulo": "Propuestas asignadas por terna", "ds": "carga_terna"},
                {"id": "progress_terna", "tipo": "progress_multi", "titulo": "Avance de evaluación colectiva por terna", "ds": "avance_terna"},
            ],
        })

    # ---------- TERRITORIAL ----------
    if "subregion" in campo_names and role != "jurado":
        base.append({
            "id": "territorial", "titulo": "Distribución territorial",
            "subtitulo": "Propuestas y resultados por subregión / municipio", "icon": "Map",
            "widgets": [
                {"id": "bar_subregion", "tipo": "bar", "titulo": "Propuestas por subregión", "ds": "dist_subregion"},
                {"id": "bar_municipio_top", "tipo": "bar", "titulo": "Top 10 municipios", "ds": "dist_municipio_top10"},
            ],
        })

    # ---------- RANKING / RESULTADOS ----------
    if role in ("admin_general", "admin_convocatoria", "supervisor"):
        base.append({
            "id": "resultados", "titulo": "Ranking y resultados",
            "subtitulo": "Clasificación, ganadores y elegibles", "icon": "Trophy",
            "widgets": [
                {"id": "stats_puntajes", "tipo": "stats", "titulo": "Estadísticas de puntajes (etapa colectiva)", "ds": "stats_puntajes_colectiva"},
                {"id": "ranking_top10", "tipo": "ranking", "titulo": "Top 10 ranking definitivo", "ds": "ranking_top10"},
            ],
        })

    # ---------- VISTA JURADO (limitada) ----------
    if role == "jurado":
        base.append({
            "id": "mi_avance", "titulo": "Mi panel de evaluación",
            "subtitulo": "Tu carga personal y avance", "icon": "Target",
            "widgets": [
                {"id": "kpi_mis_asignadas", "tipo": "kpi", "titulo": "Mis propuestas asignadas", "ds": "mias_asignadas", "color": "verde"},
                {"id": "kpi_mis_pendientes", "tipo": "kpi", "titulo": "Pendientes", "ds": "mias_pendientes", "color": "amber"},
                {"id": "kpi_mis_terminadas", "tipo": "kpi", "titulo": "Finalizadas", "ds": "mias_finalizadas", "color": "verde"},
                {"id": "progress_mi_avance", "tipo": "progress", "titulo": "Mi avance personal", "ds": "mi_avance_personal"},
                {"id": "kpi_promedio_emitido", "tipo": "kpi", "titulo": "Promedio de puntajes emitidos", "ds": "mi_promedio_emitido", "color": "azul"},
            ],
        })

    return base


# ============================================================
# RESOLUCIÓN DE DATA SOURCES (server-side)
# ============================================================
async def _resolve_ds(db, ds: str, cid: str, user: dict) -> Any:
    """Resuelve un data source a su valor para el dashboard."""
    role = user.get("role")
    my_jurado_id = user.get("jurado_id")

    if ds == "count_propuestas":
        v = await db.propuestas.count_documents({"convocatoria_id": cid})
        return {"value": v}
    if ds == "count_jurados":
        v = await db.jurados.count_documents({"convocatoria_id": cid})
        return {"value": v}
    if ds == "count_ternas":
        v = await db.ternas.count_documents({"convocatoria_id": cid})
        return {"value": v}

    if ds == "progress_eval_individuales":
        evs = await db.evaluaciones_individuales.find({"convocatoria_id": cid}, {"_id": 0, "estado": 1}).to_list(5000)
        total = len(evs)
        done = sum(1 for e in evs if e.get("estado") in ("Finalizada", "Firmada"))
        return {"total": total, "done": done, "pct": round((done / total) * 100) if total else 0}
    if ds == "progress_eval_colectivas":
        evs = await db.evaluaciones_colectivas.find({"convocatoria_id": cid}, {"_id": 0, "estado": 1}).to_list(2000)
        total = len(evs)
        done = sum(1 for e in evs if e.get("estado") in ("Cerrada", "Firmada"))
        return {"total": total, "done": done, "pct": round((done / total) * 100) if total else 0}

    if ds == "dist_estado_propuestas":
        props = await db.propuestas.find({"convocatoria_id": cid}, {"_id": 0, "estado": 1}).to_list(5000)
        c = Counter(p.get("estado", "Sin estado") for p in props)
        return {"items": [{"name": k, "value": v} for k, v in c.most_common()]}

    if ds == "carga_jurado":
        jurados = await db.jurados.find({"convocatoria_id": cid}, {"_id": 0, "id": 1, "nombre": 1}).to_list(500)
        evs = await db.evaluaciones_individuales.find({"convocatoria_id": cid}, {"_id": 0, "jurado_id": 1, "estado": 1}).to_list(5000)
        by_jur = defaultdict(lambda: {"total": 0, "done": 0})
        for e in evs:
            by_jur[e["jurado_id"]]["total"] += 1
            if e.get("estado") in ("Finalizada", "Firmada"):
                by_jur[e["jurado_id"]]["done"] += 1
        items = []
        for j in jurados:
            stat = by_jur.get(j["id"], {"total": 0, "done": 0})
            if stat["total"] > 0:
                items.append({"name": j["nombre"][:22], "total": stat["total"], "done": stat["done"], "pending": stat["total"] - stat["done"]})
        items.sort(key=lambda x: -x["total"])
        return {"items": items[:15]}

    if ds == "ranking_avance_jurado":
        jurados = await db.jurados.find({"convocatoria_id": cid}, {"_id": 0, "id": 1, "nombre": 1}).to_list(500)
        evs = await db.evaluaciones_individuales.find({"convocatoria_id": cid}, {"_id": 0, "jurado_id": 1, "estado": 1}).to_list(5000)
        by_jur = defaultdict(lambda: {"total": 0, "done": 0})
        for e in evs:
            by_jur[e["jurado_id"]]["total"] += 1
            if e.get("estado") in ("Finalizada", "Firmada"):
                by_jur[e["jurado_id"]]["done"] += 1
        items = []
        for j in jurados:
            s = by_jur.get(j["id"], {"total": 0, "done": 0})
            if s["total"]:
                items.append({"nombre": j["nombre"], "pct": round((s["done"] / s["total"]) * 100), "done": s["done"], "total": s["total"]})
        items.sort(key=lambda x: -x["pct"])
        return {"items": items[:10]}

    if ds == "carga_terna":
        ternas = await db.ternas.find({"convocatoria_id": cid}, {"_id": 0, "id": 1, "codigo": 1, "nombre": 1}).to_list(200)
        asigs = await db.asignaciones_colectivas.find({"convocatoria_id": cid}, {"_id": 0, "terna_id": 1}).to_list(2000) if "asignaciones_colectivas" in (await db.list_collection_names()) else []
        c = Counter(a["terna_id"] for a in asigs)
        items = [{"name": f"{t['codigo']} {t.get('nombre','')[:18]}", "total": c.get(t["id"], 0)} for t in ternas]
        items.sort(key=lambda x: -x["total"])
        return {"items": items}

    if ds == "avance_terna":
        ternas = await db.ternas.find({"convocatoria_id": cid}, {"_id": 0, "id": 1, "codigo": 1}).to_list(200)
        evs = await db.evaluaciones_colectivas.find({"convocatoria_id": cid}, {"_id": 0, "terna_id": 1, "estado": 1}).to_list(2000)
        by_t = defaultdict(lambda: {"total": 0, "done": 0})
        for e in evs:
            by_t[e["terna_id"]]["total"] += 1
            if e.get("estado") in ("Cerrada", "Firmada"):
                by_t[e["terna_id"]]["done"] += 1
        items = []
        for t in ternas:
            s = by_t.get(t["id"], {"total": 0, "done": 0})
            items.append({"name": t["codigo"], "total": s["total"], "done": s["done"], "pct": round((s["done"] / s["total"]) * 100) if s["total"] else 0})
        return {"items": items}

    if ds == "dist_subregion":
        props = await db.propuestas.find({"convocatoria_id": cid}, {"_id": 0, "datos": 1, "subregion": 1}).to_list(5000)
        c = Counter((p.get("subregion") or (p.get("datos") or {}).get("subregion") or "Sin subregión") for p in props)
        return {"items": [{"name": k, "value": v} for k, v in c.most_common()]}

    if ds == "dist_municipio_top10":
        props = await db.propuestas.find({"convocatoria_id": cid}, {"_id": 0, "datos": 1}).to_list(5000)
        c = Counter(((p.get("datos") or {}).get("municipio") or "—") for p in props)
        return {"items": [{"name": k, "value": v} for k, v in c.most_common(10)]}

    if ds == "stats_puntajes_colectiva":
        evs = await db.evaluaciones_colectivas.find({"convocatoria_id": cid, "puntaje_final": {"$ne": None}}, {"_id": 0, "puntaje_final": 1}).to_list(2000)
        vals = [e["puntaje_final"] for e in evs if isinstance(e.get("puntaje_final"), (int, float))]
        if not vals:
            return {"promedio": 0, "min": 0, "max": 0, "n": 0}
        prom = sum(vals) / len(vals)
        return {"promedio": round(prom, 1), "min": min(vals), "max": max(vals), "n": len(vals)}

    if ds == "ranking_top10":
        rankings = await db.rankings.find({"convocatoria_id": cid}, {"_id": 0}).sort("fecha_generacion", -1).to_list(1)
        if not rankings:
            return {"items": []}
        rk = rankings[0]
        items = []
        for g in rk.get("grupos", []):
            for it in g.get("items", []):
                items.append({"codigo": it.get("codigo"), "nombre": it.get("nombre"), "puntaje": it.get("puntaje_total"), "grupo": g.get("grupo")})
        items.sort(key=lambda x: -(x["puntaje"] or 0))
        return {"items": items[:10]}

    # ---- JURADO (vista personal) ----
    if ds in ("mias_asignadas", "mias_pendientes", "mias_finalizadas", "mi_avance_personal", "mi_promedio_emitido"):
        if not my_jurado_id:
            return {"value": 0}
        evs = await db.evaluaciones_individuales.find({"convocatoria_id": cid, "jurado_id": my_jurado_id}, {"_id": 0}).to_list(500)
        total = len(evs)
        done = sum(1 for e in evs if e.get("estado") in ("Finalizada", "Firmada"))
        pend = total - done
        if ds == "mias_asignadas": return {"value": total}
        if ds == "mias_pendientes": return {"value": pend}
        if ds == "mias_finalizadas": return {"value": done}
        if ds == "mi_avance_personal": return {"total": total, "done": done, "pct": round((done / total) * 100) if total else 0}
        if ds == "mi_promedio_emitido":
            vals = [e.get("puntaje_total", 0) for e in evs if e.get("estado") in ("Finalizada", "Firmada") and e.get("puntaje_total") is not None]
            return {"value": round(sum(vals) / len(vals), 1) if vals else 0}

    return {"error": f"Data source '{ds}' no implementado"}


# ============================================================
# ENDPOINT PRINCIPAL
# ============================================================
@router.get("/dashboards")
async def get_dashboards(convocatoria_id: str, user: dict = Depends(get_current_user)):
    """Devuelve la lista de dashboards visibles para el usuario actual, con todos los widgets ya resueltos."""
    db = get_db()
    conv = await db.convocatorias.find_one({"id": convocatoria_id}, {"_id": 0})
    if not conv:
        raise HTTPException(404, "Convocatoria no encontrada")
    is_inc2026 = (conv.get("codigo", "").upper() == "INC2026")
    campos = await db.campos.find({"convocatoria_id": convocatoria_id, "aplica_a": "propuesta"}, {"_id": 0}).to_list(200)

    dashboards = _dashboards_for_role(user.get("role"), is_inc2026, campos)

    # Resolver cada widget
    for dash in dashboards:
        for w in dash["widgets"]:
            try:
                w["data"] = await _resolve_ds(db, w["ds"], convocatoria_id, user)
            except Exception as e:
                w["data"] = {"error": str(e)}

    return {
        "convocatoria": {"id": conv["id"], "codigo": conv.get("codigo"), "nombre": conv.get("nombre")},
        "role": user.get("role"),
        "dashboards": dashboards,
    }
