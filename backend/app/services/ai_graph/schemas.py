"""
Strict Pydantic schemas for LangGraph AI visualization workflow.

These schemas enforce comprehensive validation rules to ensure
that generated suggestions are correct and usable.
"""

import re
from typing import Literal, Optional, Any, get_args
from pydantic import BaseModel, Field, field_validator, model_validator
from typing_extensions import TypedDict


# Workflow stage identifiers. Used as the discriminator field on
# ``SuggestionGraphState`` and as routing keys in ``graph.create_suggestion_graph``.
# Promoted from bare ``str`` so a typo in a router function fails the
# type-checker rather than silently routing to END.
WorkflowStage = Literal[
    "generate",
    "agent_loop",
    "validate_schema",
    "validate_columns",
    "validate_formulas",
    "correct",
    "retry",
    "done",
]

# Reasoning effort accepted across providers. Empty string represents
# "no explicit effort" — kept for the TypedDict default-empty path.
ReasoningEffort = Literal["low", "medium", "high", ""]


# Word-boundary patterns for the title/reasoning "no AI-talk" validators.
# These rules used to be plain substring matches, which produced real
# false-positives against industrial vocabulary — "Cracker Campaign KPI
# Summary" was rejected because "campa**ai**gn" contains "ai". The substrings
# in the values below are the actual intent.
#
# - 'ai' is matched as a *whole word* only (`\bai\b`). A prefix match would
#   wrongly trigger on real titles like "Air Pressure", "Aircommendation",
#   "Aim Profile", "Aid Distribution".
# - The other terms use a prefix match (`\b<word>\w*`) so derived forms are
#   still caught: "Generated"/"Generation", "Suggestion"/"Suggestions",
#   "Recommended"/"Recommendation".
_FORBIDDEN_TITLE_PATTERNS: dict[str, re.Pattern] = {
    'ai': re.compile(r'\bai\b', re.IGNORECASE),
    'suggested': re.compile(r'\bsuggest\w*', re.IGNORECASE),
    'generated': re.compile(r'\bgenerat\w*', re.IGNORECASE),
    'recommend': re.compile(r'\brecommend\w*', re.IGNORECASE),
}

# Reasoning-text rules use multi-word phrases. Word boundaries on both sides
# prevent "the airfield" from triggering "the ai".
_FORBIDDEN_REASONING_PHRASES = (
    'i think', 'i suggest', 'i recommend', 'the ai', 'this ai',
    'my analysis', 'i believe', 'in my opinion',
)
_FORBIDDEN_REASONING_PATTERNS = {
    p: re.compile(r'\b' + re.escape(p) + r'\b', re.IGNORECASE)
    for p in _FORBIDDEN_REASONING_PHRASES
}


# ============= Visualization Types =============

# Supported visualization types in the FlowMeter application.
# Each type has specific requirements for x_axis and y_axes:
#   - universal: General multi-series plots, requires x_axis and 1+ y_axes
#   - area: Stacked area charts, requires x_axis and 1+ y_axes
#   - hist: Histograms, requires x_axis (numeric)
#   - box: Box plots, requires 1+ y_axes (numeric)
#   - regression: ML regression analysis, requires x_axis and 1+ y_axes (numeric)
#   - pca: Principal Component Analysis, requires x_axis and 3+ y_axes (numeric)
#   - formula: Custom calculated fields, requires formula config (y_axes auto-generated)
#   - correlation: Correlation heatmap, requires 3+ y_axes (x_axis can be empty)
#   - fft: FFT Power Spectrum, requires x_axis and 1+ y_axes (numeric)
#   - root_cause: Root Cause Analysis, requires 3+ y_axes (numeric, for causal analysis)
VizType = Literal[
    "universal",
    "area",
    "hist",
    "box",
    "regression",
    "pca",
    "formula",
    "correlation",
    "fft",
    "root_cause",
    "kpi",
]

# Single source of truth for runtime use (state init, AIRequest default,
# anywhere a list[str] of viz types is needed). Derives from VizType so
# adding a new variant only requires editing the Literal above.
ALL_VIZ_TYPES: list[str] = list(get_args(VizType))

# Allowed KPI aggregation operations exposed to the AI suggestion path.
KPIOperation = Literal[
    "sum", "avg", "min", "max", "median", "count", "first", "last", "std", "formula"
]

# Plot types for individual series in universal visualizations.
# These are intentionally lowercase to match frontend/backend SeriesConfiguration.
# The "line+scatter" type renders both connected lines and point markers.
SeriesPlotType = Literal["line", "scatter", "step", "bar", "line+scatter"]


