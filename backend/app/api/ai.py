"""
FastAPI routes for AI-powered data analysis and visualization.

This module provides REST API endpoints for:
    - AI-powered visualization suggestions using LangGraph workflow
    - Formula generation from natural language descriptions
    - Multi-provider support (OpenAI, Google Gemini, Anthropic Claude)
    - Configuration validation and conversion

The AI service uses a structured workflow to:
1. Analyze dataset structure and statistics
2. Generate contextual visualization recommendations
3. Validate and score suggestions
4. Convert to frontend-compatible configurations

Endpoints are grouped under the "AI" tag in OpenAPI docs.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import Optional
import logging

# Input-size caps for AI request bodies. These prevent accidentally or
# maliciously large prompts from blowing up token budgets. Values picked to
# comfortably fit legitimate use while bounding worst-case token cost.
_MAX_GUIDANCE_CHARS = 2000
_MAX_COLUMN_DESCRIPTION_CHARS = 500
_MAX_COLUMN_NAME_CHARS = 200
_MAX_COLUMNS = 200
_MAX_FORMULA_DESCRIPTION_CHARS = 2000

from app.services.ai_service import (
    get_ai_service,
    AIVisualizationService,
    AIRequest,
    ColumnMetadata,
    classify_and_wrap,
)
from app.services.ai_graph import (
    VisualizationSuggestion as GraphSuggestion,
    fetch_provider_models,
    AIErrorClass,
    AIProviderError,
    ERROR_CLASS_TO_HTTP,
)
from app.services.ai_metrics import build_aggregates, compute_cost_usd, get_collector
from app.services.data_service import get_data_service
from app.models.schemas import APIResponse, VisualizationConfig


def _ai_error_detail(exc: AIProviderError) -> dict:
    """Shape an AIProviderError into the structured ``detail`` payload.

    The FastAPI ``HTTPException(detail=...)`` bubbles up as JSON under
    ``detail``. We put the typed fields there so the frontend can branch on
    ``error_class`` without string-matching the free-form ``message``.
    """
    return {
        "error_class": exc.error_class.value,
        "message": exc.message,
        "provider": exc.provider,
        "retry_advised": bool(exc.retry_advised),
        "retry_after_s": exc.retry_after_s,
    }

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI"])


class SuggestRequest(BaseModel):
    """Request for AI visualization suggestions."""
    dataset_id: str = Field(..., description="ID of the loaded dataset")
    provider: str = Field(..., description="AI provider: 'gemini', 'openai', or 'claude'")
    api_key: str = Field(..., description="API key for the selected provider")
    model: str = Field(..., description="Model to use (e.g. 'gpt-4o', 'claude-sonnet-4-6')")
    effort: Optional[str] = Field(None, description="Reasoning effort: 'low', 'medium', or 'high'")
    column_descriptions: dict[str, str] = Field(
        ...,
        description="Map of column_name -> description (required for all columns)"
    )
    guidance_text: str = Field(
        ...,
        max_length=_MAX_GUIDANCE_CHARS,
        description="User's free-form description of analysis goals"
    )
    existing_visualization_titles: list[str] = Field(
        default=[],
        description="Titles of existing visualizations to avoid duplicates"
    )
    max_suggestions: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Maximum number of suggestions"
    )

    @field_validator("column_descriptions")
    @classmethod
    def _check_column_descriptions_size(cls, v: dict[str, str]) -> dict[str, str]:
        if len(v) > _MAX_COLUMNS:
            raise ValueError(f"Too many columns: {len(v)} (max {_MAX_COLUMNS})")
        for name, desc in v.items():
            if len(name) > _MAX_COLUMN_NAME_CHARS:
                raise ValueError(
                    f"Column name too long: {len(name)} chars (max {_MAX_COLUMN_NAME_CHARS})"
                )
            if len(desc) > _MAX_COLUMN_DESCRIPTION_CHARS:
                raise ValueError(
                    f"Description for column '{name[:50]}' too long: "
                    f"{len(desc)} chars (max {_MAX_COLUMN_DESCRIPTION_CHARS})"
                )
        return v


class ApplySuggestionsRequest(BaseModel):
    """Request to convert AI suggestions to VisualizationConfig objects."""
    suggestions: list[dict] = Field(..., description="List of GraphSuggestion objects as dicts")


@router.get("/providers", response_model=APIResponse)
async def list_providers():
    """List available AI providers and their capabilities.

    Returns:
        APIResponse with data containing list of providers:
            - id: Provider identifier ("openai", "gemini", "claude")
            - name: Display name

    The available models for each provider are fetched separately via
    ``POST /ai/providers/{provider}/models`` once an API key is supplied.

    Example response:
        ```json
        {
          "success": true,
          "data": [
            {"id": "openai", "name": "OpenAI ChatGPT"},
            {"id": "gemini", "name": "Google Gemini"},
            {"id": "claude", "name": "Anthropic Claude"}
          ]
        }
        ```
    """
    ai_service = get_ai_service()
    providers = ai_service.get_available_providers()
    return APIResponse(success=True, data=providers)


class FetchModelsRequest(BaseModel):
    """Request body for dynamic model fetching."""
    api_key: str = Field(..., description="API key for the provider")


@router.post("/providers/{provider}/models", response_model=APIResponse)
async def fetch_models(provider: str, request: FetchModelsRequest):
    """Fetch available models from a provider's API in real-time.

    Queries the provider's model-listing endpoint using the supplied API key
    and returns models available to the user. On failure, returns an empty
    list with ``fetched=false`` and the error message in ``error``; there is
    no static fallback catalog.

    Args:
        provider: AI provider identifier ("gemini", "openai", or "claude").
        request: Request body containing the provider API key.

    Returns:
        APIResponse whose ``data`` is ``{models, fetched, error}``:
            - models: list of ``{id, name, description}`` dicts
            - fetched: True on a successful provider call, False otherwise
            - error: provider error message when ``fetched`` is False
    """
    if provider not in ("gemini", "openai", "claude"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid provider '{provider}'. Must be 'gemini', 'openai', or 'claude'"
        )

    if not request.api_key or not request.api_key.strip():
        raise HTTPException(status_code=400, detail="API key is required")

    models, error = await fetch_provider_models(provider, request.api_key.strip())
    return APIResponse(
        success=True,
        data={"models": models, "fetched": error is None, "error": error},
    )


@router.post("/suggest", response_model=APIResponse)
async def suggest_visualizations(request: SuggestRequest):
    """Generate AI-powered visualization suggestions using LangGraph workflow.

    Analyzes the dataset structure, statistics, and user guidance to produce
    contextually relevant visualization recommendations. Uses a multi-step
    LangGraph workflow: context gathering → suggestion generation → validation.

    Request body:
        - dataset_id: Loaded dataset identifier
        - provider: AI provider ("openai", "gemini", "claude")
        - api_key: Provider API key (not stored)
        - model: Optional specific model override
        - column_descriptions: Map of column → description (ALL columns required)
        - guidance_text: Natural language analysis goals
        - existing_visualization_titles: Avoid duplicate suggestions
        - max_suggestions: Number of suggestions to generate (1-10)

    Returns:
        APIResponse with data containing:
            - suggestions: List of GraphSuggestion objects
            - provider: Provider used
            - count: Number of suggestions generated

    Each suggestion includes:
        - title: Descriptive chart title
        - viz_type: Visualization type
        - x_axis, y_axis: Column selections
        - confidence: Confidence score (0-1)
        - reasoning: Explanation of why this viz was suggested

    Raises:
        HTTPException 404: Dataset not found
        HTTPException 400: Invalid provider, missing descriptions, or empty guidance
        HTTPException 401: Invalid API key (``error_class=invalid_key``)
        HTTPException 422: Schema retries exhausted (``error_class=invalid_output``)
        HTTPException 429: Rate-limit / quota (``error_class=rate_limit|quota_exceeded``)
        HTTPException 502: Provider unavailable (``error_class=provider_unavailable``)
        HTTPException 504: Provider timeout (``error_class=timeout``)
        HTTPException 500: Other AI provider error (``error_class=unknown``)

    On any of the AI-typed errors above, the response ``detail`` is a
    structured object: ``{error_class, message, provider, retry_advised,
    retry_after_s}`` so the frontend can branch on ``error_class`` instead
    of parsing the message string.

    Example request:
        ```json
        {
          "dataset_id": "abc123",
          "provider": "openai",
          "api_key": "sk-...",
          "column_descriptions": {
            "temperature": "Reactor temperature in °C",
            "pressure": "Reactor pressure in bar"
          },
          "guidance_text": "I want to analyze the relationship between temperature and pressure",
          "max_suggestions": 3
        }
        ```
    """
    data_service = get_data_service()
    ai_service = get_ai_service()
    
    # Validate dataset exists
    metadata = data_service.get_metadata(request.dataset_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Validate provider
    if request.provider not in ["gemini", "openai", "claude"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid provider '{request.provider}'. Must be 'gemini', 'openai', or 'claude'"
        )
    
    # Validate API key is provided
    if not request.api_key or not request.api_key.strip():
        raise HTTPException(status_code=400, detail="API key is required")
    
    # Validate guidance text
    if not request.guidance_text or not request.guidance_text.strip():
        raise HTTPException(status_code=400, detail="Guidance text is required")
    
    # Validate all columns have descriptions
    missing_descriptions = [
        col for col in metadata.column_names 
        if col not in request.column_descriptions or not request.column_descriptions[col].strip()
    ]
    if missing_descriptions:
        # Show first 5 missing columns
        shown = missing_descriptions[:5]
        remaining = len(missing_descriptions) - 5
        detail = f"Missing descriptions for columns: {shown}"
        if remaining > 0:
            detail += f" and {remaining} more"
        raise HTTPException(status_code=400, detail=detail)
    
    # Get statistics for richer context
    stats = data_service.get_statistics(request.dataset_id)
    stats_map = {s.column: s.dict() for s in stats}
    
    # Build column metadata
    columns = []
    for col in metadata.column_names:
        data_type = (
            "datetime" if col in metadata.datetime_columns else
            "numeric" if col in metadata.numeric_columns else
            "categorical"
        )
        columns.append(ColumnMetadata(
            name=col,
            description=request.column_descriptions[col],
            data_type=data_type,
            stats=stats_map.get(col)
        ))
    
    try:
        # Build AI request — `available_viz_types` defaults to every VizType
        # via AIRequest's default_factory, which derives from the schema.
        ai_request = AIRequest(
            columns=columns,
            guidance_text=request.guidance_text,
            existing_visualizations=request.existing_visualization_titles,
            max_suggestions=request.max_suggestions,
            model=request.model,
            effort=request.effort,
        )
        
        # Get suggestions
        suggestions = await ai_service.suggest_visualizations(
            request=ai_request,
            provider_name=request.provider,
            api_key=request.api_key
        )
        
        return APIResponse(
            success=True,
            data={
                "suggestions": [s.dict() for s in suggestions],
                "provider": request.provider,
                "count": len(suggestions)
            }
        )
        
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Provider dependency not installed: {str(e)}"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"AI suggestion failed: {e}", exc_info=True)

        # Classify into a typed AIProviderError, then map error_class → status.
        wrapped = classify_and_wrap(e, provider=request.provider)
        status = ERROR_CLASS_TO_HTTP.get(wrapped.error_class, 500)
        raise HTTPException(status_code=status, detail=_ai_error_detail(wrapped))


@router.get("/metrics", response_model=APIResponse)
async def ai_metrics(limit: int = 50):
    """Return recent AI suggestion metrics with aggregate statistics.

    Records are purely numeric/categorical — no prompt text, column
    descriptions, or user guidance is captured (Sprint 2 guarantee).

    Args:
        limit: Maximum number of recent records to return (default 50).

    Returns:
        APIResponse with:
            - records: Most-recent-first list of AIMetricsRecord dicts (with
              a ``cost_usd`` field attached when a price row exists).
            - aggregates: p50/p95 latency (ms), success_rate,
              ``by_provider`` token totals, and ``total_cost_usd`` (nullable).
    """
    collector = get_collector()
    effective_limit = max(1, min(int(limit), 500))
    recent = collector.recent(effective_limit)

    rows = []
    for r in recent:
        d = r.to_dict()
        d["cost_usd"] = compute_cost_usd(r)
        rows.append(d)

    return APIResponse(
        success=True,
        data={
            "records": rows,
            "aggregates": build_aggregates(recent),
        },
    )


@router.post("/apply-suggestions", response_model=APIResponse)
async def apply_suggestions(request: ApplySuggestionsRequest):
    """Convert AI suggestions to full VisualizationConfig objects.

    Takes raw GraphSuggestion objects from the /suggest endpoint and
    converts them to complete VisualizationConfig schemas with all
    default values populated (colors, styling, regression settings, etc.).

    Request body:
        - suggestions: List of GraphSuggestion dict objects

    Returns:
        APIResponse with data containing:
            - configurations: List of VisualizationConfig dicts
            - converted_count: Number successfully converted
            - errors: List of conversion errors (if any)

    Example request:
        ```json
        {
          "suggestions": [
            {
              "title": "Temperature vs Pressure",
              "viz_type": "scatter",
              "x_axis": "temperature",
              "y_axis": ["pressure"],
              "confidence": 0.95,
              "reasoning": "Strong correlation expected"
            }
          ]
        }
        ```
    """
    ai_service = get_ai_service()
    
    configs = []
    errors = []
    
    for i, suggestion_dict in enumerate(request.suggestions):
        try:
            suggestion = GraphSuggestion(**suggestion_dict)
            config = ai_service.suggestion_to_config(suggestion)
            configs.append(config.dict())
        except Exception as e:
            errors.append({"index": i, "error": str(e)})
            logger.warning(f"Failed to convert suggestion {i}: {e}")
    
    return APIResponse(
        success=True,
        data={
            "configurations": configs,
            "converted_count": len(configs),
            "errors": errors if errors else None
        }
    )


class FormulaGenerateApiRequest(BaseModel):
    """Request for AI formula generation."""
    provider: str = Field(..., description="AI provider: 'gemini', 'openai', or 'claude'")
    api_key: str = Field(..., description="API key for the selected provider")
    model: str = Field(..., description="Model to use (e.g. 'gpt-4o', 'claude-sonnet-4-6')")
    effort: Optional[str] = Field(None, description="Reasoning effort: 'low', 'medium', or 'high'")
    columns: list[dict] = Field(
        ...,
        description="List of column info: [{name, description, data_type, stats}]"
    )
    description: str = Field(
        ...,
        max_length=_MAX_FORMULA_DESCRIPTION_CHARS,
        description="User's description of what to compute"
    )

    @field_validator("columns")
    @classmethod
    def _check_columns_size(cls, v: list[dict]) -> list[dict]:
        if len(v) > _MAX_COLUMNS:
            raise ValueError(f"Too many columns: {len(v)} (max {_MAX_COLUMNS})")
        return v


@router.post("/generate-formula", response_model=APIResponse)
async def generate_formula_endpoint(request: FormulaGenerateApiRequest):
    """Generate Python formula code from natural language description.

    Uses AI to convert a natural language description into executable
    Python code for creating computed columns. The formula uses
    `col['ColumnName']` syntax compatible with pandas eval/apply.

    Request body:
        - provider: AI provider ("openai", "gemini", "claude")
        - api_key: Provider API key (not stored)
        - model: Optional specific model override
        - columns: List of column metadata dicts with:
            - name: Column name
            - description: Column meaning/units
            - data_type: "numeric", "datetime", or "categorical"
            - stats: Optional statistical summary
        - description: Natural language formula description

    Returns:
        APIResponse with data containing:
            - formula: Generated Python expression
            - provider: Provider used

    Raises:
        HTTPException 400: Invalid input or validation failure
        HTTPException 401: Invalid API key (``error_class=invalid_key``)
        HTTPException 422: Schema retries exhausted (``error_class=invalid_output``)
        HTTPException 429: Rate-limit / quota (``error_class=rate_limit|quota_exceeded``)
        HTTPException 502: Provider unavailable (``error_class=provider_unavailable``)
        HTTPException 504: Provider timeout (``error_class=timeout``)
        HTTPException 500: Other AI generation error (``error_class=unknown``)

    On any of the AI-typed errors above, the response ``detail`` follows the
    same structured shape as ``/ai/suggest``.

    Example request:
        ```json
        {
          "provider": "openai",
          "api_key": "sk-...",
          "columns": [
            {
              "name": "flow_rate",
              "description": "Volumetric flow in m³/h",
              "data_type": "numeric"
            },
            {
              "name": "density",
              "description": "Fluid density in kg/m³",
              "data_type": "numeric"
            }
          ],
          "description": "Calculate mass flow rate in kg/h"
        }
        ```

    Example response:
        ```json
        {
          "success": true,
          "data": {
            "formula": "col['flow_rate'] * col['density']",
            "provider": "openai"
          }
        }
        ```
    """
    from app.services.ai_graph import generate_formula, ColumnInfo
    
    # Validate provider
    if request.provider not in ["gemini", "openai", "claude"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid provider '{request.provider}'. Must be 'gemini', 'openai', or 'claude'"
        )
    
    # Validate API key
    if not request.api_key or not request.api_key.strip():
        raise HTTPException(status_code=400, detail="API key is required")
    
    # Validate description
    if not request.description or not request.description.strip():
        raise HTTPException(status_code=400, detail="Description is required")
    
    # Validate columns
    if not request.columns or len(request.columns) == 0:
        raise HTTPException(status_code=400, detail="At least one column must be provided")
    
    try:
        # Convert to ColumnInfo objects
        columns = []
        for col_dict in request.columns:
            columns.append(ColumnInfo(
                name=col_dict.get("name", ""),
                description=col_dict.get("description", ""),
                data_type=col_dict.get("data_type", "numeric"),
                stats=col_dict.get("stats")
            ))
        
        # Generate formula
        formula = await generate_formula(
            provider_name=request.provider,
            api_key=request.api_key,
            columns=columns,
            description=request.description,
            model=request.model,
            effort=request.effort
        )
        
        return APIResponse(
            success=True,
            data={
                "formula": formula,
                "provider": request.provider
            }
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Formula generation failed: {e}", exc_info=True)

        wrapped = classify_and_wrap(e, provider=request.provider)
        status = ERROR_CLASS_TO_HTTP.get(wrapped.error_class, 500)
        raise HTTPException(status_code=status, detail=_ai_error_detail(wrapped))

