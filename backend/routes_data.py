"""KRINOS - Data: propuestas, jurados, ternas, asignaciones + bulk Excel import/export."""
import uuid
import io
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from openpyxl import Workbook, load_workbook

from db import get_db, now_iso
from auth import get_current_user, require_roles, audit, hash_password

router = APIRouter(prefix="/api", tags=["data"])


# ==================== PROPUESTAS ====================
class PropuestaIn(BaseModel):
    convocatoria_id: str
    codigo: Optional[str] = None
    nombre: str
    organizacion: Optional[str] = ""
    datos: dict = Field(default_factory=dict)
    estado: str = "Registrada"


@router.get("/propuestas")
async def list_propuestas(convocatoria_id: str, estado: Optional[str] = None,
                          subregion: Optional[str] = None, linea: Optional[str] = None,
                          search: Optional[str] = None,
                          filtros: Optional[str] = None,
                          user: dict = Depends(get_current_user)):
    """Lista propuestas con filtros dinámicos.

    `filtros` es un JSON con {nombre_interno_campo: valor} que se traduce a query
    sobre datos.<nombre_interno>. Soporta también si_no (true/false) y arrays
    (busca propuestas cuyo array contenga el valor).
    """
    import json as _json
    db = get_db()
    q = {"convocatoria_id": convocatoria_id}
    if estado: q["estado"] = estado
    if subregion: q["datos.subregion"] = subregion
    if linea: q["datos.linea"] = linea
    if filtros:
        try:
            extra = _json.loads(filtros)
            for k, v in (extra or {}).items():
                if v is None or v == "" or v == "__all__":
                    continue
                # Si es array (seleccion_multiple), buscar coincidencia
                if isinstance(v, list):
                    q[f"datos.{k}"] = {"$in": v}
                else:
                    q[f"datos.{k}"] = v
        except Exception:
            pass
    if search:
        q["$or"] = [
            {"nombre": {"$regex": search, "$options": "i"}},
            {"organizacion": {"$regex": search, "$options": "i"}},
            {"codigo": {"$regex": search, "$options": "i"}},
        ]
    items = await db.propuestas.find(q, {"_id": 0}).sort("codigo", 1).to_list(5000)
    return items