# ============= Validation Result =============

class ValidationError(BaseModel):
    """A single validation error with field context and suggested fix.

    Used by validators to report specific issues with visualization
    suggestions, including guidance on how to resolve the error.

    Attributes:
        field: The field name that failed validation (e.g., "x_axis", "y_axes").
        error: Human-readable description of what went wrong.
        suggestion: Optional guidance on how to fix the error.
    """
    field: str = Field(..., description="Field that failed validation")
    error: str = Field(..., description="Description of the error")
    suggestion: str = Field(default="", description="Suggested fix")


class ValidationResult(BaseModel):
    """Aggregated result of validating a visualization suggestion.

    Collects all validation errors from multiple validation steps
    into a single result object. The is_valid flag indicates whether
    the suggestion passed all validation checks.

    Attributes:
        is_valid: True if no errors were recorded, False otherwise.
        errors: List of all validation errors encountered.

    Example:
        >>> result = ValidationResult()
        >>> result.add_error("x_axis", "Column not found", "Did you mean 'temp'?")
        >>> result.is_valid
        False
    """
    is_valid: bool = Field(default=True)
    errors: list[ValidationError] = Field(default_factory=list)

    def add_error(self, field: str, error: str, suggestion: str = "") -> None:
        """Add a validation error and mark the result as invalid.

        Args:
            field: The field name that failed validation.
            error: Description of the validation failure.
            suggestion: Optional guidance on how to fix the error.
        """
        self.is_valid = False
        self.errors.append(ValidationError(field=field, error=error, suggestion=suggestion))


# ============= Formula Config =============

class FormulaConfig(BaseModel):
    """Configuration for formula-based visualizations.

    Stores a Python expression that computes a derived column from
    existing dataset columns. The expression must assign to a result
    variable and use the ``col['column_name']`` syntax for column access.

    Note:
        The field is named ``input`` to match the app's models.schemas.FormulaConfig
        schema for consistency across the codebase.

    Attributes:
        input: Python formula expression that computes a result.
            Must assign to ``result`` (or ``result1``, ``result2`` for multiple).
            Access columns via ``col['column_name']``.

    Example:
        >>> config = FormulaConfig(input="result = col['temp'] * 1.8 + 32")
        >>> # Converts temperature from Celsius to Fahrenheit
    """
    input: str = Field(default="", description="Python formula expression (e.g., result = col['A'] + col['B'])")

    @field_validator('input')
    @classmethod
    def validate_input(cls, v: str) -> str:
        """Perform basic syntax validation on the formula expression.

        Checks that the expression contains at least one mathematical
        operator. Full validation (AST parsing, safety, columns) is
        performed by the formula_validator module.

        Args:
            v: The formula expression string.

        Returns:
            The validated expression string.

        Raises:
            ValueError: If the expression contains no operators.
        """
        if v and not any(c in v for c in ['=', '+', '-', '*', '/', '(', ')']):
            raise ValueError("Formula must contain at least one operator")
        return v


# ============= KPI Metric Suggestion =============

class KPIMetricSuggestion(BaseModel):
    """A single KPI metric proposed by the AI (no client-side id yet)."""
    label: str = Field(..., min_length=1, max_length=80, description="Card label, e.g. 'Total Energy'")
    operation: KPIOperation = Field(..., description="Aggregation: sum, avg, min, max, median, count, first, last, std, or formula")
    column: Optional[str] = Field(default=None, description="Source column (required unless operation == 'formula')")
    formula: Optional[str] = Field(default=None, description="Custom formula using col[...], np, pd (required when operation == 'formula')")
    unit: Optional[str] = Field(default=None, max_length=16, description="Unit suffix, e.g. 'kWh', '°C', '%'")
    decimals: int = Field(default=2, ge=0, le=6, description="Decimal places to display")

    @model_validator(mode='after')
    def _check_required(self) -> 'KPIMetricSuggestion':
        if self.operation == 'formula':
            if not self.formula or not self.formula.strip():
                raise ValueError("KPI formula metric requires 'formula'")
        else:
            if not self.column:
                raise ValueError(f"KPI metric with operation '{self.operation}' requires 'column'")
        return self


# ============= Reference Line Suggestion =============

