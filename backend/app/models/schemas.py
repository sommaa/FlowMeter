"""
Pydantic models for data validation and API serialization.

This module defines the complete schema hierarchy for the application:

**Core Data Models:**
    - DatasetMetadata: Dataset information (columns, types, row count)
    - ColumnStatistics: Statistical summaries per column
    - GlobalVariable: Computed column definitions (formulas)
    - StorylineEvent: Timeline annotations

**Visualization Configuration:**
    - VisualizationConfig: Complete visualization definition
    - AxisConfig: Axis settings (ranges, scales, labels)
    - RegressionConfig: ML model configuration
    - StyleConfig: Visual styling (colors, opacity, stacking)
    - LimitConfig: Threshold lines and shaded regions
    - FFTConfig: Frequency analysis settings
    - RootCauseConfig: Causality analysis settings
    - FormulaConfig: Custom formula evaluation

**API Request/Response Models:**
    - APIResponse: Standard JSON response wrapper
    - PlotDataRequest/Response: Visualization data exchange
    - ReconciliationRequest/Response: Data reconciliation
    - ExportSettings: HTML report configuration
    - TemplateConfig: Dashboard template persistence
    - SaveModelRequest: Regression model persistence

**Data Exchange:**
    - PlotDataSeries: Time series data for frontend charts
    - PlotDataResponse: Complete chart data with metadata

All models use Pydantic v2 for validation, serialization, and
automatic OpenAPI documentation generation.

Enums define allowed values for categorical fields (VisualizationType,
PlotType, SeriesRenderType, etc.) ensuring type safety.

Field descriptions use the Field(..., description="...") pattern
for automatic API documentation in FastAPI/OpenAPI.
"""
from pydantic import BaseModel, Field
from typing import Optional, Any, Dict
from enum import Enum
from datetime import datetime


# ============= Enums =============

class VisualizationType(str, Enum):
    """Supported visualization types."""
    UNIVERSAL = "universal"  # General Plot - primary type for line, scatter, bar, step
    AREA = "area"
    HISTOGRAM = "hist"
    BOX = "box"
    REGRESSION = "regression"
    PCA = "pca"
    FORMULA = "formula"
    CORRELATION = "correlation"
    FFT = "fft"
    ROOT_CAUSE = "root_cause"


class PlotType(str, Enum):
    """Plot sub-types for certain visualizations."""
    LINE = "Line"
    SCATTER = "Scatter"
    LINE_SCATTER = "Line + Scatter"


class SeriesRenderType(str, Enum):
    """Explicit render type for plot series - replaces name-based detection."""
    DATA = "data"           # Regular data series
    REGRESSION = "regression"  # Regression/trend line
    CI_LOWER = "ci_lower"   # Confidence interval lower bound
    CI_UPPER = "ci_upper"   # Confidence interval upper bound (fills to lower)
    THRESHOLD = "threshold" # Threshold/limit line


# ============= Nested Config Models =============

class AxisConfig(BaseModel):
    """Configuration for Axes."""
    x_axis: str = "Index"
    x_label: Optional[str] = None
    y_axis: list[str] = []
    y_label: Optional[str] = None
    
    # X-Axis Range
    enable_x_axis_range: bool = False
    x_axis_min: Optional[Any] = None # Union[float, str] - Pydantic Any for simplicity to allow mixed types
    x_axis_max: Optional[Any] = None
    
    # Y-Axis Range
    enable_y_axis_range: bool = False
    y_axis_min: Optional[float] = None
    y_axis_max: Optional[float] = None
    
    # Secondary Y-Axis Range
    enable_y2_axis_range: bool = False
    y2_axis_min: Optional[float] = None
    y2_axis_max: Optional[float] = None
    y2_label: Optional[str] = "Secondary Axis"

    # Axis Scales
    x_axis_scale: str = "linear"  # linear, log
    y_axis_scale: str = "linear"  # linear, log

    multi_axis_plot_type: PlotType = PlotType.LINE

class LegendConfig(BaseModel):
    """Configuration for Legend."""
    labels: Optional[list[str]] = None

class StyleConfig(BaseModel):
    """Configuration for visual styling."""
    color_index: int = 0
    alpha: float = 0.8
    colormap: Optional[str] = "RdBu" # For Heatmaps/Correlation
    custom_colors: Optional[Dict[str, str]] = None
    enable_stacking: bool = False

class Threshold(BaseModel):
    """Configuration for a single threshold line."""
    id: str  # UUID for React keys
    value: float
    label: str
    color: str = "#ef4444"
    show_shaded_area: bool = False
    shaded_area_direction: str = "up" # "up" or "down"
    shaded_area_opacity: float = 0.2
    y_axis_id: str = "left" # "left" or "right"

