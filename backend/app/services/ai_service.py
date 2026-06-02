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
import logging
import re
import uuid
from typing import Optional

import pandas as pd
from pydantic import BaseModel, ConfigDict, Field

from app.models.schemas import (
    VisualizationConfig,
    VisualizationType,
    AxisConfig,
    RegressionConfig,
    PCAConfig,
    StyleConfig,
    LegendConfig,
    LimitConfig,
    Threshold,
    FormulaConfig,
    SeriesConfiguration,
    PlotType,
    KPIConfig,
    KPIMetric,
)

from .ai_graph import (
    run_suggestion_workflow,
    VisualizationSuggestion as GraphSuggestion,
    ALL_VIZ_TYPES,
    AIErrorClass,
    AIProviderError,
    AIProviderTimeout,
    AIInvalidKey,
    AIRateLimited,
    AIQuotaExceeded,
    AIProviderUnavailable,
    AIInvalidOutput,
)
from .ai_graph._debug import debug_log as _debug_log, get_debug_level as _get_debug_level
from .ai_graph.errors import (
    _classify_exception,
    _extract_retry_after_s,
    classify_and_wrap,
)
from .ai_graph.schemas import ColumnMetadata


logger = logging.getLogger(__name__)


# Public surface of this module. Besides the service itself, ``ai_service``
# acts as a small facade that re-exports the typed-error model and a few
# debug/classifier helpers from ``ai_graph`` so callers (``api/ai.py``) and
# the test suite can import them from one place. Declaring them here keeps
# that intent explicit and stops linters from flagging the re-exports as
# "unused imports."
__all__ = [
    # Service entry points
    "AIVisualizationService",
    "get_ai_service",
    "AIRequest",
    "ColumnMetadata",
    # Prompt-sanitization helpers (exercised directly by tests)
    "_sanitize_user_text",
    "_MAX_GUIDANCE_CHARS",
    "_MAX_DESCRIPTION_CHARS",
    # Debug helpers re-exported from ai_graph
    "_debug_log",
    "_get_debug_level",
    # Typed-error surface re-exported from ai_graph (used by api/ai.py + tests)
    "classify_and_wrap",
    "_classify_exception",
    "_extract_retry_after_s",
    "AIErrorClass",
    "AIProviderError",
    "AIProviderTimeout",
    "AIInvalidKey",
    "AIRateLimited",
    "AIQuotaExceeded",
    "AIProviderUnavailable",
    "AIInvalidOutput",
]


# Control characters that would let user input break prompt structure or
# confuse the tokenizer. We keep newlines and tabs; strip everything else
# in the C0/C1 ranges.
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")
# More than 2 consecutive newlines collapse to 2.
_MULTI_NEWLINE_RE = re.compile(r"\n{3,}")

# Hard caps applied AFTER sanitization. The Pydantic ``max_length`` on the
# API boundary already enforces these on raw input, but any future transform
# that could grow the string (Unicode normalization, character substitution
# with longer replacements) would bypass that cap. These post-sanitization
# truncations are defense-in-depth so the value handed to the prompt
# templates is always within bounds. Numbers match the API-layer caps.
_MAX_GUIDANCE_CHARS = 2000
_MAX_DESCRIPTION_CHARS = 500


