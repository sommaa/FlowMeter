/**
 * TypeScript type definitions for the FlowMeter API.
 *
 * Comprehensive type definitions for all API requests, responses, and domain
 * entities used in the FlowMeter application. Organized into logical sections:
 *
 * **Enums and Union Types:**
 * - VisualizationType: Chart type identifiers (universal, area, hist, box, etc.)
 * - PlotType: Rendering modes (Line, Scatter, Line + Scatter)
 * - SeriesRenderType: Series purpose markers (data, regression, ci_lower, ci_upper, threshold)
 *
 * **API Response Types:**
 * - APIResponse: Generic success/error wrapper
 * - ErrorResponse: Error response structure
 *
 * **Data Types:**
 * - DatasetInfo: Uploaded dataset metadata
 * - PlotDataSeries: Time-series data for plotting
 * - RegressionModel: Fitted regression model with coefficients
 * - StatisticsInfo: Dataset statistical summary
 *
 * **Configuration Types:**
 * - VisualizationConfig: Complete visualization configuration
 * - RegressionConfig: Regression analysis settings
 * - FormulaConfig: Custom formula definitions
 * - FFTConfig: FFT analysis parameters
 * - RootCauseConfig: Root cause analysis settings
 *
 * **AI Types:**
 * - AIProvider: AI service identifiers (gemini, openai, claude)
 * - AIVisualizationRequest: AI visualization generation request
 * - AIVisualizationResponse: AI-generated visualizations
 *
 * All types are designed for strict type safety and match the backend API
 * Pydantic schemas defined in `backend/app/models/schemas.py`.
 */

// ============= Enums =============

export type VisualizationType =
  | 'universal'  // General Plot - primary type for line, scatter, bar, step
  | 'area'
  | 'hist'
  | 'box'
  | 'regression'
  | 'pca'
  | 'formula'
  | 'correlation'
  | 'fft'
  | 'root_cause';

export type PlotType = 'Line' | 'Scatter' | 'Line + Scatter';

// Explicit render type for plot series - replaces name-based detection
export type SeriesRenderType = 'data' | 'regression' | 'ci_lower' | 'ci_upper' | 'threshold';

// ============= API Response Types =============

export interface APIResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface ErrorResponse {
  success: false;
  error: string;
  detail?: string;
}

// ============= Data Types =============

export interface DatasetInfo {
  id: string;
  name: string;
  rows: number;
  columns: number;
  column_names: string[];
  numeric_columns: string[];
  datetime_columns: string[];
  memory_usage_kb: number;
  date_range?: {
    start: string;
    end: string;
  };
  uploaded_at: string;
}

export interface DataStatistics {
  column: string;
  count: number;
  mean?: number;
  std?: number;
  min?: number;
  max?: number;
  median?: number;
  q25?: number;
  q75?: number;
}

// ============= Global Variables =============

export interface GlobalVariable {
  name: string;  // Variable name (used as column name)
  formula: string;  // Formula expression (same syntax as formula plots)
  description?: string;  // Optional user description
}

export interface DataPreview {
  columns: string[];
  rows: Record<string, unknown>[];
}

// ============= Visualization Types =============

export interface AxisConfig {
  x_axis: string;
  x_label?: string;
  y_axis: string[];
  y_label?: string;
  enable_x_axis_range?: boolean;
  x_axis_min?: string | number;
  x_axis_max?: string | number;
  enable_y_axis_range: boolean;
  y_axis_min?: number;
  y_axis_max?: number;
  multi_axis_plot_type: PlotType;

  // Secondary Axis
  enable_y2_axis_range?: boolean;
  y2_axis_min?: number;
  y2_axis_max?: number;
  y2_label?: string;

  // Axis Scales
  x_axis_scale?: 'linear' | 'log';
  y_axis_scale?: 'linear' | 'log';
}

export interface LegendConfig {
  labels?: string[];
}

export interface StyleConfig {
  color_index: number;
  alpha: number;
  colormap?: string;
  custom_colors?: Record<string, string>;
  enable_stacking: boolean;
}


export interface Threshold {
  id: string;
  value: number;
  label: string;
  color: string;
  show_shaded_area: boolean;
  shaded_area_direction: 'up' | 'down';
  shaded_area_opacity: number;
  y_axis_id?: 'left' | 'right';
}

export interface LimitConfig {
  thresholds: Threshold[];
}

export interface RegressionConfig {
  added: boolean;
  degree: number;
  predictors?: string[];
  remove_outliers: boolean;
  iqr_multiplier?: number;  // IQR multiplier for outlier removal (default 1.5)
  line_color?: string;
  show_confidence_interval: boolean;

  // Advanced Model Settings
  model_type: string;
  alpha?: number;
  l1_ratio?: number;