class ReferenceLineSuggestion(BaseModel):
    """A single horizontal reference line proposed by the AI.

    Reference lines mark significant values on the y-axis (spec/safety
    limits, targets, statistical landmarks like medians or thresholds).
    Converted server-side into the app's ``Threshold`` model, with id,
    color, and shaded-area defaults applied during conversion.

    Attributes:
        label: Short legend label for the line (e.g. "Upper Spec Limit",
            "Target 95%", "Mean").
        value: Numeric y-value where the line is drawn.
        axis: Which y-axis the value belongs to — "left" (primary, default)
            or "right" (secondary). Must agree with the unit of the value.
    """
    label: str = Field(..., min_length=1, max_length=80, description="Short legend label")
    value: float = Field(..., description="Numeric y-value where the line is drawn")
    axis: Literal["left", "right"] = Field(
        default="left",
        description="Which y-axis the value is on: 'left' (primary) or 'right' (secondary)",
    )


# ============= Additional Config =============

class AdditionalConfig(BaseModel):
    """Additional configuration options for visualizations.

    Provides optional settings that modify how specific visualization
    types are rendered, including regression overlays, PCA parameters,
    confidence intervals, custom formula expressions, secondary-axis
    assignments, and reference lines.

    Attributes:
        add_regression: If True, add a regression trend line to the plot.
        regression_degree: Polynomial degree for regression (1=linear, 2-5=polynomial).
        pca_components: Number of principal components to compute (2-10).
        show_confidence_interval: If True, show confidence bands on regression.
        formula: FormulaConfig for formula-type visualizations.
        kpi_metrics: KPI cards for kpi viz type.
        series_axis_assignments: Optional map of ``y_axes`` column name →
            "left" or "right". Series not listed default to "left". Use
            "right" when a series has a different unit or scale than the
            others (e.g. plotting Temperature °C against Pressure bar).
        reference_lines: Optional list of horizontal reference lines.
            Useful for spec/safety limits, targets, alarm thresholds, or
            statistical landmarks discovered during inspection.

    Example:
        >>> config = AdditionalConfig(
        ...     add_regression=True,
        ...     regression_degree=2,
        ...     show_confidence_interval=True
        ... )
    """
    add_regression: bool = Field(default=False, description="Add regression line to plot")
    regression_degree: int = Field(default=1, ge=1, le=5, description="Polynomial regression degree (1-5)")
    pca_components: int = Field(default=2, ge=2, le=10, description="Number of PCA components")
    show_confidence_interval: bool = Field(default=False, description="Show confidence interval bands")
    formula: Optional[FormulaConfig] = Field(default=None, description="Formula configuration for formula viz type")
    kpi_metrics: Optional[list[KPIMetricSuggestion]] = Field(
        default=None,
        description="KPI metrics for kpi viz type. Each entry becomes one card.",
    )
    series_axis_assignments: Optional[dict[str, Literal["left", "right"]]] = Field(
        default=None,
        description=(
            "Map of y_axes column name to 'left' or 'right'. Use 'right' "
            "for series whose unit/scale differs from the rest. Series not "
            "listed default to 'left'."
        ),
    )
    reference_lines: Optional[list[ReferenceLineSuggestion]] = Field(
        default=None,
        description=(
            "Horizontal reference lines for spec/safety limits, targets, "
            "or statistical landmarks. Each line has a label, value, and axis."
        ),
    )

    @field_validator('formula', mode='before')
    @classmethod
    def normalize_formula(cls, v):
        """Normalize formula input to FormulaConfig objects.

        The AI sometimes generates formula as a raw string or nested dict
        instead of a proper FormulaConfig. This validator normalizes all
        supported formats to a consistent FormulaConfig instance.

        Supported input formats:
            - None: Returns None
            - str: Raw formula string, wrapped in FormulaConfig
            - dict with 'input' key: Extracts input value
            - dict with 'formula' key: Extracts formula value
            - FormulaConfig: Returns as-is

        Args:
            v: The raw formula input in various formats.

        Returns:
            FormulaConfig instance or None.
        """
        if v is None:
            return None
        if isinstance(v, str):
            # AI provided a raw formula string - wrap in FormulaConfig
            return FormulaConfig(input=v)
        if isinstance(v, dict):
            # Dict with 'input' key or just 'formula' key
            if 'input' in v:
                return FormulaConfig(input=v['input'])
            if 'formula' in v:
                return FormulaConfig(input=v['formula'])
            # Empty dict
            return None
        return v


# ============= Main Suggestion Schema =============