def _sanitize_user_text(text: str, max_chars: int = _MAX_GUIDANCE_CHARS) -> str:
    """Neutralize user-supplied text before embedding in an LLM prompt.

    Applied to guidance_text and column descriptions. Prevents the most
    common tag-break injection attempts and strips control characters that
    could interfere with prompt formatting. This is defense-in-depth — the
    system prompt also contains an explicit "treat tagged content as data"
    rule.

    After sanitization the string is hard-truncated to ``max_chars`` so any
    post-validator growth (none today, but a future transform might enlarge
    a substring) cannot exceed the boundary cap.

    Args:
        text: Raw user-supplied string.
        max_chars: Final length cap. Defaults to the guidance cap; pass
            ``_MAX_DESCRIPTION_CHARS`` for column descriptions.

    Returns:
        Sanitized, length-capped string safe to interpolate inside
        <user_guidance> or <column_description> XML blocks.
    """
    if not text:
        return ""
    sanitized = _CONTROL_CHARS_RE.sub("", text)
    sanitized = _MULTI_NEWLINE_RE.sub("\n\n", sanitized)
    # Replace '<' with a visually similar Unicode char only inside potential
    # closing tags for the wrapping elements we use. This avoids a user
    # closing <user_guidance> prematurely.
    sanitized = sanitized.replace("</user_guidance>", "‹/user_guidance›")
    sanitized = sanitized.replace("</column_description>", "‹/column_description›")
    if max_chars > 0 and len(sanitized) > max_chars:
        sanitized = sanitized[:max_chars]
    return sanitized


