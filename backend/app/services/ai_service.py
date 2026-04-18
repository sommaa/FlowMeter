"""AI Visualization Service - orchestrator for AI-powered chart suggestions.

This module provides the main interface for generating visualization suggestions
using large language models (OpenAI, Anthropic Claude, Google Gemini). It uses
a LangGraph workflow that includes:

1. Structured generation with JSON schema validation
2. Column existence validation against the actual dataset
3. Formula syntax validation for computed columns
4. Automatic retry/correction loops when validation fails

The service converts AI suggestions into VisualizationConfig objects that can
be directly rendered by the frontend.
"""
import os
import uuid
import asyncio
from typing import Optional
import logging

from .ai_graph import (
    run_suggestion_workflow,
    VisualizationSuggestion as GraphSuggestion,
    get_chat_model,
)
from pydantic import BaseModel, Field
from app.models.schemas import (
    VisualizationConfig,
    VisualizationType,
    AxisConfig,
    RegressionConfig,
    PCAConfig,
    StyleConfig,
    LegendConfig,
    LimitConfig,
    FormulaConfig,
    SeriesConfiguration,
    PlotType,
    KPIConfig,
    KPIMetric,
)

logger = logging.getLogger(__name__)


def _get_debug_level() -> int:
    """Get debug level from AI_DEBUG_LEVEL environment variable.

    Returns:
        Integer debug level (0=off, 1=basic, 2=verbose). Defaults to 0.
    """
    try:
        return int(os.environ.get("AI_DEBUG_LEVEL", "0"))
    except ValueError:
        return 0


def _debug_log(message: str, min_level: int = 1) -> None:
    """Log debug message if AI_DEBUG_LEVEL is high enough.

    Args:
        message: Message to log with [AI-SVC] prefix.
        min_level: Minimum debug level required to show this message.
    """
    if _get_debug_level() >= min_level:
        print(f"[AI-SVC] {message}")


# ============= Request Schemas =============

class ColumnMetadata(BaseModel):
    """Rich metadata for a single column/variable in the dataset."""
    name: str = Field(..., description="Column name from the dataset")
    description: str = Field(..., description="User-provided semantic description of the variable")
    data_type: str = Field(..., description="Data type: 'numeric', 'datetime', or 'categorical'")
    unit: str = Field(default="", description="Unit of measurement (e.g., '°C', 'kg/h')")
    role: str = Field(default="", description="Role: 'target', 'feature', 'timestamp', 'identifier', or empty")
    stats: Optional[dict] = Field(default=None, description="Statistical summary: {min, max, mean, std, count}")


class AIRequest(BaseModel):
    """Request payload for AI visualization suggestions.

    Contains dataset metadata and user guidance to help the AI generate
    relevant visualization recommendations.

    Attributes:
        columns: List of column metadata including names, types, and descriptions.
        guidance_text: User's free-form description of what they want to analyze.
        available_viz_types: List of visualization types the AI can suggest.
        existing_visualizations: Titles of existing visualizations to avoid duplicates.
        max_suggestions: Maximum number of suggestions to generate (1-10).
        model: Optional model name to override the default for the provider.
    """
    columns: list[ColumnMetadata] = Field(..., description="List of column metadata with descriptions")
    guidance_text: str = Field(..., description="User's free-form description of analysis goals")
    available_viz_types: list[str] = Field(
        default=["universal", "area", "hist", "box", "regression", "pca", "formula", "correlation"],
        description="List of supported visualization types"
    )
    existing_visualizations: list[str] = Field(default=[], description="Titles of existing visualizations to avoid duplicates")
    max_suggestions: int = Field(default=5, ge=1, le=10, description="Maximum number of suggestions to generate")
    model: Optional[str] = Field(default=None, description="Optional model name override for the AI provider")
    effort: Optional[str] = Field(default=None, description="Reasoning effort level: 'low', 'medium', or 'high'")