  // Random Forest
  rf_n_estimators?: number;
  rf_max_depth?: number;
  rf_min_samples_split?: number;
  rf_min_samples_leaf?: number;

  // Custom Formula
  custom_formula?: string;
  custom_params?: string; // comma sep
  custom_initial_guesses?: string; // comma sep
  custom_bounds_lower?: string; // comma sep, e.g. "0,-inf,0" (use -inf/inf for no bound)
  custom_bounds_upper?: string; // comma sep, e.g. "inf,1,100"

  // Custom Loss / Optimization Method
  custom_loss?: string; // linear, soft_l1, huber, cauchy, arctan
  custom_method?: string; // lm, trf, dogbox
}

export interface PCAConfig {
  components: number;
  show_loadings: boolean;
}



export interface FormulaResultConfig {
  type: 'line' | 'scatter' | 'line+scatter' | 'step' | 'bar';
  color?: string;
  y_axis_id: 'left' | 'right';
  show_regression: boolean;
  show_confidence_interval?: boolean;
  regression_color?: string;
  remove_outliers: boolean;
  marker_symbol?: string;
  marker_size?: number;
  marker_filled?: boolean;
  line_dash?: string;
  line_width?: number;
}

export interface FormulaConfig {
  input?: string;
  x_formula?: string;
  result_configs?: Record<string, FormulaResultConfig>;  // Per-result configuration

  // Global regression settings
  regression_degree: number;
  regression_line_color?: string;

  // Legacy fields
  plot_type: PlotType;
  add_regression: boolean;
  regression_remove_outliers: boolean;
}

export interface FFTConfig {
  window_size?: number; // Optional, auto-calculated if missing
  overlap: number;
  window_type: string;
  detrend: string;
  frequency_unit: string;
  normalize: boolean;
  x_axis_scale: string;
  y_axis_scale: string;
}

export interface RootCauseConfig {
  target_variable?: string;
  max_lag: number;
  top_n: number;
  methods: string[];
  significance_threshold: number;
  min_correlation: number;
  include_variables: string[];
  result_plot: 'ranking' | 'correlation_lag' | 'method_breakdown';
}

export interface SeriesConfiguration {
  type: 'line' | 'scatter' | 'step' | 'bar' | 'line+scatter';
  y_axis_id: 'left' | 'right';
  color?: string;
  show_regression: boolean;
  show_confidence_interval?: boolean;
  regression_color?: string;
  remove_outliers?: boolean;
  degree?: number;
  bins?: number;
  show_kde?: boolean;
  marker_symbol?: string;
  marker_size?: number;
  marker_filled?: boolean;
  line_dash?: string;
  line_width?: number;
}

export interface VisualizationConfig {
  id: string;
  title: string;
  viz_type: VisualizationType;

  // Nested Configs
  axis: AxisConfig;
  legend: LegendConfig;
  style: StyleConfig;
  limits: LimitConfig;
  regression: RegressionConfig;
  pca: PCAConfig;
  formula: FormulaConfig;
  fft: FFTConfig;
  root_cause: RootCauseConfig;
  series_configs?: Record<string, SeriesConfiguration>; // Added

  // Notes
  notes?: string;

  // Filtering
  date_range?: {
    start: string;
    end: string;
  };

  // Model Persistence
  saved_model_name?: string;
}

export interface PlotDataRequest {
  dataset_id: string;
  config: VisualizationConfig;
  global_variables?: GlobalVariable[];
}

// ... (PlotDataPoint, PlotDataSeries, PlotAnnotation, RegressionModel stay the same, but verifying) ...

export interface PlotDataPoint {
  x: string | number;
  y: number;
  series: string; // Updated from PlotDataPoint definition in schemas.py: series: str
}

export interface PlotDataSeries {
  name: string;
  data: PlotDataPoint[];
  color?: string;
  type: string;
  y_axis_id?: 'left' | 'right';
  render_type?: SeriesRenderType;  // Explicit render type for CI/regression identification
  marker_symbol?: string;
  marker_size?: number;
  marker_filled?: boolean;
  line_dash?: string;
  line_width?: number;
}

export interface PlotAnnotation {
  type: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  label?: string;
}

export interface RegressionModel {
  type: string;
  degree: number;
  intercept: number;
  coefficients: number[];
  predictors: string[];
  predictor_types?: string[];
  equation?: string;
  r2?: number;
  mse?: number;
  mae?: number;
  reference_date?: string;
}

export interface PlotDataResponse {
  title: string;
  series: PlotDataSeries[];
  x_label: string;
  y_label: string;
  regression_line?: PlotDataSeries;
  regression_equation?: string;
  regression_model?: RegressionModel;
  annotations?: any[];
  limits?: Threshold[];
  correlation_matrix?: {
    x: string[];
    y: string[];
    z: number[][];
  };
  root_cause_analysis?: {
    target_variable: string;
    target_stats: Record<string, unknown>;
    ranking: Array<{
      variable: string;
      score: number;
      pearson?: number;
      pearson_abs?: number;
      xcorr?: number;
      xcorr_abs?: number;
      lag_samples?: number;
      is_leader?: boolean;
      mutual_info?: number;
      mutual_info_norm?: number;
      granger_type?: string;
      granger_p?: number;
    }>;
    methods_used: string[];
  };
}