class LimitConfig(BaseModel):
    """Configuration for threshold limits."""
    thresholds: list[Threshold] = []

class RegressionConfig(BaseModel):
    """Configuration for Regression analysis."""
    added: bool = False
    degree: int = 1
    predictors: Optional[list[str]] = None
    remove_outliers: bool = False
    iqr_multiplier: float = 1.5  # IQR multiplier for outlier removal (bounds = Q1/Q3 ± iqr_multiplier * IQR)
    line_color: Optional[str] = None
    show_confidence_interval: bool = True
    
    # Advanced Model Settings
    model_type: str = "linear"  # linear, ridge, random_forest, custom
    alpha: float = 1.0
    l1_ratio: float = 0.5
    
    # Random Forest Hyperparameters
    rf_n_estimators: Optional[int] = 100
    rf_max_depth: Optional[int] = None
    rf_min_samples_split: Optional[int] = 2
    rf_min_samples_leaf: Optional[int] = 4

    # Custom Formula Settings
    custom_formula: Optional[str] = None
    custom_params: Optional[str] = None # Comma-separated param names
    custom_initial_guesses: Optional[str] = None # Comma-separated float values
    custom_bounds_lower: Optional[str] = None # Comma-separated lower bounds (use -inf for no bound)
    custom_bounds_upper: Optional[str] = None # Comma-separated upper bounds (use inf for no bound)
    
    # Custom Loss / Optimization Method (for Custom Formula & Robust Linear Regression)
    custom_loss: str = "linear" # linear, soft_l1, huber, cauchy, arctan
    custom_method: str = "trf" # lm, trf, dogbox

class PCAConfig(BaseModel):
    """Configuration for PCA."""
    components: int = 2
    show_loadings: bool = True



class FormulaResultConfig(BaseModel):
    """Configuration for a single formula result (result, result1, etc.)."""
    type: str = "line"  # line, scatter, line+scatter
    color: Optional[str] = None
    y_axis_id: str = "left"  # left, right
    show_regression: bool = False
    show_confidence_interval: bool = False
    regression_color: Optional[str] = None
    remove_outliers: bool = False
    marker_symbol: str = "circle"  # circle, square, diamond, triangle-up, triangle-down, cross, x, star, hexagon
    marker_size: Optional[int] = None  # None = auto-calculated based on data density
    marker_filled: bool = True  # False = open/unfilled markers
    line_dash: str = "solid"  # solid, dot, dash, longdash, dashdot, longdashdot
    line_width: Optional[int] = None  # None = default (2px)

class FormulaConfig(BaseModel):
    """Configuration for Formula visualization."""
    input: Optional[str] = None
    x_formula: Optional[str] = None  # Custom X-axis formula
    result_configs: Optional[Dict[str, FormulaResultConfig]] = None  # Per-result configuration
    
    # Global regression settings
    regression_degree: int = 1
    regression_line_color: Optional[str] = None
    
    # Legacy fields (for backward compatibility)
    plot_type: PlotType = PlotType.LINE
    add_regression: bool = False
    regression_remove_outliers: bool = False


class FFTConfig(BaseModel):
    """Configuration for FFT analysis."""
    window_size: Optional[int] = None  # Auto-calculated if None
    overlap: float = 0.5
    window_type: str = "hann"
    detrend: str = "linear"  # linear, constant, none
    frequency_unit: str = "hz"  # hz, cpm, cph
    normalize: bool = False
    x_axis_scale: str = "linear"  # linear, log
    y_axis_scale: str = "log"  # linear, log

class RootCauseConfig(BaseModel):
    """Configuration for Root Cause Analysis."""
    target_variable: Optional[str] = None  # The target variable to analyze
    max_lag: int = 40  # Maximum lag in samples for cross-correlation and Granger
    top_n: int = 15  # Number of top candidates to return
    methods: list[str] = ["pearson", "cross_corr", "mutual_info", "granger"]
    significance_threshold: float = 0.05  # p-value threshold for Granger
    min_correlation: float = 0.1  # Minimum |r| to consider a variable
    include_variables: list[str] = []  # Empty = all numeric columns
    result_plot: str = "ranking"  # ranking, correlation_lag, method_breakdown


