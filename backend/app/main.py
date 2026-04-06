"""
FlowMeter API - Main Application Entry Point

FastAPI backend for industrial process visualization and data analysis dashboards.

## Architecture

**API Structure:**
    - `/api/v1/data`: Dataset upload, management, and statistics
    - `/api/v1/visualizations`: Chart data generation
    - `/api/v1/reconcile`: Data reconciliation (constrained optimization)
    - `/api/v1/templates`: Dashboard configuration persistence
    - `/api/v1/export`: HTML report generation
    - `/api/v1/models`: Regression model training and persistence
    - `/api/v1/ai`: AI-powered visualization suggestions

**Key Features:**
    - In-memory dataset storage for fast access
    - NaN/Inf-safe JSON serialization for scientific data
    - CORS support for frontend integration
    - GZip compression for large JSON payloads
    - Request profiling middleware (X-Process-Time header)
    - Global exception handling with structured responses
    - Static file serving for SPA (Single Page Application)
    - PyInstaller compatibility for standalone deployment

**Middleware Stack (execution order):**
    1. CORSMiddleware (CORS headers)
    2. ProcessTimeMiddleware (request timing)
    3. GZipMiddleware (response compression)

**Response Format:**
    All JSON responses use NaNSafeJSONResponse to convert
    NaN/Inf values to null for JSON compliance.

**Development:**
    Run with: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
    Docs available at: http://localhost:8000/docs

**Production:**
    Use Gunicorn with Uvicorn workers:
    `gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker`
"""
# Standard Library Imports
import logging
import os
import sys
import time
from contextlib import asynccontextmanager

# Third-Party Imports
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# Local Application Imports
from app.api import api_router, data, export, reconciliation, templates, visualizations, models
from app.core.config import get_settings
from app.core.profiler import ProcessTimeMiddleware
from app.core.responses import NaNSafeJSONResponse
from app.core.responses import NaNSafeJSONResponse

# --- Configuration ---
settings = get_settings()

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.
    
    Handles startup configuration (license check, logging) and 
    graceful shutdown procedures.
    """
    # --- Startup ---
    logger.info(f"🚀 Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"📊 Debug mode: {settings.debug}")
    
    # Prewarm Kaleido for faster first export
    try:
        from app.services.export_helpers.plotly_renderer import prewarm_kaleido
        prewarm_kaleido()
    except Exception as e:
        logger.warning(f"Kaleido prewarm skipped: {e}")
    
    yield
    
    # --- Shutdown ---
    logger.info("👋 Shutting down FlowMeter API")


# --- FastAPI Application ---
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="""
## FlowMeter API

Industrial process visualization and analytics dashboard backend.

### Features
- **Data Management**: Upload and process Excel/CSV files
- **Visualizations**: Generate interactive plot data
- **Templates**: Save and load dashboard configurations
- **Statistics**: Calculate data statistics and trends

### API Versioning
All endpoints are prefixed with `/api/v1`
    """,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
    default_response_class=NaNSafeJSONResponse
)

# --- Middleware ---

# CORS (Cross-Origin Resource Sharing)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Timing (Profiler)
app.add_middleware(ProcessTimeMiddleware)

# GZip Compression (Reduces payload size significantly for JSON data)
app.add_middleware(GZipMiddleware, minimum_size=1000)


# --- Exception Handlers ---

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global catch-all exception handler.
    Ensures all unhandled errors return a structured JSON response.
    """
    logger.error(f"Global exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "detail": str(exc) if settings.debug else "An unexpected error occurred"
        }
    )


# --- Routing ---

# Include sub-routers
app.include_router(api_router)
app.include_router(data.router, prefix="/api/v1/data", tags=["Data"])
app.include_router(visualizations.router, prefix="/api/v1/visualizations", tags=["Visualizations"])
app.include_router(reconciliation.router, prefix="/api/v1/reconcile", tags=["Reconciliation"])
app.include_router(templates.router, prefix="/api/v1/templates", tags=["Templates"])
app.include_router(export.router, prefix="/api/v1/export", tags=["Export"])
app.include_router(models.router, prefix="/api/v1/models", tags=["Models"])


# --- Root / Health ---

@app.get("/api/info", tags=["Root"])
async def root():
    """Return basic API information."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint for monitoring uptime."""
    return {
        "status": "healthy",
        "version": settings.app_version
    }



# --- Static Files (Frontend) ---

# Determine path to compiled frontend assets
# support PyInstaller (_MEIPASS) and valid development paths
if getattr(sys, 'frozen', False):
    static_dir = os.path.join(sys._MEIPASS, 'static')
else:
    # Go up 3 levels from back/app/main.py -> backend -> root -> frontend/dist
    static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'frontend', 'dist')

if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    logger.info(f"Serving static files from: {static_dir}")

    # SPA Catch-all: If a route doesn't match an API endpoint or a static file, serve index.html
    # This enables React Router to handle client-side routing.
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        index_path = os.path.join(static_dir, "index.html")
        if os.path.exists(index_path):
             return FileResponse(index_path)
        return JSONResponse({"error": "Frontend not found"}, status_code=404)

else:
    logger.warning(f"Static directory not found at {static_dir}. Frontend will not be served.")





# --- Execution Entry Point ---

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )
