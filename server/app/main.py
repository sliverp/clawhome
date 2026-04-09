import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers.auth import router as auth_router
from app.routers.agents import router as agents_router, install_router
from app.routers.metrics import router as metrics_router
from app.routers.ws import router as ws_router

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


@app.get("/health")
def health():
    return {"status": "ok"}