class SeriesConfiguration(BaseModel):
    """Configuration for a single data series in a universal plot."""
    type: str = "line"  # line, scatter, step, bar, line+scatter
    y_axis_id: str = "left" # left, right
    color: Optional[str] = None
    show_regression: bool = False
    show_confidence_interval: bool = False
    regression_color: Optional[str] = None
    remove_outliers: bool = False
    degree: int = 1
    bins: Optional[int] = None
    show_kde: bool = False
    marker_symbol: str = "circle"  # circle, square, diamond, triangle-up, triangle-down, cross, x, star, hexagon
    marker_size: Optional[int] = None  # None = auto-calculated based on data density
    marker_filled: bool = True  # False = open/unfilled markers
    line_dash: str = "solid"  # solid, dot, dash, longdash, dashdot, longdashdot
    line_width: Optional[int] = None  # None = default (2px)


# ============= Request/Response Models =============


class FilterRule(BaseModel):
    """A single filter rule for keeping or removing rows based on column values."""
    column: str
    operator: str  # '<', '<=', '>', '>=', '==', '!=', 'contains', 'not_contains'
    value: str  # String that will be cast to appropriate type
    action: str = "remove"  # 'keep' = keep matching rows, 'remove' = remove matching rows


class GlobalVariable(BaseModel):
    """A global computed variable available across all visualizations."""
    name: str  # Variable name (used as column name)
    formula: str  # Formula expression (same syntax as formula plots)
    description: str = ""  # Optional user description
    

class CleaningConfig(BaseModel):
    """Configuration for data cleaning during import."""
    header_row: int = 0
    nan_strategy: str = "none"
    custom_nan_value: Optional[str] = None
    replacements: list[dict[str, str]] = []
    filters: list[FilterRule] = []
    resample_frequency: Optional[str] = None
    aggregation_method: str = "mean"


class DatasetInfo(BaseModel):
    """Information about a loaded dataset."""
    id: str
    name: str
    rows: int
    columns: int
    column_names: list[str]
    numeric_columns: list[str]
    datetime_columns: list[str]
    memory_usage_kb: float
    date_range: Optional[dict[str, str]] = None
    uploaded_at: datetime = Field(default_factory=datetime.now)


class DataStatistics(BaseModel):
    """Statistical summary of data columns."""
    column: str
    count: int
    mean: Optional[float] = None
    std: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None
    median: Optional[float] = None
    q25: Optional[float] = None
    q75: Optional[float] = None


class VisualizationConfig(BaseModel):
    """Configuration for a visualization."""
    id: str
    title: str = "Untitled Visualization"
    viz_type: VisualizationType = VisualizationType.UNIVERSAL
    
    # Nested Configs
    axis: AxisConfig = AxisConfig()
    legend: LegendConfig = LegendConfig()
    style: StyleConfig = StyleConfig()
    limits: LimitConfig = LimitConfig()
    regression: RegressionConfig = RegressionConfig()
    pca: PCAConfig = PCAConfig()
    pca: PCAConfig = PCAConfig()
    formula: FormulaConfig = FormulaConfig()
    fft: FFTConfig = FFTConfig()
    root_cause: RootCauseConfig = RootCauseConfig()
    
    # Universal Plot Config
    series_configs: Dict[str, SeriesConfiguration] = {}
    
    # Multi-axis specific (Top level or own config? Let's keep top for now as it's simple)
    # multi_axis_plot_type moved to AxisConfig
    
    # Notes
    notes: Optional[str] = None
    
    # Filtering
    date_range: Optional[dict[str, str]] = None  # {start: iso_str, end: iso_str}
    
    # Model Persistence
    saved_model_name: Optional[str] = None


class SavedModelInfo(BaseModel):
    name: str
    type: str
    predictors: list[str]
    target: str
    created: str
    r2: Optional[float] = None
    mse: Optional[float] = None


class SaveModelRequest(BaseModel):
    dataset_id: str
    config: VisualizationConfig
    inputs: dict
    name: str
    
    # Y-Axis Range - moved to config.axis, but this request might want to override?
    # Keeping clean: Should use config.axis
    # enable_y_axis_range: bool = False
    # y_axis_min: Optional[float] = None
    # y_axis_max: Optional[float] = None


class PlotDataRequest(BaseModel):
    """Request for generating plot data."""
    dataset_id: str
    config: VisualizationConfig
    global_variables: list[GlobalVariable] = []
    date_range: Optional[dict[str, str]] = None  # Global date filter {start: iso, end: iso}


class PlotDataPoint(BaseModel):
    """A single data point for plotting."""
    x: Any
    y: float
    series: str


class PlotDataSeries(BaseModel):
    """A series of data for plotting."""
    name: str
    data: list[dict[str, Any]]
    color: Optional[str] = None
    type: str = "line"
    y_axis_id: str = "left"  # "left" or "right"
    render_type: SeriesRenderType = SeriesRenderType.DATA  # Explicit render type
    marker_symbol: str = "circle"  # Plotly marker symbol
    marker_size: Optional[int] = None  # None = auto-calculated
    marker_filled: bool = True  # False = open/unfilled markers
    line_dash: str = "solid"  # Plotly line dash style
    line_width: Optional[int] = None  # None = default


