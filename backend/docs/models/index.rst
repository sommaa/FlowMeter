Data Models
===========

Pydantic models for data validation, API serialization, and OpenAPI documentation.
All models use **Pydantic v2** with automatic JSON schema generation.

.. contents:: Model Categories
   :local:
   :depth: 1

Schemas
-------

.. automodule:: app.models.schemas
   :members:
   :undoc-members:
   :show-inheritance:

Enums
^^^^^

.. list-table:: Enumeration Types
   :header-rows: 1
   :widths: 30 70

   * - Enum
     - Values
   * - ``VisualizationType``
     - universal, area, hist, box, regression, pca, formula, correlation, fft, root_cause, kpi
   * - ``PlotType``
     - Line, Scatter, Line + Scatter
   * - ``SeriesRenderType``
     - data, regression, ci_lower, ci_upper, threshold

Core Data Models
^^^^^^^^^^^^^^^^

- **DatasetInfo**: Dataset metadata (id, name, rows, columns, types, date range)
- **DataStatistics**: Per-column statistics (count, mean, std, min, max, quartiles)
- **GlobalVariable**: Computed column definition with formula expression
- **StorylineEvent**: Timeline annotation with timestamp and description

Visualization Configuration
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- **VisualizationConfig**: Complete visualization definition
- **AxisConfig**: Axis settings (range, scale, label, format)
- **RegressionConfig**: ML model type, degree, confidence interval settings
- **StyleConfig**: Visual styling (colors, opacity, stacking, bar mode)
- **LimitConfig**: Threshold lines and shaded regions
- **FFTConfig**: Frequency analysis parameters (window, sampling rate)
- **RootCauseConfig**: Causality analysis parameters (max lag, significance)
- **FormulaConfig**: Custom formula expression and evaluation settings

API Request/Response Models
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- **APIResponse**: Standard JSON response wrapper (success, message, data, error)
- **PlotDataRequest**: Dataset ID + visualization configuration
- **PlotDataResponse**: Chart series data with metadata
- **PlotDataSeries**: Individual time series data (x, y, name, type, color)
- **ReconciliationRequest**: Constraints + measurement data
- **ReconciliationResponse**: Reconciled values with adjustments
- **ExportSettings**: HTML report configuration (title, format, branding)
- **TemplateConfig**: Dashboard template with all visualization configs
- **SaveModelRequest**: Regression model persistence parameters
- **PredictRequest**: Server-side prediction input

AI Graph Schemas
^^^^^^^^^^^^^^^^

The LangGraph AI workflow defines its own Pydantic schemas (e.g.
``VisualizationSuggestion``, ``SuggestionBatch``, and the graph state
container). These live with the AI subsystem and are documented in the
services reference under :mod:`app.services.ai_graph.schemas`.