class VisualizationSuggestion(BaseModel):
    """A single visualization suggestion generated by the AI.

    This schema enforces strict validation rules to ensure suggestions
    are complete, professional, and technically correct before being
    rendered or exported to reports.

    Validation rules enforced:
        - **title**: Descriptive (5-100 chars), no AI-related terms
        - **description**: Explains value (10-300 chars)
        - **viz_type**: Must be a valid VizType enum value
        - **reasoning**: Professional language, no first-person or AI mentions
        - **viz_type requirements**: Each type has specific x_axis/y_axes requirements

    Note:
        Column existence validation is performed separately by the validators
        module, as it requires access to the dataset column list.

    Attributes:
        title: Descriptive chart title in Title Case.
        description: One-line explanation of visualization purpose.
        viz_type: Type of visualization to render.
        x_axis: Column name for X axis (empty allowed for correlation).
        y_axes: Column names for Y axis (empty allowed for formula).
        legend_labels: Custom display names for legend items.
        x_label: X-axis label with units.
        y_label: Y-axis label with units.
        plot_type: Series plot type for universal charts.
        confidence: AI confidence score (0.0-1.0).
        reasoning: Professional technical note for exported reports.
        additional_config: Optional configuration (regression, PCA, formula).
    """
    
    title: str = Field(
        ..., 
        min_length=5, 
        max_length=100,
        description="Descriptive chart title in Title Case"
    )
    description: str = Field(
        ..., 
        min_length=10, 
        max_length=300,
        description="One-line explanation of what this visualization shows"
    )
    viz_type: VizType = Field(
        ...,
        description="Type of visualization"
    )
    x_axis: str = Field(
        ...,
        min_length=0,  # Allow empty for correlation type
        description="Column name for X axis (can be empty for correlation)"
    )
    y_axes: list[str] = Field(
        ...,
        min_length=0,  # Allow empty for formula type
        description="Column name(s) for Y axis (can be empty for formula)"
    )
    legend_labels: list[str] = Field(
        default=[],
        description="Custom names for legend items matching y_axes order (e.g. 'Efficiency' instead of 'kpi_eff_v2')"
    )
    x_label: str = Field(
        default="",
        max_length=100,
        description="X-axis label with units (e.g., 'Time (hours)')"
    )
    y_label: str = Field(
        default="",
        max_length=100,
        description="Y-axis label with units (e.g., 'Temperature (°C)')"
    )
    y2_label: str = Field(
        default="",
        max_length=100,
        description=(
            "Secondary (right) Y-axis label with units. Only meaningful when "
            "additional_config.series_axis_assignments routes at least one "
            "series to 'right'. Empty otherwise."
        ),
    )
    plot_type: SeriesPlotType = Field(
        default="line",
        description="Plot type for universal charts: line, scatter, step, bar, or line+scatter"
    )
    
    @field_validator('plot_type', mode='before')
    @classmethod
    def normalize_plot_type(cls, v):
        """Normalize empty or None plot_type to default 'line'.

        Args:
            v: The plot_type value from AI output.

        Returns:
            The normalized plot type, defaulting to 'line' if empty.
        """
        if v == "" or v is None:
            return "line"
        return v
    
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Confidence score from 0.0 to 1.0"
    )
    reasoning: str = Field(
        ...,
        min_length=20,
        max_length=800,  # Increased from 500 - LLMs write detailed explanations
        description="Professional technical note for exported reports"
    )
    additional_config: AdditionalConfig = Field(
        default_factory=AdditionalConfig,
        description="Additional configuration options"
    )
    
    @field_validator('title')
    @classmethod
    def validate_title(cls, v: str) -> str:
        """Validate that title is professional and doesn't mention AI.

        Ensures titles are suitable for exported reports by rejecting
        terms that reveal AI generation or break professional tone.

        Args:
            v: The title string to validate.

        Returns:
            The validated title string.

        Raises:
            ValueError: If title contains forbidden AI-related terms.
        """
        for word, pattern in _FORBIDDEN_TITLE_PATTERNS.items():
            if pattern.search(v):
                raise ValueError(f"Title should not mention '{word}' - be professional")
        return v

    @field_validator('reasoning')
    @classmethod
    def validate_reasoning(cls, v: str) -> str:
        """Validate that reasoning text is professional and export-ready.

        Ensures reasoning is written in third-person professional language
        suitable for technical reports. Rejects first-person pronouns and
        AI self-references that would reveal automated generation.

        Args:
            v: The reasoning text to validate.

        Returns:
            The validated reasoning string.

        Raises:
            ValueError: If reasoning contains unprofessional phrases.
        """
        for phrase, pattern in _FORBIDDEN_REASONING_PATTERNS.items():
            if pattern.search(v):
                raise ValueError(f"Reasoning should be professional - avoid '{phrase}'")
        return v
    
    @model_validator(mode='after')
    def validate_viz_type_requirements(self) -> 'VisualizationSuggestion':
        """Validate visualization-type specific structural requirements.

        Enforces the minimum requirements for each visualization type:
            - Most types require a non-empty x_axis (except correlation)
            - PCA and correlation require 3+ y_axes
            - Regression requires 1+ y_axes
            - Formula requires a formula expression in additional_config
            - Other types (universal, area, hist, box) require 1+ y_axes

        Returns:
            The validated VisualizationSuggestion instance.

        Raises:
            ValueError: If the suggestion doesn't meet viz_type requirements.
        """
        # x_axis requirements - correlation, root_cause and kpi don't need x_axis
        if self.viz_type not in ('correlation', 'root_cause', 'kpi') and not self.x_axis:
            raise ValueError(f"{self.viz_type} requires an x_axis column")

        # y_axes requirements vary by viz_type
        if self.viz_type == 'pca' and len(self.y_axes) < 3:
            raise ValueError("PCA requires at least 3 variables in y_axes")
        if self.viz_type == 'correlation' and len(self.y_axes) < 3:
            raise ValueError("Correlation requires at least 3 variables in y_axes")
        if self.viz_type == 'root_cause' and len(self.y_axes) < 3:
            raise ValueError("Root Cause Analysis requires at least 3 numeric variables in y_axes")
        if self.viz_type == 'regression' and len(self.y_axes) < 1:
            raise ValueError("Regression requires at least 1 predictor in y_axes")
        if self.viz_type == 'fft' and len(self.y_axes) < 1:
            raise ValueError("FFT requires at least 1 numeric signal in y_axes")
        # formula type doesn't require y_axes - it generates its own data
        if self.viz_type == 'formula':
            if not self.additional_config or not self.additional_config.formula or not self.additional_config.formula.input:
                raise ValueError("Formula visualization requires a formula in additional_config.formula.input")
        elif self.viz_type == 'kpi':
            if not self.additional_config or not self.additional_config.kpi_metrics:
                raise ValueError("KPI visualization requires at least one entry in additional_config.kpi_metrics")
        elif self.viz_type not in ('pca', 'correlation', 'root_cause', 'regression', 'fft') and len(self.y_axes) < 1:
            # universal, area, hist, box require at least 1 y_axis
            raise ValueError(f"{self.viz_type} requires at least 1 variable in y_axes")

        # Cross-validate series_axis_assignments: every key must reference a
        # column actually listed in y_axes, otherwise the assignment is a
        # silent no-op at conversion time. Also, secondary-axis routing only
        # makes sense for chart types with per-series rendering.
        cfg = self.additional_config
        if cfg and cfg.series_axis_assignments:
            invalid = [k for k in cfg.series_axis_assignments if k not in self.y_axes]
            if invalid:
                raise ValueError(
                    f"series_axis_assignments references columns not in y_axes: {invalid}"
                )
            if self.viz_type not in ('universal', 'area', 'regression', 'formula', 'fft'):
                raise ValueError(
                    f"series_axis_assignments is not supported for viz_type '{self.viz_type}'"
                )

        # Reference lines only make sense on plot types with a real y-axis.
        # PCA, correlation, root_cause, and KPI render either a matrix, a
        # scatter on PC space, or cards — a horizontal reference line has
        # no defined meaning there.
        if cfg and cfg.reference_lines:
            if self.viz_type in ('pca', 'correlation', 'root_cause', 'kpi'):
                raise ValueError(
                    f"reference_lines is not supported for viz_type '{self.viz_type}'"
                )

        return self