class RegressionModel(BaseModel):
    """Regression model parameters for client-side prediction."""
    type: str = "linear"  # "linear", "polynomial", "random_forest"
    degree: int = 1
    intercept: float
    coefficients: list[float]
    predictors: list[str]  # ["x"] or list of column names
    predictor_types: list[str] = [] # "numeric", "datetime"
    
    # Validation Metrics
    equation: Optional[str] = None
    r2: Optional[float] = None
    mse: Optional[float] = None
    mae: Optional[float] = None
    reference_date: Optional[str] = None # ISO string for the 0-point of regression


class PlotDataResponse(BaseModel):
    """Response containing plot data."""
    title: str
    series: list[PlotDataSeries]
    x_label: str
    y_label: str
    regression_line: Optional[PlotDataSeries] = None
    regression_equation: Optional[str] = None
    regression_model: Optional[RegressionModel] = None
    annotations: Optional[list[dict]] = None
    limits: Optional[list[Threshold]] = None
    correlation_matrix: Optional[dict[str, Any]] = None # {x: [], y: [], z: [[...]]}
    root_cause_analysis: Optional[dict[str, Any]] = None  # Root cause analysis results
    
    
class PredictRequest(BaseModel):
    """Request for server-side prediction (e.g. for Random Forest)."""
    dataset_id: str
    config: VisualizationConfig
    inputs: dict[str, float]
    global_variables: list[GlobalVariable] = []


# ============= Reconciliation =============

class ReconciliationConfig(BaseModel):
    """Configuration for data reconciliation."""
    equations: list[str]
    sigma_mode: str = "fixed_all"  # "fixed_all" | "from_config"
    fixed_sigma: float = 1.0
    sigma_values: dict[str, float] = {}
    non_negative: bool = True


class ReconciliationRequest(BaseModel):
    """Request to reconcile a specific dataset."""
    dataset_id: str
    config: ReconciliationConfig


class ReconciliationResult(BaseModel):
    """Result of reconciliation."""
    variable: str
    mean_error: float
    mae: float
    rel_error_pct: float
    std_error: float
    avg_abs_change: float
    max_abs_change: float
    count: int


class ReconciliationResponse(BaseModel):
    """Response containing reconciled data and report."""
    reconciled_file_url: str
    file_name: str
    report: list[ReconciliationResult]


class StorylineEvent(BaseModel):
    """Event in the storyline."""
    id: str
    date: str  # ISO string
    title: str
    description: str
    color: Optional[str] = None  # Optional custom color for chart markers


class TemplateConfig(BaseModel):
    """Template configuration for saving/loading dashboard state."""
    version: str = "1.0"
    created: datetime = Field(default_factory=datetime.now)
    plant_name: str = "Production_Plant"
    comments: Optional[str] = None
    visualizations: list[VisualizationConfig] = []
    reconciliation_config: Optional[ReconciliationConfig] = None
    required_variables: Optional[list[str]] = None
    global_variables: list[GlobalVariable] = []
    storyline_events: list[StorylineEvent] = []
    column_descriptions: Optional[Dict[str, str]] = {}
    ai_guidance_text: Optional[str] = None


class ReportConfig(BaseModel):
    """Configuration for report generation."""
    plant_name: str
    comments: Optional[str] = None
    visualizations: list[VisualizationConfig]
    include_statistics: bool = True


class DataExportSections(BaseModel):
    """Toggleable sections for data export to Excel."""
    original_data: bool = True
    reconciled_variables: bool = True
    global_variables: bool = True
    formula_results: bool = False


class DataExportRequest(BaseModel):
    """Request model for exporting raw data to Excel."""
    dataset_id: str
    date_range: Optional[dict[str, str]] = None
    global_variables: list[GlobalVariable] = []
    formula_visualizations: list[VisualizationConfig] = []
    sections: DataExportSections = DataExportSections()


class ExportSettings(BaseModel):
    """Configuration for dashboard export branding and details."""
    author_name: str = "System User"
    job_title: str = "Process Engineer"
    location: str = "Plant Site"
    logo_base64: Optional[str] = None
    primary_color: str = "#FFD400" # Default Yellow
    secondary_color: str = "#005EB8" # Default Blue


# ============= API Response Models =============

class APIResponse(BaseModel):
    """Standard API response wrapper."""
    success: bool
    message: Optional[str] = None
    data: Optional[Any] = None


class ErrorResponse(BaseModel):
    """Error response model."""
    success: bool = False
    error: str