@router.get("/propuestas/{pid}")
async def get_propuesta(pid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    item = await db.propuestas.find_one({"id": pid}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    return item


@router.post("/propuestas")
async def create_propuesta(payload: PropuestaIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    if not doc.get("codigo"):
        count = await db.propuestas.count_documents({"convocatoria_id": doc["convocatoria_id"]})
        doc["codigo"] = f"P-{count + 1:04d}"
    doc["created_at"] = now_iso()
    await db.propuestas.insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "create", "propuestas", doc["id"], valor_nuevo={"codigo": doc["codigo"]})
    return doc


@router.patch("/propuestas/{pid}")
async def update_propuesta(pid: str, payload: dict, user: dict = Depends(require_roles("admin_general", "admin_convocatoria", "supervisor"))):
    db = get_db()
    payload.pop("id", None)
    await db.propuestas.update_one({"id": pid}, {"$set": payload})
    await audit(user, "update", "propuestas", pid, valor_nuevo=payload)
    return await db.propuestas.find_one({"id": pid}, {"_id": 0})


@router.get("/propuestas-template")
async def propuestas_template(convocatoria_id: str, user: dict = Depends(get_current_user)):
    """Descarga plantilla Excel para carga masiva de propuestas."""
    db = get_db()
    campos = await db.campos.find({"convocatoria_id": convocatoria_id}, {"_id": 0}).sort("orden", 1).to_list(500)
    wb = Workbook()
    ws = wb.active
    ws.title = "Propuestas"
    headers = ["codigo", "nombre", "organizacion"] + [c["nombre_interno"] for c in campos]
    ws.append(headers)
    ws.append(["P-0001", "Mi propuesta ejemplo", "Mi Organización"] + ["" for _ in campos])
    buf = io.BytesIO()
    wb.save(buf); buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=plantilla_propuestas.xlsx"})


@router.post("/propuestas-import")
async def import_propuestas(convocatoria_id: str = Form(...), file: UploadFile = File(...),
                            user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    content = await file.read()
    try:
        wb = load_workbook(io.BytesIO(content))
        ws = wb.active
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Archivo Excel inválido: {e}")
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return {"creados": 0, "rechazados": 0, "errores": []}
    headers = [str(h).strip() if h else "" for h in rows[0]]
    created, errors = 0, []
    for idx, row in enumerate(rows[1:], start=2):
        try:
            data = {headers[i]: (row[i] if i < len(row) else None) for i in range(len(headers))}
            if not data.get("nombre"):
                errors.append({"fila": idx, "error": "Falta nombre"})
                continue
            datos = {k: v for k, v in data.items() if k not in ("codigo", "nombre", "organizacion") and v is not None}
            # Convert dates/times to string if needed
            for k, v in datos.items():
                if hasattr(v, "isoformat"):
                    datos[k] = v.isoformat()
            codigo = data.get("codigo") or f"P-{await db.propuestas.count_documents({'convocatoria_id': convocatoria_id}) + created + 1:04d}"
            doc = {
                "id": str(uuid.uuid4()),
                "convocatoria_id": convocatoria_id,
                "codigo": str(codigo),
                "nombre": str(data["nombre"]),
                "organizacion": str(data.get("organizacion") or ""),
                "datos": datos,
                "estado": "Registrada",
                "created_at": now_iso(),
            }
            await db.propuestas.insert_one(doc)
            created += 1
        except Exception as e:
            errors.append({"fila": idx, "error": str(e)})
    await audit(user, "bulk_import", "propuestas", convocatoria_id, detalle=f"Creados {created}, errores {len(errors)}")
    return {"creados": created, "rechazados": len(errors), "errores": errors[:50]}


# ==================== JURADOS ====================
class JuradoIn(BaseModel):
    convocatoria_id: str
    nombre: str
    email: str
    telefono: Optional[str] = ""
    perfil: Optional[str] = ""
    especialidad: Optional[str] = ""
    linea_experiencia: Optional[str] = ""
    territorio: Optional[str] = ""
    disponibilidad: Optional[str] = "Disponible"
    estado: str = "Activo"
    crear_usuario: bool = True
    password: Optional[str] = None


@router.get("/jurados")
async def list_jurados(convocatoria_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    items = await db.jurados.find({"convocatoria_id": convocatoria_id}, {"_id": 0}).to_list(2000)
    return items


@router.post("/jurados")
async def create_jurado(payload: JuradoIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    doc = payload.model_dump()
    pwd = doc.pop("password", None) or "Jurado2026!"
    crear_user = doc.pop("crear_usuario", True)
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.jurados.insert_one(doc)
    doc.pop("_id", None)

    if crear_user:
        username = doc["email"].lower()
        existing = await db.users.find_one({"$or": [{"username": username}, {"email": username}]})
        if not existing:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "username": username,
                "email": username,
                "name": doc["nombre"],
                "password_hash": hash_password(pwd),
                "role": "jurado",
                "active": True,
                "convocatoria_roles": [{"convocatoria_id": doc["convocatoria_id"], "role": "jurado"}],
                "jurado_id": doc["id"],
                "created_at": now_iso(),
            })
    await audit(user, "create", "jurados", doc["id"], valor_nuevo={"nombre": doc["nombre"]})
    return doc


@router.patch("/jurados/{jid}")
async def update_jurado(jid: str, payload: dict, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    payload.pop("id", None)
    await db.jurados.update_one({"id": jid}, {"$set": payload})
    await audit(user, "update", "jurados", jid, valor_nuevo=payload)
    return await db.jurados.find_one({"id": jid}, {"_id": 0})


@router.get("/jurados-template")
async def jurados_template(user: dict = Depends(get_current_user)):
    wb = Workbook(); ws = wb.active; ws.title = "Jurados"
    ws.append(["nombre", "email", "telefono", "perfil", "especialidad", "linea_experiencia", "territorio"])
    ws.append(["Ana Pérez", "ana.perez@ejemplo.co", "3001234567", "Magíster en Desarrollo Comunitario", "Participación", "Cultura", "Urabá"])
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=plantilla_jurados.xlsx"})


@router.post("/jurados-import")
async def import_jurados(convocatoria_id: str = Form(...), file: UploadFile = File(...),
                         user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    content = await file.read()
    wb = load_workbook(io.BytesIO(content)); ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return {"creados": 0, "rechazados": 0, "errores": []}
    headers = [str(h).strip() if h else "" for h in rows[0]]
    created, errors = 0, []
    for idx, row in enumerate(rows[1:], start=2):
        try:
            data = {headers[i]: (row[i] if i < len(row) else None) for i in range(len(headers))}
            if not data.get("email") or not data.get("nombre"):
                errors.append({"fila": idx, "error": "Falta nombre o email"}); continue
            email = str(data["email"]).strip().lower()
            doc = {
                "id": str(uuid.uuid4()),
                "convocatoria_id": convocatoria_id,
                "nombre": str(data["nombre"]),
                "email": email,
                "telefono": str(data.get("telefono") or ""),
                "perfil": str(data.get("perfil") or ""),
                "especialidad": str(data.get("especialidad") or ""),
                "linea_experiencia": str(data.get("linea_experiencia") or ""),
                "territorio": str(data.get("territorio") or ""),
                "disponibilidad": "Disponible",
                "estado": "Activo",
                "created_at": now_iso(),
            }
            await db.jurados.insert_one(doc)
            # Crear usuario asociado
            if not await db.users.find_one({"$or": [{"username": email}, {"email": email}]}):
                await db.users.insert_one({
                    "id": str(uuid.uuid4()),
                    "username": email, "email": email, "name": doc["nombre"],
                    "password_hash": hash_password("Jurado2026!"),
                    "role": "jurado", "active": True,
                    "convocatoria_roles": [{"convocatoria_id": convocatoria_id, "role": "jurado"}],
                    "jurado_id": doc["id"],
                    "created_at": now_iso(),
                })
            created += 1
        except Exception as e:
            errors.append({"fila": idx, "error": str(e)})
    await audit(user, "bulk_import", "jurados", convocatoria_id, detalle=f"Creados {created}, errores {len(errors)}")
    return {"creados": created, "rechazados": len(errors), "errores": errors[:50]}


# ==================== TERNAS ====================
class TernaIn(BaseModel):
    convocatoria_id: str
    codigo: Optional[str] = None
    nombre: str
    tipo: str = "Terna"
    integrantes: List[dict] = Field(default_factory=list)  # [{jurado_id, rol}]
    territorio: Optional[str] = None  # subregión asignada
    estado: str = "Creado"
    observaciones: Optional[str] = ""


@router.get("/ternas")
async def list_ternas(convocatoria_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    items = await db.ternas.find({"convocatoria_id": convocatoria_id}, {"_id": 0}).to_list(500)
    return items


@router.post("/ternas")
async def create_terna(payload: TernaIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    if not doc.get("codigo"):
        count = await db.ternas.count_documents({"convocatoria_id": doc["convocatoria_id"]})
        doc["codigo"] = f"T{count + 1}"
    doc["created_at"] = now_iso()
    await db.ternas.insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "create", "ternas", doc["id"], valor_nuevo={"codigo": doc["codigo"]})
    return doc


@router.patch("/ternas/{tid}")
async def update_terna(tid: str, payload: dict, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    payload.pop("id", None)
    await db.ternas.update_one({"id": tid}, {"$set": payload})
    await audit(user, "update", "ternas", tid, valor_nuevo=payload)
    return await db.ternas.find_one({"id": tid}, {"_id": 0})


@router.delete("/ternas/{tid}")
async def delete_terna(tid: str, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    await db.ternas.update_one({"id": tid}, {"$set": {"estado": "Inactivo"}})
    await audit(user, "deactivate", "ternas", tid)
    return {"ok": True}


# ==================== ASIGNACIONES ====================
class AsignacionIn(BaseModel):
    convocatoria_id: str
    propuesta_id: str
    jurado_id: Optional[str] = None
    terna_id: Optional[str] = None
    tipo_evaluacion: str = "individual"  # individual | colectiva
    etapa: str = "Evaluación Individual"
    fecha_apertura: Optional[str] = None
    fecha_cierre: Optional[str] = None
    observacion: Optional[str] = ""


@router.get("/asignaciones")
async def list_asignaciones(convocatoria_id: str, jurado_id: Optional[str] = None,
                            terna_id: Optional[str] = None, propuesta_id: Optional[str] = None,
                            user: dict = Depends(get_current_user)):
    db = get_db()
    q = {"convocatoria_id": convocatoria_id}
    if jurado_id: q["jurado_id"] = jurado_id
    if terna_id: q["terna_id"] = terna_id
    if propuesta_id: q["propuesta_id"] = propuesta_id
    items = await db.asignaciones.find(q, {"_id": 0}).to_list(5000)
    return items


@router.post("/asignaciones")
async def create_asignacion(payload: AsignacionIn, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    doc = payload.model_dump()
    if not doc.get("jurado_id") and not doc.get("terna_id"):
        raise HTTPException(status_code=400, detail="Debe especificar jurado_id o terna_id")
    doc["id"] = str(uuid.uuid4())
    doc["estado"] = "Creada"
    doc["created_at"] = now_iso()
    await db.asignaciones.insert_one(doc)
    doc.pop("_id", None)

    # Auto-crear evaluación individual en estado Borrador si tipo=individual
    if doc["tipo_evaluacion"] == "individual" and doc.get("jurado_id"):
        eval_id = str(uuid.uuid4())
        await db.evaluaciones_individuales.insert_one({
            "id": eval_id,
            "convocatoria_id": doc["convocatoria_id"],
            "propuesta_id": doc["propuesta_id"],
            "jurado_id": doc["jurado_id"],
            "asignacion_id": doc["id"],
            "estado": "Borrador",
            "puntajes": {},
            "observaciones": {},
            "observacion_final": "",
            "puntaje_total": 0,
            "puntaje_diferencial_total": 0,
            "created_at": now_iso(),
        })
    await audit(user, "create", "asignaciones", doc["id"])
    return doc


@router.delete("/asignaciones/{aid}")
async def delete_asignacion(aid: str, user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    asig = await db.asignaciones.find_one({"id": aid})
    if not asig:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")
    await db.asignaciones.update_one({"id": aid}, {"$set": {"estado": "Cancelada"}})
    # Si tenía evaluación borrador, anularla
    await db.evaluaciones_individuales.update_many(
        {"asignacion_id": aid, "estado": {"$in": ["Borrador", "Iniciada"]}},
        {"$set": {"estado": "Anulada"}}
    )
    await audit(user, "cancel", "asignaciones", aid)
    return {"ok": True}


class AsignacionMasivaIn(BaseModel):
    convocatoria_id: str
    terna_id: str
    subregion: str  # asigna todas las propuestas habilitadas de la subregión


@router.post("/asignaciones/masiva-subregion")
async def asignacion_masiva_subregion(payload: AsignacionMasivaIn,
                                      user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    db = get_db()
    propuestas = await db.propuestas.find({
        "convocatoria_id": payload.convocatoria_id,
        "datos.subregion": payload.subregion,
        "estado": {"$nin": ["Anulada", "No habilitada"]}
    }).to_list(5000)
    creados = 0
    for p in propuestas:
        existing = await db.asignaciones.find_one({
            "convocatoria_id": payload.convocatoria_id,
            "propuesta_id": p["id"], "terna_id": payload.terna_id
        })
        if existing: continue
        await db.asignaciones.insert_one({
            "id": str(uuid.uuid4()),
            "convocatoria_id": payload.convocatoria_id,
            "propuesta_id": p["id"],
            "terna_id": payload.terna_id,
            "tipo_evaluacion": "colectiva",
            "etapa": "Evaluación Colectiva",
            "estado": "Creada",
            "created_at": now_iso(),
        })
        creados += 1
    # También crear asignaciones individuales para cada integrante de la terna
    terna = await db.ternas.find_one({"id": payload.terna_id})
    if terna:
        for p in propuestas:
            for integ in terna.get("integrantes", []):
                jid = integ.get("jurado_id")
                if not jid: continue
                if await db.asignaciones.find_one({
                    "convocatoria_id": payload.convocatoria_id,
                    "propuesta_id": p["id"], "jurado_id": jid,
                    "tipo_evaluacion": "individual"
                }):
                    continue
                aid = str(uuid.uuid4())
                await db.asignaciones.insert_one({
                    "id": aid,
                    "convocatoria_id": payload.convocatoria_id,
                    "propuesta_id": p["id"],
                    "jurado_id": jid,
                    "terna_id": payload.terna_id,
                    "tipo_evaluacion": "individual",
                    "etapa": "Evaluación Individual",
                    "estado": "Creada",
                    "created_at": now_iso(),
                })
                await db.evaluaciones_individuales.insert_one({
                    "id": str(uuid.uuid4()),
                    "convocatoria_id": payload.convocatoria_id,
                    "propuesta_id": p["id"],
                    "jurado_id": jid,
                    "asignacion_id": aid,
                    "estado": "Borrador",
                    "puntajes": {}, "observaciones": {},
                    "observacion_final": "",
                    "puntaje_total": 0, "puntaje_diferencial_total": 0,
                    "created_at": now_iso(),
                })
    await audit(user, "bulk_assign", "asignaciones", payload.convocatoria_id,
                detalle=f"Terna {payload.terna_id} ↔ subregión {payload.subregion}: {creados} propuestas")
    return {"asignaciones_creadas": creados, "propuestas_alcanzadas": len(propuestas)}
