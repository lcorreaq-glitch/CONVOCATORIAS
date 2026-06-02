"""KRINOS - Upload de imágenes (logos institucionales) y archivos (hojas de vida, soportes)."""
import uuid
import base64
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from db import get_db, now_iso
from auth import get_current_user, require_roles, audit

router = APIRouter(prefix="/api/upload", tags=["upload"])

MAX_SIZE = 2 * 1024 * 1024  # 2 MB images
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB documents
ALLOWED_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml", "image/gif"}
ALLOWED_FILE_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
    "text/plain",
    "image/png", "image/jpeg", "image/jpg", "image/webp",
}


@router.post("/image")
async def upload_image(file: UploadFile = File(...),
                       user: dict = Depends(get_current_user)):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Formato no permitido. Use PNG, JPG, WEBP, SVG o GIF.")
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail=f"Imagen excede {MAX_SIZE // (1024*1024)} MB")
    encoded = base64.b64encode(content).decode("ascii")
    data_url = f"data:{file.content_type};base64,{encoded}"
    db = get_db()
    rec_id = str(uuid.uuid4())
    await db.uploads.insert_one({
        "id": rec_id, "filename": file.filename or "image",
        "content_type": file.content_type, "size": len(content),
        "data_url": data_url, "uploaded_by": user["username"], "created_at": now_iso(),
    })
    await audit(user, "upload", "uploads", rec_id, detalle=f"{file.filename} {len(content)}b")
    return {"id": rec_id, "data_url": data_url, "filename": file.filename, "size": len(content)}


@router.post("/file")
async def upload_file(file: UploadFile = File(...),
                      user: dict = Depends(get_current_user)):
    """Upload genérico para documentos (hojas de vida, soportes, etc.)."""
    if file.content_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(status_code=400, detail=f"Formato no permitido: {file.content_type}. Use PDF, DOCX, XLSX, ZIP, TXT o imágenes.")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"Archivo excede {MAX_FILE_SIZE // (1024*1024)} MB")
    encoded = base64.b64encode(content).decode("ascii")
    data_url = f"data:{file.content_type};base64,{encoded}"
    db = get_db()
    rec_id = str(uuid.uuid4())
    await db.uploads.insert_one({
        "id": rec_id, "filename": file.filename or "archivo",
        "content_type": file.content_type, "size": len(content),
        "data_url": data_url, "uploaded_by": user["username"], "created_at": now_iso(),
    })
    await audit(user, "upload_file", "uploads", rec_id, detalle=f"{file.filename} {len(content)}b")
    return {"id": rec_id, "data_url": data_url, "filename": file.filename, "size": len(content), "content_type": file.content_type}