# ============= Request Schemas =============
# ``ColumnMetadata`` lives in ``ai_graph.schemas`` and is imported above —
# single source of truth, with Literal-typed ``data_type`` and ``role``.


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
        dataset_access: When True, the workflow routes through the agent_loop
            node so the LLM can iteratively call read-only DataFrame inspection
            tools. Default False keeps the privacy-preserving metadata-only path.
        dataframe: Pandas DataFrame the bound tools close over. Required when
            ``dataset_access`` is True; never serialized over the wire (the API
            layer fetches it server-side from ``data_service``).
    """
    # Allow pandas.DataFrame to live on the model as an internal handle. It is
    # never serialized — the API layer attaches it after fetching from
    # data_service and the model is consumed in-process by the service layer.
    # ``extra="forbid"`` catches schema-drift at the service boundary —
    # field renames or unmapped frontend keys fail loudly instead of being
    # silently dropped.
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    columns: list[ColumnMetadata] = Field(..., description="List of column metadata with descriptions")
    guidance_text: str = Field(..., description="User's free-form description of analysis goals")
    available_viz_types: list[str] = Field(
        default_factory=lambda: list(ALL_VIZ_TYPES),
        description="List of supported visualization types (defaults to every VizType)"
    )
    existing_visualizations: list[str] = Field(default=[], description="Titles of existing visualizations to avoid duplicates")
    max_suggestions: int = Field(default=5, ge=1, le=10, description="Maximum number of suggestions to generate")
    model: Optional[str] = Field(default=None, description="Optional model name override for the AI provider")
    effort: Optional[str] = Field(default=None, description="Reasoning effort level: 'low', 'medium', or 'high'")
    dataset_access: bool = Field(
        default=False,
        description="If True, allow the AI to query the dataset via read-only tools",
    )
    dataframe: Optional[pd.DataFrame] = Field(
        default=None,
        description="Internal: DataFrame attached by the API layer when dataset_access is True",
        exclude=True,
    )
    max_tool_iterations: Optional[int] = Field(
        default=None,
        ge=1,
        le=30,
        description=(
            "Per-request override for the agent-loop iteration cap. "
            "Only meaningful when dataset_access is True. None uses the "
            "workflow default."
        ),
    )
    idle_timeout_s: Optional[float] = Field(
        default=None,
        ge=10.0,
        le=600.0,
        description=(
            "Per-request override for the streaming idle timeout (seconds). "
            "Resets on every chunk, so a long-but-progressing response is "
            "never killed; only a true stall fires. None uses the default "
            "picked from effort + tool binding."
        ),
    )
    dataset_profile: str = Field(
        default="",
        description=(
            "Pre-rendered markdown dataset profile injected into the prompt on "
            "the metadata-only path. Built by the API layer from the live "
            "DataFrame; empty on the dataset_access path (the agent fetches the "
            "same profile via the overview() tool)."
        ),
    )


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

    Supported providers: OpenAI, Anthropic (Claude), Google (Gemini).
    Specific model names are resolved per-request from each provider's
    live model-listing endpoint.
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
        _debug_log("Service: Starting LangGraph workflow", min_level=1)
        _debug_log(f"  Provider: {provider_name}", min_level=1)
        _debug_log(f"  Model: {request.model or 'default'}", min_level=1)
        _debug_log(f"  Columns: {len(request.columns)}", min_level=1)
        _debug_log(f"  Max suggestions: {request.max_suggestions}", min_level=1)
        
        # Convert ColumnMetadata to dict format for the graph. Sanitize
        # user-supplied description text before it enters the prompt builder.
        columns = [
            {
                "name": col.name,
                "description": _sanitize_user_text(
                    col.description or "", max_chars=_MAX_DESCRIPTION_CHARS
                ),
                "data_type": col.data_type,
                "unit": col.unit or "",
                "role": col.role or "",
            }
            for col in request.columns
        ]
        sanitized_guidance = _sanitize_user_text(
            request.guidance_text, max_chars=_MAX_GUIDANCE_CHARS
        )
        
        _debug_log("  Column breakdown:", min_level=2)
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
                guidance_text=sanitized_guidance,
                api_key=api_key,
                provider=provider_name,
                model=request.model,
                effort=request.effort,
                available_viz_types=request.available_viz_types,
                existing_visualizations=existing,
                max_suggestions=request.max_suggestions,
                dataset_access=request.dataset_access,
                dataframe=request.dataframe,
                max_tool_iterations=request.max_tool_iterations,
                idle_timeout_s=request.idle_timeout_s,
                dataset_profile=request.dataset_profile,
            )
            
            _debug_log("Service: Workflow completed", min_level=1)
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
        
        # Build series_configs for universal plots
        # Access typed AdditionalConfig fields directly
        add_config = suggestion.additional_config
        # Resolve secondary-axis assignments. Keys not present in y_axes are
        # already rejected by the schema validator, so this map is safe to
        # use as a direct lookup.
        axis_map = (add_config.series_axis_assignments or {}) if add_config else {}
        any_right = any(side == "right" for side in axis_map.values())

        # Build axis config using AI-provided labels.
        # ``enable_y2_axis_range`` flips the dual-axis layout on; the actual
        # min/max bounds for the right axis are left as None so Plotly
        # auto-scales them from the data.
        axis = AxisConfig(
            x_axis=suggestion.x_axis,
            y_axis=suggestion.y_axes,
            x_label=suggestion.x_label if suggestion.x_label else suggestion.x_axis,
            y_label=suggestion.y_label if suggestion.y_label else (suggestion.y_axes[0] if len(suggestion.y_axes) == 1 else "Value"),
            multi_axis_plot_type=plot_type,
            enable_y2_axis_range=any_right,
            y2_label=(suggestion.y2_label or "Secondary Axis") if any_right else "Secondary Axis",
        )

        series_configs = {}
        if viz_type == VisualizationType.UNIVERSAL:
            for i, y_var in enumerate(suggestion.y_axes):
                series_configs[y_var] = SeriesConfiguration(
                    type=suggestion.plot_type if suggestion.plot_type else "line",
                    y_axis_id=axis_map.get(y_var, "left"),
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

        # Build LimitConfig from AI-suggested reference lines. The AI provides
        # only label/value/axis; defaults for color and shading match what a
        # user gets when adding a threshold via the UI.
        thresholds: list[Threshold] = []
        if add_config and add_config.reference_lines:
            for rl in add_config.reference_lines:
                thresholds.append(Threshold(
                    id=str(uuid.uuid4()),
                    value=rl.value,
                    label=rl.label,
                    y_axis_id=rl.axis,
                ))

        # Create the config with all required fields
        config = VisualizationConfig(
            id=config_id,
            title=suggestion.title,
            viz_type=viz_type,
            axis=axis,
            legend=LegendConfig(labels=suggestion.legend_labels if suggestion.legend_labels else None),
            style=style,
            limits=LimitConfig(thresholds=thresholds),
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
