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
from pydantic import BaseModel, Field
from typing import Optional
import logging

from app.services.ai_service import get_ai_service, AIVisualizationService, AIRequest, ColumnMetadata
from app.services.ai_graph import VisualizationSuggestion as GraphSuggestion, fetch_provider_models
from app.services.data_service import get_data_service
from app.models.schemas import APIResponse, VisualizationConfig

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
            - models: Available models
            - description: Provider description

    Example response:
        ```json
        {
          "success": true,
          "data": [
            {
              "id": "openai",
              "name": "OpenAI",
              "models": ["gpt-4", "gpt-3.5-turbo"],
              "description": "OpenAI GPT models"
            }
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
    and returns models available to the user. Falls back to the hardcoded
    catalog on failure.

    Args:
        provider: AI provider identifier ("gemini", "openai", or "claude").
        request: Request body containing the provider API key.

    Returns:
        APIResponse with list of model dicts (id, name, description).
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
        HTTPException 401: Invalid API key
        HTTPException 429: API rate limit exceeded
        HTTPException 500: AI provider error

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
        # Build AI request
        # available_viz_types uses default from schema
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
        
        # Provide more helpful error messages for common failures
        error_msg = str(e).lower()
        if "api key" in error_msg or "authentication" in error_msg or "unauthorized" in error_msg:
            raise HTTPException(status_code=401, detail="Invalid API key. Please check your API key and try again.")
        elif "rate limit" in error_msg or "quota" in error_msg:
            raise HTTPException(status_code=429, detail="API rate limit exceeded. Please wait and try again.")
        elif "model" in error_msg and "not found" in error_msg:
            raise HTTPException(status_code=400, detail="AI model not available. Please try a different provider.")
        else:
            raise HTTPException(status_code=500, detail=f"AI suggestion failed: {str(e)}")


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
        description="User's description of what to compute"
    )


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
        HTTPException 401: Invalid API key
        HTTPException 429: API rate limit exceeded
        HTTPException 500: AI generation error

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
        
        # Provide helpful error messages
        error_msg = str(e).lower()
        if "api key" in error_msg or "authentication" in error_msg or "unauthorized" in error_msg:
            raise HTTPException(status_code=401, detail="Invalid API key. Please check your API key and try again.")
        elif "rate limit" in error_msg or "quota" in error_msg:
            raise HTTPException(status_code=429, detail="API rate limit exceeded. Please wait and try again.")
        else:
            raise HTTPException(status_code=500, detail=f"Formula generation failed: {str(e)}")

