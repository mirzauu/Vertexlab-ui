"""
FastAPI application entry point.
Configures lifespan, CORS, exception handlers, and mounts the v1 router.
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.core.exceptions import register_exception_handlers
from app.db.session import engine
from app.db.base import Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Startup: ensure storage directories exist
    import os
    for subdir in ["audio", "raw_data", "output"]:
        os.makedirs(os.path.join(settings.STORAGE_PATH, subdir), exist_ok=True)
    yield
    # Shutdown: dispose of the database engine
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    description="AI-powered document processing pipeline backend",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
register_exception_handlers(app)

# Mount v1 API router
from app.api.v1.router import api_v1_router  # noqa: E402

app.include_router(api_v1_router, prefix="/api/v1")


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": settings.APP_NAME}


# Serve compiled frontend from frontent/dist
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dist_path = os.path.join(BASE_DIR, "frontent", "dist")

# Mount static assets directory (/assets)
assets_path = os.path.join(dist_path, "assets")
if os.path.exists(assets_path):
    app.mount("/assets", StaticFiles(directory=assets_path), name="assets")


# Catch-all route to serve files from dist directory, fallback to index.html for SPA routes
@app.get("/{catchall:path}")
async def serve_spa(catchall: str):
    # Check if the requested path corresponds to an existing file in dist
    file_path = os.path.join(dist_path, catchall)
    if os.path.isfile(file_path):
        return FileResponse(file_path)

    # Do not serve index.html for API or documentation requests
    if (
        catchall.startswith("api")
        or catchall.startswith("docs")
        or catchall.startswith("redoc")
        or catchall == "openapi.json"
    ):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not Found")

    # Serve index.html as the entrypoint for SPA
    index_path = os.path.join(dist_path, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)

    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail="Frontend build files not found")