# ============= Graph State =============

class SuggestionGraphState(TypedDict, total=False):
    """State container for the LangGraph visualization suggestion workflow.

    This TypedDict defines the complete state passed through the LangGraph
    workflow nodes. It includes input parameters, intermediate processing
    data, output results, and control flow state.

    State sections:
        **Input**: Parameters provided when invoking the workflow
        **Processing**: Derived data computed during execution
        **Output**: Generated and validated suggestions
        **Control**: Workflow control flow state

    Attributes:
        columns: Input column metadata as list of dicts with name, type, etc.
        guidance_text: User's analysis goals in free text.
        available_viz_types: List of visualization types to consider.
        existing_visualizations: Titles of existing charts to avoid duplicates.
        max_suggestions: Maximum number of suggestions to generate.
        api_key: API key for the AI provider.
        provider: AI provider name (openai, anthropic, etc.).
        model: Optional model name override.
        valid_column_names: Set of all column names for validation.
        numeric_columns: Set of numeric column names.
        datetime_columns: Set of datetime column names.
        categorical_columns: Set of categorical column names.
        suggestions: Raw suggestions parsed from LLM response.
        validated_suggestions: Suggestions that passed all validation.
        validation_errors: Error messages from validation failures.
        failed_suggestions: Suggestions that failed validation, for retry.
        retry_count: Current retry attempt number.
        max_retries: Maximum allowed retry attempts.
        current_stage: Current workflow stage identifier.
    """
    # Input
    columns: list[dict]  # Column metadata
    guidance_text: str
    available_viz_types: list[str]
    existing_visualizations: list[str]
    max_suggestions: int
    api_key: str
    provider: str
    model: str
    effort: ReasoningEffort

    # Processing
    valid_column_names: set[str]
    numeric_columns: set[str]
    datetime_columns: set[str]
    categorical_columns: set[str]

    # Output
    suggestions: list[dict]  # Raw suggestions from LLM
    validated_suggestions: list[VisualizationSuggestion]
    validation_errors: list[str]
    failed_suggestions: list[dict]  # Suggestions that failed validation, for correction

    # Control
    retry_count: int
    max_retries: int
    current_stage: WorkflowStage

    # Observability (populated by graph nodes; drained by run_suggestion_workflow)
    # Each entry is {input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens}
    # — numeric only, no prompt text.
    usage_records: list[dict]

    # Tool-use mode (privacy OFF). When dataset_access is True the workflow
    # routes through agent_loop_node instead of generate_suggestions_node;
    # the LLM may issue tool calls against the bound DataFrame inspection
    # tools and iterate until producing the final suggestions JSON.
    dataset_access: bool
    dataframe: Any  # pd.DataFrame; Any to avoid pulling pandas into this module
    tool_iterations: int  # number of agent↔tool round trips taken
    tool_calls_made: int  # total individual tool calls executed (telemetry)
    # Per-request override for the agent-loop iteration cap. When omitted,
    # the workflow falls back to the module-level default. Surfaced in the
    # API/UI so users can trade latency for thoroughness on slow providers.
    max_tool_iterations: int
    # Per-request override for the per-chunk idle timeout (seconds) wrapping
    # the streaming ainvoke. Resets on every chunk, so a long-but-progressing
    # response is never killed; only a true stall fires. Optional — when
    # omitted, ainvoke_timeout_s() picks the right default based on effort
    # and tool binding.
    idle_timeout_s: float