// ============= Storyline Types =============

export interface StorylineEvent {
  id: string;
  date: string; // ISO string
  title: string;
  description: string;
  color?: string; // Optional custom color for chart markers
}

// ============= Template Types =============

export interface TemplateConfig {
  version: string;
  created: string;
  plant_name: string;
  comments?: string;
  visualizations: VisualizationConfig[];
  reconciliation_config?: import('./index').ReconciliationConfig;
  required_variables?: string[];
  global_variables?: GlobalVariable[];
  storyline_events?: StorylineEvent[];
  column_descriptions?: Record<string, string>;
  ai_guidance_text?: string;
}

export interface SavedTemplate {
  name: string;
  last_modified: string;
  created: string;
  size_bytes: number;
  required_variables?: string[];
}

// ============= UI State Types =============

export interface VisualizationTypeInfo {
  id: VisualizationType;
  name: string;
  description: string;
}

// ============= Helper to create default config =============

export const createDefaultVisualizationConfig = (id: string): VisualizationConfig => ({
  id,
  title: "New Visualization",
  viz_type: 'universal',
  axis: {
    x_axis: 'Index',
    y_axis: [],
    enable_y_axis_range: false,
    multi_axis_plot_type: 'Line',
    x_axis_scale: 'linear',
    y_axis_scale: 'linear'
  },
  style: {
    color_index: 0,
    alpha: 0.8,
    colormap: 'RdBu',
    enable_stacking: false,
    custom_colors: {}
  },
  legend: {
    labels: []
  },
  limits: {
    thresholds: []
  },
  regression: {
    added: false,
    degree: 1,
    predictors: [],
    remove_outliers: false,
    iqr_multiplier: 1.5,
    show_confidence_interval: true,
    model_type: 'linear',
    alpha: 1.0,
    l1_ratio: 0.5,
    rf_n_estimators: 100,
    rf_max_depth: 20,
    rf_min_samples_split: 10,
    rf_min_samples_leaf: 4
  },
  pca: {
    components: 2,
    show_loadings: true
  },
  formula: {
    plot_type: 'Line',
    add_regression: false,
    regression_degree: 1,
    regression_remove_outliers: false
  },
  fft: {
    window_size: undefined,
    overlap: 0.5,
    window_type: 'hann',
    detrend: 'linear',
    frequency_unit: 'hz',
    normalize: false,
    x_axis_scale: 'linear',
    y_axis_scale: 'log'
  },
  root_cause: {
    target_variable: undefined,
    max_lag: 40,
    top_n: 15,
    methods: ['pearson', 'cross_corr', 'mutual_info', 'granger'],
    significance_threshold: 0.05,
    min_correlation: 0.1,
    include_variables: [],
    result_plot: 'ranking',
  }
});

// ============= AI Integration Types =============

export type AIProvider = 'gemini' | 'openai' | 'claude';

export interface AIModelInfo {
  id: string;
  name: string;
  description: string;
  default?: boolean;
}

export interface AIProviderInfo {
  id: AIProvider;
  name: string;
  model: string;  // Default model
  models: AIModelInfo[];  // Available models for selection
}

export interface ColumnMetadata {
  name: string;
  description: string;
  data_type: 'numeric' | 'datetime' | 'categorical';
  unit?: string;
  role?: 'target' | 'feature' | 'timestamp' | 'identifier' | '';
  stats?: {
    min?: number;
    max?: number;
    mean?: number;
    std?: number;
    count?: number;
  };
}

export interface AISuggestion {
  title: string;
  description: string;
  viz_type: VisualizationType;
  x_axis: string;
  y_axes: string[];
  x_label?: string;
  y_label?: string;
  plot_type?: string; // Lowercase from AI (e.g. "line+scatter"), mapped to Capitalized PlotType in backend
  additional_config?: Record<string, unknown>;
  confidence: number;
  reasoning: string;
}

export interface AISuggestRequest {
  dataset_id: string;
  provider: AIProvider;
  api_key: string;
  model?: string;  // Optional model override
  column_descriptions: Record<string, string>;
  guidance_text: string;
  existing_visualization_titles?: string[];
  max_suggestions?: number;
}

export interface AISuggestResponse {
  suggestions: AISuggestion[];
  provider: AIProvider;
  count: number;
}

export interface AIApplyResponse {
  configurations: VisualizationConfig[];
  converted_count: number;
  errors?: Array<{ index: number; error: string }>;
}
