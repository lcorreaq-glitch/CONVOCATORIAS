"""KRINOS - Upload de imágenes (logos institucionales) almacenadas como base64 en MongoDB."""
import uuid
import base64
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from db import get_db, now_iso
from auth import require_roles, audit

router = APIRouter(prefix="/api/upload", tags=["upload"])

MAX_SIZE = 2 * 1024 * 1024  # 2 MB
ALLOWED_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml", "image/gif"}


@router.post("/image")
async def upload_image(file: UploadFile = File(...),
                       user: dict = Depends(require_roles("admin_general", "admin_convocatoria"))):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Formato no permitido. Use PNG, JPG, WEBP, SVG o GIF.")
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail=f"Imagen excede {MAX_SIZE // (1024*1024)} MB")
    encoded = base64.b64encode(content).decode("ascii")
    data_url = f"data:{file.content_type};base64,{encoded}"
    # Guardar registro en uploads (para auditoría y posible reuso)
    db = get_db()
    rec_id = str(uuid.uuid4())
    await db.uploads.insert_one({
        "id": rec_id, "filename": file.filename or "image",
        "content_type": file.content_type, "size": len(content),
        "data_url": data_url, "uploaded_by": user["username"], "created_at": now_iso(),
    })
    await audit(user, "upload", "uploads", rec_id, detalle=f"{file.filename} {len(content)}b")
    return {"id": rec_id, "data_url": data_url, "filename": file.filename, "size": len(content)}
