import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.routers.auth import router as auth_router
from app.routers.agents import router as agents_router, install_router
from app.routers.metrics import router as metrics_router
from app.routers.ws import router as ws_router

# Lobster 静态页目录（clawgame 前端迁移而来）
LOBSTER_STATIC_DIR = Path(__file__).resolve().parent.parent / "static" / "lobster"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)

app = FastAPI(title="ClawHome Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(agents_router)
app.include_router(install_router)
app.include_router(metrics_router)
app.include_router(ws_router, prefix="/api")

# 挂载 Lobster 静态页到 /lobster
if LOBSTER_STATIC_DIR.is_dir():
    app.mount(
        "/lobster",
        StaticFiles(directory=str(LOBSTER_STATIC_DIR), html=True),
        name="lobster",
    )
else:
    logging.warning("Lobster static dir not found: %s", LOBSTER_STATIC_DIR)


@app.get("/health")
def health():
    return {"status": "ok"}
