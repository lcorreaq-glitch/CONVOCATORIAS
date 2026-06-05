"""KRINOS - Configuration: convocatorias, catálogos, campos personalizados, criterios, desempates."""
import uuid
from typing import List, Optional, Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from db import get_db, now_iso
from auth import get_current_user, require_roles, audit

router = APIRouter(prefix="/api", tags=["config"])


# ==================== CONVOCATORIAS ====================
class ConvocatoriaIn(BaseModel):
    codigo: str
    nombre: str
    descripcion: Optional[str] = ""
    vigencia: Optional[str] = ""
    tipo: Optional[str] = ""
    entidades: List[dict] = Field(default_factory=list)
    estado: str = "Borrador"
    etapa_actual: Optional[str] = "Configuración"
    etapas_habilitadas: List[str] = Field(default_factory=list)
    fechas: dict = Field(default_factory=dict)
    modalidad_evaluacion_colectiva: str = "promedio_individuales"
    modelo_expediente: str = "externo"
    imagen_grafica: dict = Field(default_factory=dict)


@router.get("/convocatorias")
async def list_convocatorias(user: dict = Depends(get_current_user)):
    db = get_db()
    items = await db.convocatorias.find({}, {"_id": 0}).to_list(500)
    return items


@router.get("/convocatorias/{cid}")
async def get_convocatoria(cid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    item = await db.convocatorias.find_one({"id": cid}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Convocatoria no encontrada")
    return item


@router.post("/convocatorias")
async def create_convocatoria(payload: ConvocatoriaIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    if await db.convocatorias.find_one({"codigo": payload.codigo}):
        raise HTTPException(status_code=409, detail="Código de convocatoria ya existe")
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    doc["created_by"] = user["username"]
    await db.convocatorias.insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "create", "convocatorias", doc["id"], valor_nuevo={"codigo": doc["codigo"], "nombre": doc["nombre"]})
    return {**doc}


@router.patch("/convocatorias/{cid}")
async def update_convocatoria(cid: str, payload: dict, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    existing = await db.convocatorias.find_one({"id": cid})
    if not existing:
        raise HTTPException(status_code=404, detail="Convocatoria no encontrada")
    payload.pop("id", None)
    payload.pop("codigo", None)  # código no editable después de crear
    await db.convocatorias.update_one({"id": cid}, {"$set": payload})
    await audit(user, "update", "convocatorias", cid, valor_nuevo=payload)
    out = await db.convocatorias.find_one({"id": cid}, {"_id": 0})
    return out


@router.delete("/convocatorias/{cid}")
async def delete_convocatoria(cid: str, force: bool = False, user: dict = Depends(require_roles("admin_general"))):
    db = get_db()
    existing = await db.convocatorias.find_one({"id": cid})
    if not existing:
        raise HTTPException(status_code=404, detail="Convocatoria no encontrada")

    # Validación de seguridad: bloqueada si tiene evaluaciones
    blockers = {}
    blockers["evaluaciones_individuales"] = await db.evaluaciones_individuales.count_documents({"convocatoria_id": cid})
    blockers["evaluaciones_colectivas"] = await db.evaluaciones_colectivas.count_documents({"convocatoria_id": cid})
    blockers["rankings"] = await db.rankings.count_documents({"convocatoria_id": cid})

    if not force and any(blockers.values()):
        return {
            "ok": False,
            "blocked": True,
            "reason": "La convocatoria tiene evaluaciones, evaluaciones colectivas o rankings asociados y no puede eliminarse sin perder trazabilidad.",
            "bloqueos": blockers,
            "sugerencia": "Cambia el estado de la convocatoria a 'Anulada' o 'Finalizada' para conservar la historia."
        }

    if force and user["role"] != "admin_general":
        raise HTTPException(status_code=403, detail="Solo Admin General puede forzar eliminación")

    # Hard delete cuando no hay bloqueos o force=true (solo admin_general)
    for col in ["propuestas", "jurados", "ternas", "asignaciones", "campos", "catalogos",
                "criterios", "desempates", "evaluaciones_individuales", "evaluaciones_colectivas",
                "rankings"]:
        await db[col].delete_many({"convocatoria_id": cid})
    await db.convocatorias.delete_one({"id": cid})
    await audit(user, "delete", "convocatorias", cid, valor_anterior={"codigo": existing["codigo"]},
                detalle=f"force={force} bloqueos={blockers}")
    return {"ok": True, "deleted": True, "force": force}


# ==================== CATÁLOGOS ====================
class CatalogoIn(BaseModel):
    convocatoria_id: str
    nombre: str
    descripcion: Optional[str] = ""
    activo: bool = True
    padre_id: Optional[str] = None
    valores: List[dict] = Field(default_factory=list)


@router.get("/catalogos")
async def list_catalogos(convocatoria_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    items = await db.catalogos.find({"convocatoria_id": convocatoria_id}, {"_id": 0}).to_list(500)
    return items


@router.post("/catalogos")
async def create_catalogo(payload: CatalogoIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    for v in doc["valores"]:
        v.setdefault("id", str(uuid.uuid4()))
        v.setdefault("activo", True)
    await db.catalogos.insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "create", "catalogos", doc["id"], valor_nuevo={"nombre": doc["nombre"]})
    return doc


@router.patch("/catalogos/{cat_id}")
async def update_catalogo(cat_id: str, payload: dict, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    payload.pop("id", None)
    valores = payload.get("valores")
    if valores:
        for v in valores:
            v.setdefault("id", str(uuid.uuid4()))
            v.setdefault("activo", True)
    await db.catalogos.update_one({"id": cat_id}, {"$set": payload})
    await audit(user, "update", "catalogos", cat_id, valor_nuevo=payload)
    out = await db.catalogos.find_one({"id": cat_id}, {"_id": 0})
    return out


@router.delete("/catalogos/{cat_id}")
async def delete_catalogo(cat_id: str, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    cat = await db.catalogos.find_one({"id": cat_id})
    if not cat:
        raise HTTPException(status_code=404, detail="Catálogo no encontrado")
    # Bloquear si tiene campos vinculados
    linked = await db.campos.count_documents({"catalogo_id": cat_id})
    if linked > 0:
        raise HTTPException(status_code=409, detail=f"El catálogo está vinculado a {linked} campo(s). Desvincúlalos antes de eliminar.")
    await db.catalogos.delete_one({"id": cat_id})
    await audit(user, "delete", "catalogos", cat_id, valor_anterior={"nombre": cat.get("nombre")})
    return {"ok": True, "deleted": True}


# ==================== CAMPOS PERSONALIZADOS ====================
class CampoIn(BaseModel):
    convocatoria_id: str
    nombre_visible: str
    nombre_interno: str
    tipo: str  # texto_corto, texto_largo, numero, moneda, porcentaje, fecha, hora, email, telefono, url, archivo, lista, seleccion_multiple, si_no, consecutivo, calculado
    obligatorio: bool = False
    editable: bool = True
    visible_perfiles: List[str] = Field(default_factory=list)
    importable: bool = True
    exportable: bool = True
    uso_filtro: bool = False
    uso_dashboard: bool = False
    uso_actas: bool = False
    uso_reportes: bool = True
    uso_ranking: bool = False
    uso_desempate: bool = False
    uso_propuesta: bool = True   # Aparece en el formulario de propuesta
    uso_lista: bool = False      # Aparece como columna en /propuestas
    aplica_a: str = "propuesta"  # "propuesta" | "jurado" — dominio al que pertenece el campo
    rol_especial: Optional[str] = None  # firma | hoja_vida | documento | foto | otro (solo aplica_a=jurado)
    depende_de: Optional[str] = None
    catalogo_id: Optional[str] = None
    orden: int = 0


@router.get("/campos")
async def list_campos(convocatoria_id: str, aplica_a: Optional[str] = None, user: dict = Depends(get_current_user)):
    db = get_db()
    q = {"convocatoria_id": convocatoria_id}
    if aplica_a:
        # Compatibilidad: campos sin aplica_a se consideran de propuesta por default
        if aplica_a == "propuesta":
            q["$or"] = [{"aplica_a": "propuesta"}, {"aplica_a": {"$exists": False}}]
        else:
            q["aplica_a"] = aplica_a
    items = await db.campos.find(q, {"_id": 0}).sort("orden", 1).to_list(500)
    return items


@router.post("/campos")
async def create_campo(payload: CampoIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    if await db.campos.find_one({"convocatoria_id": payload.convocatoria_id, "nombre_interno": payload.nombre_interno}):
        raise HTTPException(status_code=409, detail="Nombre interno ya existe en esta convocatoria")
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.campos.insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "create", "campos", doc["id"], valor_nuevo={"nombre_interno": doc["nombre_interno"]})
    return doc


@router.patch("/campos/{campo_id}")
async def update_campo(campo_id: str, payload: dict, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    payload.pop("id", None)
    payload.pop("nombre_interno", None)
    await db.campos.update_one({"id": campo_id}, {"$set": payload})
    await audit(user, "update", "campos", campo_id, valor_nuevo=payload)
    out = await db.campos.find_one({"id": campo_id}, {"_id": 0})
    return out


@router.delete("/campos/{campo_id}")
async def delete_campo(campo_id: str, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    await db.campos.delete_one({"id": campo_id})
    await audit(user, "delete", "campos", campo_id)
    return {"ok": True}


# ==================== CRITERIOS ====================
class CriterioIn(BaseModel):
    convocatoria_id: str
    nombre: str
    descripcion: Optional[str] = ""
    puntaje_min: float = 0
    puntaje_max: float = 100
    ponderacion: float = 0  # 0 si es diferencial (no suma al total)
    oficial: bool = True
    diferencial: bool = False
    obligatorio: bool = True
    orden: int = 0


@router.get("/criterios")
async def list_criterios(convocatoria_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    items = await db.criterios.find({"convocatoria_id": convocatoria_id}, {"_id": 0}).sort("orden", 1).to_list(500)
    return items


@router.post("/criterios")
async def create_criterio(payload: CriterioIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.criterios.insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "create", "criterios", doc["id"], valor_nuevo={"nombre": doc["nombre"]})
    return doc


@router.patch("/criterios/{cid}")
async def update_criterio(cid: str, payload: dict, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    payload.pop("id", None)
    await db.criterios.update_one({"id": cid}, {"$set": payload})
    await audit(user, "update", "criterios", cid, valor_nuevo=payload)
    return await db.criterios.find_one({"id": cid}, {"_id": 0})


@router.delete("/criterios/{cid}")
async def delete_criterio(cid: str, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    await db.criterios.delete_one({"id": cid})
    await audit(user, "delete", "criterios", cid)
    return {"ok": True}


# ==================== DESEMPATES ====================
@router.get("/desempates")
async def list_desempates(convocatoria_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    items = await db.desempates.find({"convocatoria_id": convocatoria_id}, {"_id": 0}).sort("orden", 1).to_list(100)
    return items


class DesempateIn(BaseModel):
    convocatoria_id: str
    orden: int
    nombre: str
    campo: str
    tipo_comparacion: str
    activo: bool = True


@router.post("/desempates")
async def create_desempate(payload: DesempateIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.desempates.insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "create", "desempates", doc["id"], valor_nuevo={"nombre": doc["nombre"]})
    return doc


@router.patch("/desempates/{did}")
async def update_desempate(did: str, payload: dict, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    payload.pop("id", None)
    await db.desempates.update_one({"id": did}, {"$set": payload})
    await audit(user, "update", "desempates", did, valor_nuevo=payload)
    return await db.desempates.find_one({"id": did}, {"_id": 0})


@router.delete("/desempates/{did}")
async def delete_desempate(did: str, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    await db.desempates.delete_one({"id": did})
    await audit(user, "delete", "desempates", did)
    return {"ok": True}


# ==================== REORDENAR (bulk update orden) ====================
class ReordenarIn(BaseModel):
    convocatoria_id: str
    ids: List[str]  # nueva secuencia de IDs en orden deseado


async def _reordenar(collection_name: str, payload: ReordenarIn, user: dict):
    db = get_db()
    for idx, _id in enumerate(payload.ids):
        await db[collection_name].update_one(
            {"id": _id, "convocatoria_id": payload.convocatoria_id},
            {"$set": {"orden": idx + 1}}
        )
    await audit(user, "reorder", collection_name, payload.convocatoria_id,
                valor_nuevo={"orden_ids": payload.ids})
    return {"ok": True, "count": len(payload.ids)}


@router.post("/campos/reordenar")
async def reordenar_campos(payload: ReordenarIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    return await _reordenar("campos", payload, user)


@router.post("/criterios/reordenar")
async def reordenar_criterios(payload: ReordenarIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    return await _reordenar("criterios", payload, user)


@router.post("/desempates/reordenar")
async def reordenar_desempates(payload: ReordenarIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    return await _reordenar("desempates", payload, user)


# ==================== RESUMEN / MAPA DE LA CONFIGURACIÓN ====================
@router.get("/convocatorias/{cid}/configuracion/resumen")
async def resumen_configuracion(cid: str, user: dict = Depends(get_current_user)):
    """Devuelve un mapa de uso entre campos, catálogos, criterios y desempates."""
    db = get_db()
    conv = await db.convocatorias.find_one({"id": cid}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Convocatoria no encontrada")

    campos = await db.campos.find({"convocatoria_id": cid}, {"_id": 0}).sort("orden", 1).to_list(500)
    catalogos = await db.catalogos.find({"convocatoria_id": cid}, {"_id": 0}).to_list(500)
    criterios = await db.criterios.find({"convocatoria_id": cid}, {"_id": 0}).sort("orden", 1).to_list(500)
    desempates = await db.desempates.find({"convocatoria_id": cid}, {"_id": 0}).sort("orden", 1).to_list(100)

    propuestas_count = await db.propuestas.count_documents({"convocatoria_id": cid})
    evaluaciones_ind = await db.evaluaciones_individuales.count_documents({"convocatoria_id": cid})
    evaluaciones_col = await db.evaluaciones_colectivas.count_documents({"convocatoria_id": cid})

    # Catálogo -> qué campos lo usan
    cat_usage = {c["id"]: [] for c in catalogos}
    for ca in campos:
        if ca.get("catalogo_id") and ca["catalogo_id"] in cat_usage:
            cat_usage[ca["catalogo_id"]].append({"campo_id": ca["id"], "nombre_visible": ca["nombre_visible"]})

    # Desempate -> campo/criterio referenciado
    crit_by_id = {c["id"]: c["nombre"] for c in criterios}
    crit_by_name = {c["nombre"].lower(): c for c in criterios}
    campo_by_int = {ca["nombre_interno"]: ca for ca in campos}
    desempate_refs = []
    for d in desempates:
        ref = d.get("campo", "")
        resolved = {"fuente": "indefinida", "label": ref}
        if ref == "sorteo" or d.get("tipo_comparacion") == "sorteo":
            resolved = {"fuente": "sorteo", "label": "Sorteo aleatorio"}
        elif ref.startswith("criterio:"):
            name = ref.split(":", 1)[1].strip().lower()
            c = crit_by_name.get(name)
            resolved = {"fuente": "criterio", "label": c["nombre"] if c else ref, "id": c["id"] if c else None}
        elif ref.startswith("criterio_id:"):
            cid_ref = ref.split(":", 1)[1].strip()
            resolved = {"fuente": "criterio", "label": crit_by_id.get(cid_ref, cid_ref), "id": cid_ref}
        elif ref.startswith("campo:"):
            interno = ref.split(":", 1)[1].strip()
            ca = campo_by_int.get(interno)
            resolved = {"fuente": "campo", "label": ca["nombre_visible"] if ca else interno, "id": ca["id"] if ca else None}
        elif ref in campo_by_int:
            ca = campo_by_int[ref]
            resolved = {"fuente": "campo", "label": ca["nombre_visible"], "id": ca["id"]}
        desempate_refs.append({"id": d["id"], "orden": d.get("orden"), "nombre": d["nombre"], "referencia": resolved})

    # Puntaje oficial total
    puntaje_max_total = sum(c.get("puntaje_max", 0) for c in criterios if c.get("oficial"))

    # Campos por uso
    campos_tipo_lista = [c for c in campos if c.get("tipo") in ("lista", "seleccion_multiple")]
    campos_sin_catalogo = [c for c in campos_tipo_lista if not c.get("catalogo_id")]
    campos_ranking = [c for c in campos if c.get("uso_ranking")]
    campos_actas = [c for c in campos if c.get("uso_actas")]
    campos_filtros = [c for c in campos if c.get("uso_filtro")]

    return {
        "convocatoria": {
            "id": conv["id"],
            "codigo": conv["codigo"],
            "nombre": conv["nombre"],
            "estado": conv.get("estado"),
            "etapa_actual": conv.get("etapa_actual"),
        },
        "counts": {
            "campos": len(campos),
            "catalogos": len(catalogos),
            "criterios": len(criterios),
            "desempates": len(desempates),
            "propuestas": propuestas_count,
            "evaluaciones_individuales": evaluaciones_ind,
            "evaluaciones_colectivas": evaluaciones_col,
            "puntaje_max_total": puntaje_max_total,
        },
        "catalogo_usage": cat_usage,
        "catalogos_by_id": {c["id"]: c["nombre"] for c in catalogos},
        "desempate_refs": desempate_refs,
        "alertas": {
            "campos_lista_sin_catalogo": [{"id": c["id"], "nombre": c["nombre_visible"]} for c in campos_sin_catalogo],
            "criterios_sin_ponderacion": [{"id": c["id"], "nombre": c["nombre"]} for c in criterios if c.get("oficial") and not c.get("puntaje_max")],
            "puntaje_total_no_100": puntaje_max_total not in (0, 100) and len(criterios) > 0,
        },
        "stats": {
            "campos_tipo_lista": len(campos_tipo_lista),
            "campos_ranking": len(campos_ranking),
            "campos_actas": len(campos_actas),
            "campos_filtros": len(campos_filtros),
        },
    }


# ==================== CLONAR CONFIGURACIÓN ENTRE CONVOCATORIAS ====================
class ClonarIn(BaseModel):
    source_convocatoria_id: str
    incluir_campos: bool = True
    incluir_catalogos: bool = True
    incluir_criterios: bool = True
    incluir_desempates: bool = True
    modo: str = "agregar"  # "agregar" | "reemplazar"


@router.post("/convocatorias/{cid}/configuracion/clonar")
async def clonar_configuracion(cid: str, payload: ClonarIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    target = await db.convocatorias.find_one({"id": cid})
    source = await db.convocatorias.find_one({"id": payload.source_convocatoria_id})
    if not target:
        raise HTTPException(status_code=404, detail="Convocatoria destino no encontrada")
    if not source:
        raise HTTPException(status_code=404, detail="Convocatoria origen no encontrada")
    if cid == payload.source_convocatoria_id:
        raise HTTPException(status_code=400, detail="La convocatoria origen y destino no pueden ser la misma")

    result = {"campos": 0, "catalogos": 0, "criterios": 0, "desempates": 0, "saltados": []}
    cat_id_map = {}  # source_cat_id -> new_cat_id (para remapear catalogo_id en campos)

    if payload.modo == "reemplazar":
        if payload.incluir_catalogos:
            await db.catalogos.delete_many({"convocatoria_id": cid})
        if payload.incluir_campos:
            await db.campos.delete_many({"convocatoria_id": cid})
        if payload.incluir_criterios:
            await db.criterios.delete_many({"convocatoria_id": cid})
        if payload.incluir_desempates:
            await db.desempates.delete_many({"convocatoria_id": cid})

    # Catálogos primero (porque campos los referencian)
    if payload.incluir_catalogos:
        src_cats = await db.catalogos.find({"convocatoria_id": payload.source_convocatoria_id}).to_list(500)
        for c in src_cats:
            existing = await db.catalogos.find_one({"convocatoria_id": cid, "nombre": c["nombre"]})
            if existing and payload.modo == "agregar":
                cat_id_map[c["id"]] = existing["id"]
                result["saltados"].append(f"catálogo:{c['nombre']}")
                continue
            new_id = str(uuid.uuid4())
            cat_id_map[c["id"]] = new_id
            new_doc = {**c, "id": new_id, "convocatoria_id": cid, "created_at": now_iso()}
            new_doc.pop("_id", None)
            new_doc["valores"] = [{**v, "id": str(uuid.uuid4())} for v in c.get("valores", [])]
            await db.catalogos.insert_one(new_doc)
            result["catalogos"] += 1

    # Campos
    if payload.incluir_campos:
        src_campos = await db.campos.find({"convocatoria_id": payload.source_convocatoria_id}).to_list(500)
        for ca in src_campos:
            existing = await db.campos.find_one({"convocatoria_id": cid, "nombre_interno": ca["nombre_interno"]})
            if existing and payload.modo == "agregar":
                result["saltados"].append(f"campo:{ca['nombre_interno']}")
                continue
            new_doc = {**ca, "id": str(uuid.uuid4()), "convocatoria_id": cid, "created_at": now_iso()}
            new_doc.pop("_id", None)
            if new_doc.get("catalogo_id") and new_doc["catalogo_id"] in cat_id_map:
                new_doc["catalogo_id"] = cat_id_map[new_doc["catalogo_id"]]
            await db.campos.insert_one(new_doc)
            result["campos"] += 1

    # Criterios
    if payload.incluir_criterios:
        src_crit = await db.criterios.find({"convocatoria_id": payload.source_convocatoria_id}).to_list(500)
        for c in src_crit:
            existing = await db.criterios.find_one({"convocatoria_id": cid, "nombre": c["nombre"]})
            if existing and payload.modo == "agregar":
                result["saltados"].append(f"criterio:{c['nombre']}")
                continue
            new_doc = {**c, "id": str(uuid.uuid4()), "convocatoria_id": cid, "created_at": now_iso()}
            new_doc.pop("_id", None)
            await db.criterios.insert_one(new_doc)
            result["criterios"] += 1

    # Desempates
    if payload.incluir_desempates:
        src_des = await db.desempates.find({"convocatoria_id": payload.source_convocatoria_id}).to_list(200)
        for d in src_des:
            new_doc = {**d, "id": str(uuid.uuid4()), "convocatoria_id": cid, "created_at": now_iso()}
            new_doc.pop("_id", None)
            await db.desempates.insert_one(new_doc)
            result["desempates"] += 1

    await audit(user, "clone_config", "convocatorias", cid,
                valor_nuevo={"source": payload.source_convocatoria_id, "result": result})
    return {"ok": True, "resultado": result, "origen": source["codigo"], "destino": target["codigo"]}


# ==================== EXPORTAR / IMPORTAR JSON ====================
@router.get("/convocatorias/{cid}/configuracion/export")
async def export_configuracion(cid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    conv = await db.convocatorias.find_one({"id": cid}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Convocatoria no encontrada")
    campos = await db.campos.find({"convocatoria_id": cid}, {"_id": 0}).sort("orden", 1).to_list(500)
    catalogos = await db.catalogos.find({"convocatoria_id": cid}, {"_id": 0}).to_list(500)
    criterios = await db.criterios.find({"convocatoria_id": cid}, {"_id": 0}).sort("orden", 1).to_list(500)
    desempates = await db.desempates.find({"convocatoria_id": cid}, {"_id": 0}).sort("orden", 1).to_list(100)
    return {
        "krinos_export_version": 1,
        "exported_at": now_iso(),
        "convocatoria": {"codigo": conv["codigo"], "nombre": conv["nombre"]},
        "campos": campos,
        "catalogos": catalogos,
        "criterios": criterios,
        "desempates": desempates,
    }


class ImportarIn(BaseModel):
    data: dict
    modo: str = "agregar"  # "agregar" | "reemplazar"
    incluir_campos: bool = True
    incluir_catalogos: bool = True
    incluir_criterios: bool = True
    incluir_desempates: bool = True


@router.post("/convocatorias/{cid}/configuracion/import")
async def import_configuracion(cid: str, payload: ImportarIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    target = await db.convocatorias.find_one({"id": cid})
    if not target:
        raise HTTPException(status_code=404, detail="Convocatoria destino no encontrada")
    data = payload.data or {}
    if data.get("krinos_export_version") != 1:
        raise HTTPException(status_code=400, detail="Archivo no es un export KRINOS válido (version 1)")

    result = {"campos": 0, "catalogos": 0, "criterios": 0, "desempates": 0, "saltados": []}
    cat_id_map = {}  # original_id -> new_id

    if payload.modo == "reemplazar":
        if payload.incluir_catalogos:
            await db.catalogos.delete_many({"convocatoria_id": cid})
        if payload.incluir_campos:
            await db.campos.delete_many({"convocatoria_id": cid})
        if payload.incluir_criterios:
            await db.criterios.delete_many({"convocatoria_id": cid})
        if payload.incluir_desempates:
            await db.desempates.delete_many({"convocatoria_id": cid})

    if payload.incluir_catalogos:
        for c in data.get("catalogos", []):
            existing = await db.catalogos.find_one({"convocatoria_id": cid, "nombre": c["nombre"]})
            if existing and payload.modo == "agregar":
                cat_id_map[c.get("id")] = existing["id"]
                result["saltados"].append(f"catálogo:{c['nombre']}")
                continue
            new_id = str(uuid.uuid4())
            cat_id_map[c.get("id")] = new_id
            new_doc = {**c, "id": new_id, "convocatoria_id": cid, "created_at": now_iso()}
            new_doc["valores"] = [{**v, "id": str(uuid.uuid4())} for v in c.get("valores", [])]
            await db.catalogos.insert_one(new_doc)
            result["catalogos"] += 1

    if payload.incluir_campos:
        for ca in data.get("campos", []):
            existing = await db.campos.find_one({"convocatoria_id": cid, "nombre_interno": ca["nombre_interno"]})
            if existing and payload.modo == "agregar":
                result["saltados"].append(f"campo:{ca['nombre_interno']}")
                continue
            new_doc = {**ca, "id": str(uuid.uuid4()), "convocatoria_id": cid, "created_at": now_iso()}
            if new_doc.get("catalogo_id") and new_doc["catalogo_id"] in cat_id_map:
                new_doc["catalogo_id"] = cat_id_map[new_doc["catalogo_id"]]
            await db.campos.insert_one(new_doc)
            result["campos"] += 1

    if payload.incluir_criterios:
        for c in data.get("criterios", []):
            existing = await db.criterios.find_one({"convocatoria_id": cid, "nombre": c["nombre"]})
            if existing and payload.modo == "agregar":
                result["saltados"].append(f"criterio:{c['nombre']}")
                continue
            new_doc = {**c, "id": str(uuid.uuid4()), "convocatoria_id": cid, "created_at": now_iso()}
            await db.criterios.insert_one(new_doc)
            result["criterios"] += 1

    if payload.incluir_desempates:
        for d in data.get("desempates", []):
            new_doc = {**d, "id": str(uuid.uuid4()), "convocatoria_id": cid, "created_at": now_iso()}
            await db.desempates.insert_one(new_doc)
            result["desempates"] += 1

    await audit(user, "import_config", "convocatorias", cid, valor_nuevo={"result": result})
    return {"ok": True, "resultado": result}
