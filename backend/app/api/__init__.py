"""
API package - Route handlers.
"""
from fastapi import APIRouter

# Create main API router
api_router = APIRouter(prefix="/api/v1")

# Import routers after creating api_router to avoid circular imports
from app.api import data, visualizations, templates, reconciliation, ai

# Include sub-routers
api_router.include_router(data.router, prefix="/data", tags=["Data"])
api_router.include_router(visualizations.router, prefix="/visualizations", tags=["Visualizations"])
api_router.include_router(templates.router, prefix="/templates", tags=["Templates"])
api_router.include_router(reconciliation.router, tags=["Reconciliation"])
api_router.include_router(ai.router, tags=["AI"])

__all__ = ['api_router']