# ============= Column Metadata =============

class ColumnMetadata(BaseModel):
    """Rich metadata for a single column/variable in the dataset.

    Provides comprehensive information about a dataset column including
    its semantic meaning, data type, unit of measurement, analytical role,
    and statistical summary. This metadata is used by the AI to generate
    appropriate visualization suggestions.

    Attributes:
        name: The exact column name as it appears in the dataset.
        description: User-provided semantic description explaining what
            the column represents (e.g., "Reactor inlet temperature").
        data_type: Classification as "numeric", "datetime", or "categorical".
        unit: Unit of measurement if applicable (e.g., "°C", "kg/h", "bar").
        role: Analytical role in the data:
            - "target": Dependent variable to predict/analyze
            - "feature": Independent variable/predictor
            - "timestamp": Time index for time series
            - "identifier": Row identifier (not for analysis)
        stats: Statistical summary dict with keys: min, max, mean, std, count.

    Example:
        >>> meta = ColumnMetadata(
        ...     name="temperature",
        ...     description="Reactor core temperature",
        ...     data_type="numeric",
        ...     unit="°C",
        ...     role="target",
        ...     stats={"min": 150.0, "max": 450.0, "mean": 300.0, "std": 50.0}
        ... )
    """
    name: str = Field(..., description="Column name from the dataset")
    description: str = Field(..., description="User-provided semantic description")
    data_type: Literal["numeric", "datetime", "categorical"] = Field(
        ...,
        description="Data type classification"
    )
    unit: str = Field(default="", description="Unit of measurement")
    role: Literal["target", "feature", "timestamp", "identifier", ""] = Field(
        default="",
        description="Role in analysis"
    )
    stats: Optional[dict[str, Any]] = Field(
        default=None,
        description="Statistical summary: {min, max, mean, std, count}"
    )
