"""
FastAPI routes for runtime application settings.

Currently exposes the formula-sandbox opt-out so the desktop client can read
and toggle whether user/template formulas are allowed to run outside the safe
whitelist. The setting is process-global runtime state (see
``app.services.formula_safety``); the frontend persists the user's choice in
localStorage and re-pushes it on startup.

Endpoints are grouped under the "Settings" tag in OpenAPI docs.
"""
from fastapi import APIRouter
from pydantic import BaseModel

from app.models.schemas import APIResponse
from app.services.formula_safety import is_unsafe_allowed, set_unsafe_allowed

router = APIRouter(tags=["Settings"])


class SecuritySettings(BaseModel):
    """Security-related runtime settings."""
    allow_unsafe_formulas: bool


@router.get("/security", response_model=APIResponse)
async def get_security_settings():
    """Return the current security settings (formula-sandbox opt-out state)."""
    return APIResponse(
        success=True,
        data={"allow_unsafe_formulas": is_unsafe_allowed()},
    )


@router.put("/security", response_model=APIResponse)
async def update_security_settings(settings: SecuritySettings):
    """Enable or disable the formula sandbox at runtime.

    Setting ``allow_unsafe_formulas`` to True disables the sandbox: user- and
    template-supplied formulas then run with real builtins (arbitrary code
    execution). Intended for the single-user, local desktop use case where the
    user trusts their own templates.
    """
    set_unsafe_allowed(settings.allow_unsafe_formulas)
    return APIResponse(
        success=True,
        message=(
            "Formula sandbox disabled"
            if settings.allow_unsafe_formulas
            else "Formula sandbox enabled"
        ),
        data={"allow_unsafe_formulas": is_unsafe_allowed()},
    )