class AIVisualizationService:
    """Service for AI-powered visualization suggestions.

    Orchestrates the LangGraph workflow for generating, validating, and
    converting visualization suggestions from large language models.

    The workflow includes:
        - Structured output generation with JSON schema enforcement
        - Schema validation against Pydantic models
        - Column existence validation against actual dataset columns
        - Formula syntax validation for computed columns
        - Automatic retry with correction prompts on validation failure

    Supported providers: OpenAI (GPT-4), Anthropic (Claude), Google (Gemini)
    """

    def __init__(self):
        """Initialize the AI visualization service."""
        pass

    def get_available_providers(self) -> list[dict]:
        """Get list of available AI providers.

        Returns:
            List of provider dicts, each containing:
                - id: Provider identifier (gemini, openai, claude)
                - name: Human-readable name
        """
        return [
            {"id": "gemini", "name": "Google Gemini"},
            {"id": "openai", "name": "OpenAI ChatGPT"},
            {"id": "claude", "name": "Anthropic Claude"},
        ]
    

    
    async def suggest_visualizations(
        self,
        request: AIRequest,
        provider_name: str,
        api_key: str
    ) -> list[GraphSuggestion]:
        """
        Generate visualization suggestions using the specified provider.
        
        Uses LangGraph workflow for robust validation and correction.
        
        Args:
            request: AIRequest with column metadata and user goals
            provider_name: 'gemini', 'openai', or 'claude'
            api_key: API key for the provider
            
        Returns:
            List of validated GraphSuggestion objects
        """
        logger.info(f"AI: Generating suggestions via {provider_name} (LangGraph)")
        return await self._suggest_with_langgraph(request, provider_name, api_key)
    
    async def _suggest_with_langgraph(
        self,
        request: AIRequest,
        provider_name: str,
        api_key: str
    ) -> list[GraphSuggestion]:
        """
        Generate suggestions using LangGraph workflow.
        The workflow handles:
        1. Structured generation
        2. Schema validation
        3. Column existence checks
        4. Formula validation
        5. Automatic retry/correction
        """
        _debug_log(f"Service: Starting LangGraph workflow", min_level=1)
        _debug_log(f"  Provider: {provider_name}", min_level=1)
        _debug_log(f"  Model: {request.model or 'default'}", min_level=1)
        _debug_log(f"  Columns: {len(request.columns)}", min_level=1)
        _debug_log(f"  Max suggestions: {request.max_suggestions}", min_level=1)
        
        # Convert ColumnMetadata to dict format for the graph
        columns = [
            {
                "name": col.name,
                "description": col.description or "",
                "data_type": col.data_type,
                "unit": col.unit or "",
                "role": col.role or "",
            }
            for col in request.columns
        ]
        
        _debug_log(f"  Column breakdown:", min_level=2)
        for col in columns[:5]:  # Limit to first 5
            _debug_log(f"    - {col['name']} ({col['data_type']})", min_level=2)
        if len(columns) > 5:
            _debug_log(f"    ... and {len(columns) - 5} more", min_level=2)
        
        # Get existing viz titles to avoid duplicates
        existing = [v for v in (request.existing_visualizations or [])]
        if existing:
            _debug_log(f"  Existing visualizations to avoid: {len(existing)}", min_level=2)
        
        try:
            # Run the LangGraph workflow
            validated_suggestions, errors = await run_suggestion_workflow(
                columns=columns,
                guidance_text=request.guidance_text,
                api_key=api_key,
                provider=provider_name,
                model=request.model,
                effort=request.effort,
                available_viz_types=request.available_viz_types,
                existing_visualizations=existing,
                max_suggestions=request.max_suggestions
            )
            
            _debug_log(f"Service: Workflow completed", min_level=1)
            _debug_log(f"  Validated suggestions: {len(validated_suggestions)}", min_level=1)
            _debug_log(f"  Validation errors: {len(errors)}", min_level=1)
            
            if errors:
                logger.warning(f"AI: Workflow had {len(errors)} validation errors: {errors[:3]}")
                for i, err in enumerate(errors[:5]):
                    _debug_log(f"    Error {i+1}: {err}", min_level=2)
            
            _debug_log(f"Service: Returning {len(validated_suggestions)} validated suggestions", min_level=2)
            for i, s in enumerate(validated_suggestions):
                _debug_log(f"  [{i+1}] {s.title} ({s.viz_type})", min_level=2)
            
            return validated_suggestions
            
        except Exception as e:
            logger.error(f"AI: LangGraph workflow failed: {e}")
            _debug_log(f"Service: WORKFLOW FAILED - {str(e)}", min_level=1)
            raise  # Re-raise to let caller handle
    
    def suggestion_to_config(self, suggestion: GraphSuggestion) -> VisualizationConfig:
        """
        Convert an AI suggestion to a full VisualizationConfig.
        
        Creates a complete config object with sensible defaults
        for all fields not specified by the AI.
        
        Args:
            suggestion: GraphSuggestion (VisualizationSuggestion) from LangGraph workflow
            
        Returns:
            VisualizationConfig ready to be used by the frontend
        """
        config_id = f"ai-{str(uuid.uuid4())[:8]}"
        
        # Map viz_type string to enum
        try:
            viz_type = VisualizationType(suggestion.viz_type)
        except ValueError:
            viz_type = VisualizationType.UNIVERSAL
        
        # Map plot_type string (lowercase from AI) to PlotType enum (capitalized in app)
        # AI uses: "line", "scatter", "step", "bar", "line+scatter"
        # App uses: "Line", "Scatter", "Line + Scatter"
        plot_type_mapping = {
            "line": PlotType.LINE,
            "scatter": PlotType.SCATTER,
            "line+scatter": PlotType.LINE_SCATTER,
            # step and bar are valid for SeriesConfiguration but not for PlotType enum
            # They fallback to LINE for multi_axis_plot_type
            "step": PlotType.LINE,
            "bar": PlotType.LINE,
        }
        plot_type = plot_type_mapping.get(suggestion.plot_type, PlotType.LINE)
        
        # Build axis config using AI-provided labels
        axis = AxisConfig(
            x_axis=suggestion.x_axis,
            y_axis=suggestion.y_axes,
            x_label=suggestion.x_label if suggestion.x_label else suggestion.x_axis,
            y_label=suggestion.y_label if suggestion.y_label else (suggestion.y_axes[0] if len(suggestion.y_axes) == 1 else "Value"),
            multi_axis_plot_type=plot_type
        )
        
        # Build series_configs for universal plots
        # Access typed AdditionalConfig fields directly
        add_config = suggestion.additional_config
        series_configs = {}
        if viz_type == VisualizationType.UNIVERSAL:
            for i, y_var in enumerate(suggestion.y_axes):
                series_configs[y_var] = SeriesConfiguration(
                    type=suggestion.plot_type if suggestion.plot_type else "line",
                    y_axis_id="left",
                    color=None,
                    show_regression=add_config.add_regression if add_config else False,
                    show_confidence_interval=add_config.show_confidence_interval if add_config else False,
                    regression_color=None,
                    remove_outliers=False,
                    degree=add_config.regression_degree if add_config else 1
                )
        
        # Build regression config if applicable
        regression = RegressionConfig(added=False)
        if viz_type == VisualizationType.REGRESSION:
            regression.added = True
            regression.degree = add_config.regression_degree if add_config else 1
            regression.predictors = suggestion.y_axes
        elif add_config and add_config.add_regression:
            regression.added = True
            regression.degree = add_config.regression_degree
        
        # Build PCA config if applicable
        pca = PCAConfig(components=2, show_loadings=True)
        if viz_type == VisualizationType.PCA:
            pca.components = add_config.pca_components if add_config else min(len(suggestion.y_axes), 3)
        
        # Build style config
        style = StyleConfig(
            color_index=0,
            alpha=0.8,
            colormap="RdBu",
            custom_colors=None,
            enable_stacking=False
        )
        
        # Build formula config if applicable
        formula_config = FormulaConfig()
        if viz_type == VisualizationType.FORMULA:
            # Get formula from additional_config if available
            if add_config and add_config.formula and add_config.formula.input:
                formula_config = FormulaConfig(input=add_config.formula.input)

        # Build KPI config if applicable
        kpi_config = KPIConfig()
        if viz_type == VisualizationType.KPI and add_config and add_config.kpi_metrics:
            kpi_config = KPIConfig(
                metrics=[
                    KPIMetric(
                        id=str(uuid.uuid4()),
                        label=m.label,
                        operation=m.operation,
                        column=m.column,
                        formula=m.formula,
                        unit=m.unit,
                        decimals=m.decimals,
                    )
                    for m in add_config.kpi_metrics
                ]
            )

        # Create the config with all required fields
        config = VisualizationConfig(
            id=config_id,
            title=suggestion.title,
            viz_type=viz_type,
            axis=axis,
            legend=LegendConfig(labels=suggestion.legend_labels if suggestion.legend_labels else None),
            style=style,
            limits=LimitConfig(),
            regression=regression,
            pca=pca,
            formula=formula_config,
            kpi=kpi_config,
            series_configs=series_configs,
            notes=suggestion.reasoning if suggestion.reasoning else None
        )

        return config
    
    def suggestions_to_configs(self, suggestions: list[GraphSuggestion]) -> list[VisualizationConfig]:
        """
        Convert multiple AI suggestions to VisualizationConfig objects.
        
        Args:
            suggestions: List of GraphSuggestion (VisualizationSuggestion) objects
            
        Returns:
            List of VisualizationConfig objects
        """
        return [self.suggestion_to_config(s) for s in suggestions]


# Singleton instance
_ai_service: Optional[AIVisualizationService] = None


def get_ai_service() -> AIVisualizationService:
    """Get the global AI visualization service instance."""
    global _ai_service
    if _ai_service is None:
        _ai_service = AIVisualizationService()
    return _ai_service
