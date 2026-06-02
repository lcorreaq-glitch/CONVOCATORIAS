"""KRINOS - Motor de Dashboards inteligentes y parametrizables.

Fases:
  1) Motor base + RBAC + 5 dashboards derivados automáticamente.
  2) Comparativos, time series, dashboards de línea / priorización poblacional.
  3) Editor sin código: overrides en `convocatoria.configuracion.dashboards_overrides`.
  4) Auto-sugerencias inteligentes basadas en `campos`.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Body
from collections import Counter, defaultdict

from db import get_db, now_iso
from auth import get_current_user, require_roles, audit

router = APIRouter(prefix="/api", tags=["dashboards"])

# ============================================================
# CATÁLOGO auto-derivado de dashboards por rol
# ============================================================
def _dashboards_for_role(role: str, is_inc2026: bool, campos: list) -> List[dict]:
    campo_names = {c.get("nombre_interno") for c in campos}
    base = []

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
                {"id": "ts_eval_diario", "tipo": "time_series", "titulo": "Evaluaciones finalizadas (últimos 14 días)", "ds": "time_series_evaluaciones"},
            ],
        })
        base.append({
            "id": "avance_jurado", "titulo": "Avance por jurado",
            "subtitulo": "Carga, finalización y promedio por evaluador", "icon": "Users",
            "widgets": [
                {"id": "bar_carga_jurado", "tipo": "bar", "titulo": "Carga de trabajo por jurado", "ds": "carga_jurado"},
                {"id": "ranking_jurado_avance", "tipo": "ranking", "titulo": "Top jurados por avance", "ds": "ranking_avance_jurado"},
                {"id": "comparativo_jurados", "tipo": "comparativo", "titulo": "Comparativo de promedios (jurados vs jurados)", "ds": "comparativo_jurados"},
            ],
        })
        base.append({
            "id": "avance_terna", "titulo": "Avance por terna",
            "subtitulo": "Estado y carga por equipo colegiado", "icon": "UsersRound",
            "widgets": [
                {"id": "bar_carga_terna", "tipo": "bar", "titulo": "Propuestas asignadas por terna", "ds": "carga_terna"},
                {"id": "progress_terna", "tipo": "progress_multi", "titulo": "Avance de evaluación colectiva por terna", "ds": "avance_terna"},
                {"id": "comparativo_ternas", "tipo": "comparativo", "titulo": "Comparativo de promedios (ternas vs ternas)", "ds": "comparativo_ternas"},
            ],
        })

    if "subregion" in campo_names and role != "jurado":
        base.append({
            "id": "territorial", "titulo": "Distribución territorial",
            "subtitulo": "Propuestas y resultados por subregión / municipio", "icon": "Map",
            "widgets": [
                {"id": "bar_subregion", "tipo": "bar", "titulo": "Propuestas por subregión", "ds": "dist_subregion"},
                {"id": "bar_municipio_top", "tipo": "bar", "titulo": "Top 10 municipios", "ds": "dist_municipio_top10"},
                {"id": "comparativo_subregiones", "tipo": "comparativo", "titulo": "Promedio de puntajes por subregión", "ds": "comparativo_subregiones"},
            ],
        })

    if ("linea" in campo_names or "tematica" in campo_names) and role != "jurado":
        base.append({
            "id": "linea", "titulo": "Resultados por línea / temática",
            "subtitulo": "Distribución de propuestas y ganadores por categoría", "icon": "Layers",
            "widgets": [
                {"id": "dist_linea", "tipo": "pie", "titulo": "Propuestas por línea", "ds": "dist_linea"},
                {"id": "rank_por_linea", "tipo": "ranking", "titulo": "Top ganadores por línea", "ds": "ranking_por_linea"},
            ],
        })

    # Priorización poblacional (INC2026 / cualquier convocatoria con campos relevantes)
    if any(k in campo_names for k in ("mujeres", "discapacidad", "etnico", "victimas", "enfoque_poblacional")) and role != "jurado":
        base.append({
            "id": "priorizacion", "titulo": "Indicadores de priorización poblacional",
            "subtitulo": "Enfoques diferenciales para desempate", "icon": "Heart",
            "widgets": [
                {"id": "dist_priorizacion", "tipo": "bar", "titulo": "Propuestas con enfoque diferencial", "ds": "dist_priorizacion"},
            ],
        })

    if role in ("admin_general", "admin_convocatoria", "supervisor"):
        base.append({
            "id": "resultados", "titulo": "Ranking y resultados",
            "subtitulo": "Clasificación, ganadores y elegibles", "icon": "Trophy",
            "widgets": [
                {"id": "stats_puntajes", "tipo": "stats", "titulo": "Estadísticas de puntajes (colectiva)", "ds": "stats_puntajes_colectiva"},
                {"id": "ranking_top10", "tipo": "ranking", "titulo": "Top 10 ranking definitivo", "ds": "ranking_top10"},
                {"id": "kpi_ganadores", "tipo": "kpi", "titulo": "Ganadores", "ds": "kpi_ganadores", "color": "verde"},
                {"id": "kpi_elegibles", "tipo": "kpi", "titulo": "Elegibles", "ds": "kpi_elegibles", "color": "azul"},
                {"id": "kpi_lista_espera", "tipo": "kpi", "titulo": "Lista de espera", "ds": "kpi_lista_espera", "color": "amber"},
            ],
        })

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
# DATA SOURCES disponibles (catálogo expuesto al editor)
# ============================================================
DATA_SOURCE_CATALOG = [
    {"id": "count_propuestas", "label": "Total de propuestas", "returns": "kpi"},
    {"id": "count_jurados", "label": "Total de jurados", "returns": "kpi"},
    {"id": "count_ternas", "label": "Total de ternas", "returns": "kpi"},
    {"id": "progress_eval_individuales", "label": "% evaluaciones individuales finalizadas", "returns": "progress"},
    {"id": "progress_eval_colectivas", "label": "% evaluaciones colectivas cerradas", "returns": "progress"},
    {"id": "dist_estado_propuestas", "label": "Distribución por estado de propuesta", "returns": "pie"},
    {"id": "carga_jurado", "label": "Carga de trabajo por jurado", "returns": "bar"},
    {"id": "ranking_avance_jurado", "label": "Top jurados por avance", "returns": "ranking"},
    {"id": "comparativo_jurados", "label": "Comparativo promedio por jurado", "returns": "comparativo"},
    {"id": "carga_terna", "label": "Carga por terna", "returns": "bar"},
    {"id": "avance_terna", "label": "Avance colectivo por terna", "returns": "progress_multi"},
    {"id": "comparativo_ternas", "label": "Comparativo promedio por terna", "returns": "comparativo"},
    {"id": "dist_subregion", "label": "Propuestas por subregión", "returns": "bar"},
    {"id": "dist_municipio_top10", "label": "Top 10 municipios", "returns": "bar"},
    {"id": "comparativo_subregiones", "label": "Promedio por subregión", "returns": "comparativo"},
    {"id": "dist_linea", "label": "Propuestas por línea", "returns": "pie"},
    {"id": "ranking_por_linea", "label": "Ganadores por línea", "returns": "ranking"},
    {"id": "dist_priorizacion", "label": "Propuestas con enfoque diferencial", "returns": "bar"},
    {"id": "stats_puntajes_colectiva", "label": "Estadísticas puntajes colectiva", "returns": "stats"},
    {"id": "ranking_top10", "label": "Top 10 ranking definitivo", "returns": "ranking"},
    {"id": "kpi_ganadores", "label": "Cantidad de ganadores", "returns": "kpi"},
    {"id": "kpi_elegibles", "label": "Cantidad de elegibles", "returns": "kpi"},
    {"id": "kpi_lista_espera", "label": "Lista de espera", "returns": "kpi"},
    {"id": "time_series_evaluaciones", "label": "Evaluaciones finalizadas por día", "returns": "time_series"},
]

WIDGET_TYPES = ["kpi", "progress", "pie", "bar", "ranking", "stats", "progress_multi", "comparativo", "time_series"]


# ============================================================
# RESOLVER de data sources
# ============================================================
async def _resolve_ds(db, ds: str, cid: str, user: dict) -> Any:
    role = user.get("role")
    my_jurado_id = user.get("jurado_id")

    if ds == "count_propuestas":
        return {"value": await db.propuestas.count_documents({"convocatoria_id": cid})}
    if ds == "count_jurados":
        return {"value": await db.jurados.count_documents({"convocatoria_id": cid})}
    if ds == "count_ternas":
        return {"value": await db.ternas.count_documents({"convocatoria_id": cid})}

    if ds == "progress_eval_individuales":
        evs = await db.evaluaciones_individuales.find({"convocatoria_id": cid}, {"_id": 0, "estado": 1}).to_list(5000)
        total = len(evs); done = sum(1 for e in evs if e.get("estado") in ("Finalizada", "Firmada"))
        return {"total": total, "done": done, "pct": round((done / total) * 100) if total else 0}
    if ds == "progress_eval_colectivas":
        evs = await db.evaluaciones_colectivas.find({"convocatoria_id": cid}, {"_id": 0, "estado": 1}).to_list(2000)
        total = len(evs); done = sum(1 for e in evs if e.get("estado") in ("Cerrada", "Firmada"))
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
            if e.get("estado") in ("Finalizada", "Firmada"): by_jur[e["jurado_id"]]["done"] += 1
        items = []
        for j in jurados:
            s = by_jur.get(j["id"], {"total": 0, "done": 0})
            if s["total"]:
                items.append({"name": j["nombre"][:22], "total": s["total"], "done": s["done"], "pending": s["total"] - s["done"]})
        items.sort(key=lambda x: -x["total"])
        return {"items": items[:15]}

    if ds == "ranking_avance_jurado":
        jurados = await db.jurados.find({"convocatoria_id": cid}, {"_id": 0, "id": 1, "nombre": 1}).to_list(500)
        evs = await db.evaluaciones_individuales.find({"convocatoria_id": cid}, {"_id": 0, "jurado_id": 1, "estado": 1}).to_list(5000)
        by_jur = defaultdict(lambda: {"total": 0, "done": 0})
        for e in evs:
            by_jur[e["jurado_id"]]["total"] += 1
            if e.get("estado") in ("Finalizada", "Firmada"): by_jur[e["jurado_id"]]["done"] += 1
        items = []
        for j in jurados:
            s = by_jur.get(j["id"], {"total": 0, "done": 0})
            if s["total"]: items.append({"nombre": j["nombre"], "pct": round((s["done"] / s["total"]) * 100), "done": s["done"], "total": s["total"]})
        items.sort(key=lambda x: -x["pct"])
        return {"items": items[:10]}

    if ds == "comparativo_jurados":
        jurados = await db.jurados.find({"convocatoria_id": cid}, {"_id": 0, "id": 1, "nombre": 1}).to_list(500)
        evs = await db.evaluaciones_individuales.find(
            {"convocatoria_id": cid, "estado": {"$in": ["Finalizada", "Firmada"]}, "puntaje_total": {"$ne": None}},
            {"_id": 0, "jurado_id": 1, "puntaje_total": 1}).to_list(5000)
        by_jur = defaultdict(list)
        for e in evs:
            if isinstance(e.get("puntaje_total"), (int, float)):
                by_jur[e["jurado_id"]].append(e["puntaje_total"])
        items = []
        for j in jurados:
            vals = by_jur.get(j["id"], [])
            if vals: items.append({"name": j["nombre"][:24], "promedio": round(sum(vals) / len(vals), 1), "n": len(vals)})
        items.sort(key=lambda x: -x["promedio"])
        return {"items": items[:15]}

    if ds == "carga_terna":
        ternas = await db.ternas.find({"convocatoria_id": cid}, {"_id": 0, "id": 1, "codigo": 1, "nombre": 1}).to_list(200)
        collections = await db.list_collection_names()
        asigs = []
        if "asignaciones_colectivas" in collections:
            asigs = await db.asignaciones_colectivas.find({"convocatoria_id": cid}, {"_id": 0, "terna_id": 1}).to_list(2000)
        c = Counter(a["terna_id"] for a in asigs)
        items = [{"name": f"{t['codigo']} {(t.get('nombre') or '')[:18]}", "total": c.get(t["id"], 0)} for t in ternas]
        items.sort(key=lambda x: -x["total"])
        return {"items": items}

    if ds == "avance_terna":
        ternas = await db.ternas.find({"convocatoria_id": cid}, {"_id": 0, "id": 1, "codigo": 1}).to_list(200)
        evs = await db.evaluaciones_colectivas.find({"convocatoria_id": cid}, {"_id": 0, "terna_id": 1, "estado": 1}).to_list(2000)
        by_t = defaultdict(lambda: {"total": 0, "done": 0})
        for e in evs:
            by_t[e["terna_id"]]["total"] += 1
            if e.get("estado") in ("Cerrada", "Firmada"): by_t[e["terna_id"]]["done"] += 1
        items = []
        for t in ternas:
            s = by_t.get(t["id"], {"total": 0, "done": 0})
            items.append({"name": t["codigo"], "total": s["total"], "done": s["done"], "pct": round((s["done"] / s["total"]) * 100) if s["total"] else 0})
        return {"items": items}

    if ds == "comparativo_ternas":
        ternas = await db.ternas.find({"convocatoria_id": cid}, {"_id": 0, "id": 1, "codigo": 1}).to_list(200)
        evs = await db.evaluaciones_colectivas.find({"convocatoria_id": cid, "puntaje_final": {"$ne": None}}, {"_id": 0, "terna_id": 1, "puntaje_final": 1}).to_list(2000)
        by_t = defaultdict(list)
        for e in evs:
            if isinstance(e.get("puntaje_final"), (int, float)): by_t[e["terna_id"]].append(e["puntaje_final"])
        items = []
        for t in ternas:
            vals = by_t.get(t["id"], [])
            if vals: items.append({"name": t["codigo"], "promedio": round(sum(vals) / len(vals), 1), "n": len(vals)})
        items.sort(key=lambda x: -x["promedio"])
        return {"items": items}

    if ds == "dist_subregion":
        props = await db.propuestas.find({"convocatoria_id": cid}, {"_id": 0, "datos": 1, "subregion": 1}).to_list(5000)
        c = Counter((p.get("subregion") or (p.get("datos") or {}).get("subregion") or "Sin subregión") for p in props)
        return {"items": [{"name": k, "value": v} for k, v in c.most_common()]}
    if ds == "dist_municipio_top10":
        props = await db.propuestas.find({"convocatoria_id": cid}, {"_id": 0, "datos": 1}).to_list(5000)
        c = Counter(((p.get("datos") or {}).get("municipio") or "—") for p in props)
        return {"items": [{"name": k, "value": v} for k, v in c.most_common(10)]}
    if ds == "comparativo_subregiones":
        props = await db.propuestas.find({"convocatoria_id": cid}, {"_id": 0, "id": 1, "datos": 1, "subregion": 1}).to_list(5000)
        sub_de_prop = {p["id"]: (p.get("subregion") or (p.get("datos") or {}).get("subregion") or "Sin subregión") for p in props}
        evs = await db.evaluaciones_colectivas.find({"convocatoria_id": cid, "puntaje_final": {"$ne": None}}, {"_id": 0, "propuesta_id": 1, "puntaje_final": 1}).to_list(2000)
        by_sub = defaultdict(list)
        for e in evs:
            sub = sub_de_prop.get(e["propuesta_id"])
            if sub and isinstance(e.get("puntaje_final"), (int, float)): by_sub[sub].append(e["puntaje_final"])
        items = [{"name": k, "promedio": round(sum(v) / len(v), 1), "n": len(v)} for k, v in by_sub.items()]
        items.sort(key=lambda x: -x["promedio"])
        return {"items": items}

    if ds == "dist_linea":
        props = await db.propuestas.find({"convocatoria_id": cid}, {"_id": 0, "datos": 1}).to_list(5000)
        c = Counter(((p.get("datos") or {}).get("linea") or (p.get("datos") or {}).get("tematica") or "Sin línea") for p in props)
        return {"items": [{"name": k, "value": v} for k, v in c.most_common()]}
    if ds == "ranking_por_linea":
        rk = await db.rankings.find({"convocatoria_id": cid}, {"_id": 0}).sort("fecha_generacion", -1).to_list(1)
        if not rk: return {"items": []}
        # Top1 por grupo (asumiendo grupos por línea o subregión)
        items = []
        for g in rk[0].get("grupos", []):
            top = (g.get("items") or [])[:1]
            for t in top:
                items.append({"codigo": t.get("codigo"), "nombre": f"{t.get('nombre','')} ({g.get('grupo')})", "puntaje": t.get("puntaje_total")})
        return {"items": items[:10]}

    if ds == "dist_priorizacion":
        props = await db.propuestas.find({"convocatoria_id": cid}, {"_id": 0, "datos": 1}).to_list(5000)
        enfoques = {"Mujeres": 0, "Discapacidad": 0, "Étnico": 0, "Víctimas": 0, "PDET": 0}
        for p in props:
            d = p.get("datos") or {}
            if d.get("mujeres") or "mujer" in str(d.get("enfoque_poblacional", "")).lower(): enfoques["Mujeres"] += 1
            if d.get("discapacidad") or "discapacidad" in str(d.get("enfoque_poblacional", "")).lower(): enfoques["Discapacidad"] += 1
            if d.get("etnico") or "etn" in str(d.get("enfoque_poblacional", "")).lower(): enfoques["Étnico"] += 1
            if d.get("victimas") or "victima" in str(d.get("enfoque_poblacional", "")).lower(): enfoques["Víctimas"] += 1
            if d.get("pdet") or "pdet" in str(d.get("priorizacion_territorial", "")).lower(): enfoques["PDET"] += 1
        return {"items": [{"name": k, "value": v} for k, v in enfoques.items() if v > 0] or [{"name": "Sin datos", "value": 0}]}

    if ds == "stats_puntajes_colectiva":
        evs = await db.evaluaciones_colectivas.find({"convocatoria_id": cid, "puntaje_final": {"$ne": None}}, {"_id": 0, "puntaje_final": 1}).to_list(2000)
        vals = [e["puntaje_final"] for e in evs if isinstance(e.get("puntaje_final"), (int, float))]
        if not vals: return {"promedio": 0, "min": 0, "max": 0, "n": 0}
        return {"promedio": round(sum(vals) / len(vals), 1), "min": min(vals), "max": max(vals), "n": len(vals)}

    if ds == "ranking_top10":
        rk = await db.rankings.find({"convocatoria_id": cid}, {"_id": 0}).sort("fecha_generacion", -1).to_list(1)
        if not rk: return {"items": []}
        items = []
        for g in rk[0].get("grupos", []):
            for it in g.get("items", []):
                items.append({"codigo": it.get("codigo"), "nombre": it.get("nombre"), "puntaje": it.get("puntaje_total"), "grupo": g.get("grupo")})
        items.sort(key=lambda x: -(x["puntaje"] or 0))
        return {"items": items[:10]}

    if ds in ("kpi_ganadores", "kpi_elegibles", "kpi_lista_espera"):
        rk = await db.rankings.find({"convocatoria_id": cid}, {"_id": 0}).sort("fecha_generacion", -1).to_list(1)
        if not rk: return {"value": 0}
        # heurística: ganadores = los marcados con resultado=ganador, elegibles = elegible, espera = lista_espera
        all_items = []
        for g in rk[0].get("grupos", []): all_items.extend(g.get("items", []))
        key = {"kpi_ganadores": "ganador", "kpi_elegibles": "elegible", "kpi_lista_espera": "lista_espera"}[ds]
        v = sum(1 for it in all_items if (it.get("resultado") or "").lower() == key)
        if v == 0 and ds == "kpi_ganadores":
            # fallback: primer puesto por grupo
            v = sum(1 for g in rk[0].get("grupos", []) for it in (g.get("items") or [])[:1])
        return {"value": v}

    if ds == "time_series_evaluaciones":
        cutoff = datetime.utcnow() - timedelta(days=14)
        evs = await db.evaluaciones_individuales.find({
            "convocatoria_id": cid, "estado": {"$in": ["Finalizada", "Firmada"]},
            "fecha_finalizacion": {"$gte": cutoff.isoformat()},
        }, {"_id": 0, "fecha_finalizacion": 1}).to_list(5000)
        by_day = defaultdict(int)
        for e in evs:
            try:
                d = (e.get("fecha_finalizacion") or "")[:10]
                if d: by_day[d] += 1
            except Exception:
                pass
        days = [(datetime.utcnow().date() - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
        return {"items": [{"date": d[5:], "value": by_day.get(d, 0)} for d in days]}

    # ---- JURADO ----
    if ds in ("mias_asignadas", "mias_pendientes", "mias_finalizadas", "mi_avance_personal", "mi_promedio_emitido"):
        if not my_jurado_id: return {"value": 0}
        evs = await db.evaluaciones_individuales.find({"convocatoria_id": cid, "jurado_id": my_jurado_id}, {"_id": 0}).to_list(500)
        total = len(evs); done = sum(1 for e in evs if e.get("estado") in ("Finalizada", "Firmada"))
        if ds == "mias_asignadas": return {"value": total}
        if ds == "mias_pendientes": return {"value": total - done}
        if ds == "mias_finalizadas": return {"value": done}
        if ds == "mi_avance_personal": return {"total": total, "done": done, "pct": round((done / total) * 100) if total else 0}
        if ds == "mi_promedio_emitido":
            vals = [e.get("puntaje_total", 0) for e in evs if e.get("estado") in ("Finalizada", "Firmada") and e.get("puntaje_total") is not None]
            return {"value": round(sum(vals) / len(vals), 1) if vals else 0}

    return {"error": f"Data source '{ds}' no implementado"}


# ============================================================
# OVERRIDES (Fase 3 — editor sin código)
# ============================================================
def _apply_overrides(dashboards: List[dict], overrides: dict) -> List[dict]:
    """overrides = {hidden_dashboards: [id...], hidden_widgets: [id...], custom_widgets: [{dashboard_id, widget}], ordering: [dashboard_id...]}"""
    if not overrides: return dashboards
    hidden_d = set(overrides.get("hidden_dashboards") or [])
    hidden_w = set(overrides.get("hidden_widgets") or [])
    custom = overrides.get("custom_widgets") or []
    ordering = overrides.get("ordering") or []

    # 1) filtrar
    result = [d for d in dashboards if d["id"] not in hidden_d]
    # 2) filtrar widgets ocultos
    for d in result:
        d["widgets"] = [w for w in d["widgets"] if w["id"] not in hidden_w]
    # 3) agregar widgets custom
    by_id = {d["id"]: d for d in result}
    for cw in custom:
        dash_id = cw.get("dashboard_id")
        w = cw.get("widget")
        if dash_id and w and dash_id in by_id:
            by_id[dash_id]["widgets"].append({**w, "_custom": True})
    # 4) ordenar
    if ordering:
        order_index = {x: i for i, x in enumerate(ordering)}
        result.sort(key=lambda d: order_index.get(d["id"], 999))
    return result


# ============================================================
# AUTO-SUGERENCIAS (Fase 4)
# ============================================================
def _generate_suggestions(campos: list, existing_dashboards: List[dict], overrides: dict) -> List[dict]:
    """Detecta campos configurados y sugiere widgets que aún no existen."""
    campo_names = {c.get("nombre_interno") for c in campos}
    existing_widget_ds = set()
    for d in existing_dashboards:
        for w in d.get("widgets", []): existing_widget_ds.add(w.get("ds"))
    hidden = set((overrides or {}).get("hidden_widgets") or [])
    suggestions = []

    rules = [
        {"if_field": "subregion", "ds": "dist_subregion", "dashboard_id": "territorial",
         "widget": {"id": "sug_subregion", "tipo": "bar", "titulo": "Distribución por subregión", "ds": "dist_subregion"},
         "rationale": "Detectamos el campo 'Subregión'. Sugerimos visualizar la distribución territorial de las propuestas."},
        {"if_field": "linea", "ds": "dist_linea", "dashboard_id": "linea",
         "widget": {"id": "sug_linea", "tipo": "pie", "titulo": "Propuestas por línea", "ds": "dist_linea"},
         "rationale": "Detectamos el campo 'Línea'. Sugerimos un gráfico de distribución por categoría."},
        {"if_field": "municipio", "ds": "dist_municipio_top10", "dashboard_id": "territorial",
         "widget": {"id": "sug_municipio", "tipo": "bar", "titulo": "Top 10 municipios", "ds": "dist_municipio_top10"},
         "rationale": "Detectamos 'Municipio'. Sugerimos visualizar los 10 municipios con mayor participación."},
        {"if_field": "enfoque_poblacional", "ds": "dist_priorizacion", "dashboard_id": "priorizacion",
         "widget": {"id": "sug_priorizacion", "tipo": "bar", "titulo": "Enfoque diferencial poblacional", "ds": "dist_priorizacion"},
         "rationale": "Detectamos 'Enfoque poblacional'. Sugerimos un widget para visualizar priorización por mujeres/discapacidad/étnico."},
        {"if_always": True, "ds": "comparativo_jurados", "dashboard_id": "avance_jurado",
         "widget": {"id": "sug_comp_jur", "tipo": "comparativo", "titulo": "Comparativo de promedios entre jurados", "ds": "comparativo_jurados"},
         "rationale": "Comparativo útil para detectar evaluadores muy laxos o muy severos."},
        {"if_always": True, "ds": "time_series_evaluaciones", "dashboard_id": "avance_general",
         "widget": {"id": "sug_ts", "tipo": "time_series", "titulo": "Evaluaciones por día (últimos 14)", "ds": "time_series_evaluaciones"},
         "rationale": "Time series útil para identificar picos y momentos muertos del proceso."},
    ]
    for r in rules:
        if r["ds"] in existing_widget_ds: continue
        if r["widget"]["id"] in hidden: continue
        if r.get("if_field") and r["if_field"] not in campo_names: continue
        suggestions.append({
            "id": r["widget"]["id"],
            "dashboard_id": r["dashboard_id"],
            "widget": r["widget"],
            "rationale": r["rationale"],
        })
    return suggestions


# ============================================================
# ENDPOINTS
# ============================================================
@router.get("/dashboards")
async def get_dashboards(convocatoria_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    conv = await db.convocatorias.find_one({"id": convocatoria_id}, {"_id": 0})
    if not conv: raise HTTPException(404, "Convocatoria no encontrada")
    is_inc = conv.get("codigo", "").upper() == "INC2026"
    campos = await db.campos.find({"convocatoria_id": convocatoria_id, "aplica_a": "propuesta"}, {"_id": 0}).to_list(200)
    overrides = (conv.get("configuracion") or {}).get("dashboards_overrides") or {}

    dashboards = _dashboards_for_role(user.get("role"), is_inc, campos)
    dashboards = _apply_overrides(dashboards, overrides)

    for dash in dashboards:
        for w in dash["widgets"]:
            try: w["data"] = await _resolve_ds(db, w["ds"], convocatoria_id, user)
            except Exception as e: w["data"] = {"error": str(e)}

    suggestions = []
    if user.get("role") in ("admin_general", "admin_convocatoria"):
        suggestions = _generate_suggestions(campos, dashboards, overrides)

    return {
        "convocatoria": {"id": conv["id"], "codigo": conv.get("codigo"), "nombre": conv.get("nombre")},
        "role": user.get("role"),
        "dashboards": dashboards,
        "suggestions": suggestions,
        "is_admin": user.get("role") in ("admin_general", "admin_convocatoria"),
    }


@router.get("/dashboards/catalog")
async def get_catalog(user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    """Catálogo de data sources + tipos de widget para el editor."""
    return {"data_sources": DATA_SOURCE_CATALOG, "widget_types": WIDGET_TYPES}


@router.patch("/dashboards/overrides")
async def update_overrides(convocatoria_id: str, payload: dict = Body(...),
                            user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    conv = await db.convocatorias.find_one({"id": convocatoria_id})
    if not conv: raise HTTPException(404, "Convocatoria no encontrada")
    config = conv.get("configuracion") or {}
    overrides = config.get("dashboards_overrides") or {}
    # Reemplazo total
    for k in ("hidden_dashboards", "hidden_widgets", "ordering"):
        if k in payload and isinstance(payload[k], list): overrides[k] = payload[k]
    # Operaciones append/remove
    if payload.get("add_hidden_dashboard"):
        s = set(overrides.get("hidden_dashboards") or [])
        s.add(payload["add_hidden_dashboard"])
        overrides["hidden_dashboards"] = list(s)
    if payload.get("remove_hidden_dashboard"):
        overrides["hidden_dashboards"] = [x for x in (overrides.get("hidden_dashboards") or []) if x != payload["remove_hidden_dashboard"]]
    if payload.get("add_hidden_widget"):
        s = set(overrides.get("hidden_widgets") or [])
        s.add(payload["add_hidden_widget"])
        overrides["hidden_widgets"] = list(s)
    if payload.get("remove_hidden_widget"):
        overrides["hidden_widgets"] = [x for x in (overrides.get("hidden_widgets") or []) if x != payload["remove_hidden_widget"]]
    if "custom_widget" in payload:
        cw = payload["custom_widget"]
        if cw and cw.get("dashboard_id") and cw.get("widget"):
            existing = overrides.get("custom_widgets") or []
            existing.append({"dashboard_id": cw["dashboard_id"], "widget": cw["widget"]})
            overrides["custom_widgets"] = existing
    if payload.get("delete_custom_widget_id"):
        overrides["custom_widgets"] = [cw for cw in (overrides.get("custom_widgets") or []) if (cw.get("widget") or {}).get("id") != payload["delete_custom_widget_id"]]
    if payload.get("reset"):
        overrides = {}
    config["dashboards_overrides"] = overrides
    await db.convocatorias.update_one({"id": convocatoria_id}, {"$set": {"configuracion": config}})
    await audit(user, "update", "dashboards_overrides", convocatoria_id)
    return {"ok": True, "overrides": overrides}


@router.get("/dashboards/overrides")
async def get_overrides(convocatoria_id: str, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    conv = await db.convocatorias.find_one({"id": convocatoria_id}, {"_id": 0, "configuracion": 1})
    return (conv or {}).get("configuracion", {}).get("dashboards_overrides") or {}


@router.post("/dashboards/suggestions/{suggestion_id}/accept")
async def accept_suggestion(suggestion_id: str, convocatoria_id: str,
                             user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    """Acepta una sugerencia: la añade como custom_widget."""
    db = get_db()
    conv = await db.convocatorias.find_one({"id": convocatoria_id})
    if not conv: raise HTTPException(404, "Convocatoria no encontrada")
    campos = await db.campos.find({"convocatoria_id": convocatoria_id, "aplica_a": "propuesta"}, {"_id": 0}).to_list(200)
    is_inc = conv.get("codigo", "").upper() == "INC2026"
    dashboards = _dashboards_for_role(user.get("role"), is_inc, campos)
    overrides = (conv.get("configuracion") or {}).get("dashboards_overrides") or {}
    sugs = _generate_suggestions(campos, dashboards, overrides)
    s = next((x for x in sugs if x["id"] == suggestion_id), None)
    if not s: raise HTTPException(404, "Sugerencia no encontrada o ya aplicada")
    config = conv.get("configuracion") or {}
    overrides = config.get("dashboards_overrides") or {}
    customs = overrides.get("custom_widgets") or []
    customs.append({"dashboard_id": s["dashboard_id"], "widget": s["widget"]})
    overrides["custom_widgets"] = customs
    config["dashboards_overrides"] = overrides
    await db.convocatorias.update_one({"id": convocatoria_id}, {"$set": {"configuracion": config}})
    return {"ok": True, "applied": s}


@router.post("/dashboards/suggestions/{suggestion_id}/dismiss")
async def dismiss_suggestion(suggestion_id: str, convocatoria_id: str,
                              user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    """Descarta una sugerencia: la añade a hidden_widgets para no volver a mostrarla."""
    db = get_db()
    conv = await db.convocatorias.find_one({"id": convocatoria_id})
    if not conv: raise HTTPException(404, "Convocatoria no encontrada")
    config = conv.get("configuracion") or {}
    overrides = config.get("dashboards_overrides") or {}
    hidden = set(overrides.get("hidden_widgets") or [])
    hidden.add(suggestion_id)
    overrides["hidden_widgets"] = list(hidden)
    config["dashboards_overrides"] = overrides
    await db.convocatorias.update_one({"id": convocatoria_id}, {"$set": {"configuracion": config}})
    return {"ok": True}
