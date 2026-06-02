"""KRINOS - FastAPI main application."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from db import get_db, create_indexes, seed_admin, seed_incentivos_2026, seed_demo_data
from auth import router as auth_router
from routes_users import router as users_router
from routes_config import router as config_router
from routes_data import router as data_router
from routes_eval import router as eval_router
from routes_reports import router as reports_router
from routes_settings import router as settings_router
from routes_ai import router as ai_router
from routes_permissions import router as permissions_router
from routes_upload import router as upload_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await create_indexes()
    await seed_admin()
    await seed_incentivos_2026()
    await seed_demo_data()
    yield


app = FastAPI(title="KRINOS API", version="1.0.0", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/")
async def root():
    return {"name": "KRINOS API", "version": "1.0.0", "by": "ELEA", "tagline": "Plataforma Inteligente para Convocatorias y Evaluación."}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Include routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(config_router)
app.include_router(data_router)
app.include_router(eval_router)
app.include_router(reports_router)
app.include_router(settings_router)
app.include_router(ai_router)
app.include_router(permissions_router)
app.include_router(upload_router)


logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("krinos")
