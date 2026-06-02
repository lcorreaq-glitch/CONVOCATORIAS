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
    await db.catalogos.update_one({"id": cat_id}, {"$set": {"activo": False}})
    await audit(user, "deactivate", "catalogos", cat_id)
    return {"ok": True}


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
    depende_de: Optional[str] = None
    catalogo_id: Optional[str] = None
    orden: int = 0


@router.get("/campos")
async def list_campos(convocatoria_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    items = await db.campos.find({"convocatoria_id": convocatoria_id}, {"_id": 0}).sort("orden", 1).to_list(500)
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
