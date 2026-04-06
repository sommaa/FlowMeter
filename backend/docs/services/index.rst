Services Layer
==============

Business logic layer containing all core application services.
Services are accessed via singleton getter functions (e.g., ``get_data_service()``)
and manage state, caching, and orchestration of domain operations.

.. contents:: Services
   :local:
   :depth: 1

Data Service
------------

.. automodule:: app.services.data_service
   :members:
   :undoc-members:
   :show-inheritance:

The ``DataService`` manages the complete lifecycle of uploaded datasets:

- **Upload processing**: Reads Excel/CSV files into pandas DataFrames
- **Datetime detection**: Automatically identifies and parses date columns
- **Data cleaning**: Delegates to ``CleaningService`` for preprocessing
- **Storage**: In-memory dictionary storage (``_datasets``, ``_metadata``)
- **Statistics**: Computes descriptive statistics per column

Visualization Service
---------------------

.. automodule:: app.services.visualization_service
   :members:
   :undoc-members:
   :show-inheritance:

Orchestrates the transformation of raw data into ``PlotDataResponse`` objects
for frontend rendering. Supports 10 visualization types:

- **universal**: Line, scatter, bar, step charts
- **area**: Stacked area charts
- **histogram**: Distribution histograms with optional KDE
- **box**: Box-and-whisker plots
- **regression**: ML regression with confidence intervals
- **pca**: Principal Component Analysis biplots
- **formula**: Custom calculated field visualization
- **correlation**: Correlation matrix heatmaps
- **fft**: Frequency domain analysis
- **root_cause**: Causality analysis

Reconciliation Service
----------------------

.. automodule:: app.services.reconciliation_service
   :members:
   :undoc-members:
   :show-inheritance:

Implements **constrained data reconciliation** using quadratic programming:

- Enforces physical equations (mass/energy balance)
- Minimizes adjustments to raw measurements
- Uses OSQP solver for convex optimization
- Supports SymPy-parsed constraint equations
- Generates reconciled Excel reports

Cleaning Service
----------------

.. automodule:: app.services.cleaning_service
   :members:
   :undoc-members:
   :show-inheritance:

Data preprocessing pipeline applied during upload:

- Header row selection
- String replacements and find/replace rules
- NaN handling strategies (drop, fill forward, interpolate)
- Column type coercion
- Filter rules for row selection

AI Service
----------

.. automodule:: app.services.ai_service
   :members:
   :undoc-members:
   :show-inheritance:

Orchestrates AI-powered visualization suggestions:

- Analyzes dataset structure and column statistics
- Delegates to LangGraph workflow for LLM inference
- Supports multiple providers (OpenAI, Google Gemini, Anthropic Claude)
- Validates and scores generated suggestions
- Converts suggestions to ``VisualizationConfig`` objects

Export Service
--------------

.. automodule:: app.services.export_service
   :members:
   :undoc-members:
   :show-inheritance:

Generates self-contained HTML dashboard reports:

- Renders Plotly charts as static images (via Kaleido)
- Embeds images in HTML with Base64 encoding
- Includes statistical summaries and commentary
- Supports custom branding and styling
- Generates timeline/storyline annotations

Visualization Engine
--------------------

Submodules providing specialized visualization and analysis capabilities.

Plotting
^^^^^^^^

.. automodule:: app.services.visualization.plotting
   :members:
   :undoc-members:
   :show-inheritance:

Core chart rendering logic. Converts ``VisualizationConfig`` + DataFrame
into ``PlotDataResponse`` with series data, axis labels, and metadata.

Regression
^^^^^^^^^^

.. automodule:: app.services.visualization.regression
   :members:
   :undoc-members:
   :show-inheritance:

Machine learning regression engine supporting:

- **Linear**: Ordinary least squares
- **Polynomial**: Configurable degree
- **Ridge/Lasso/ElasticNet**: Regularized linear models
- **Random Forest**: Ensemble tree-based regression
- **Custom Formula**: User-defined mathematical expressions

All models include R-squared metrics and optional confidence intervals.

Processing
^^^^^^^^^^

.. automodule:: app.services.visualization.processing
   :members:
   :undoc-members:
   :show-inheritance:

Data transformation utilities:

- Global variable computation (formula evaluation)
- Data filtering and date range selection
- Column type inference and casting
- Data downsampling (LTTBC algorithm)

Validation
^^^^^^^^^^

.. automodule:: app.services.visualization.validation
   :members:
   :undoc-members:
   :show-inheritance:

Configuration validation for visualization requests.

FFT Analysis
^^^^^^^^^^^^

.. automodule:: app.services.visualization.fft
   :members:
   :undoc-members:
   :show-inheritance:

Fast Fourier Transform analysis:

- Frequency spectrum computation
- Dominant frequency detection
- Windowing functions (Hanning, Hamming, Blackman)
- Power spectral density estimation

Root Cause Analysis
^^^^^^^^^^^^^^^^^^^

.. automodule:: app.services.visualization.root_cause
   :members:
   :undoc-members:
   :show-inheritance:

Statistical causality analysis:

- Granger causality testing
- Cross-correlation analysis
- Lag detection between time series
- Contribution scoring

AI Graph Workflow
-----------------

LangGraph-based AI workflow for structured visualization suggestions.

Graph Orchestration
^^^^^^^^^^^^^^^^^^^

.. automodule:: app.services.ai_graph.graph
   :members:
   :undoc-members:
   :show-inheritance:

Main LangGraph workflow with nodes for:

1. Dataset analysis
2. Prompt construction
3. LLM inference
4. Response parsing
5. Validation and scoring

Prompts
^^^^^^^

.. automodule:: app.services.ai_graph.prompts
   :members:
   :undoc-members:
   :show-inheritance:

LLM prompt templates for visualization suggestion generation.

Validators
^^^^^^^^^^

.. automodule:: app.services.ai_graph.validators
   :members:
   :undoc-members:
   :show-inheritance:

Validates AI-generated visualization configurations against schema rules.

Formula Validator
^^^^^^^^^^^^^^^^^

.. automodule:: app.services.ai_graph.formula_validator
   :members:
   :undoc-members:
   :show-inheritance:

Validates mathematical formulas in AI-generated configurations.

Formula Generator
^^^^^^^^^^^^^^^^^

.. automodule:: app.services.ai_graph.formula_generator
   :members:
   :undoc-members:
   :show-inheritance:

Generates mathematical formulas for computed columns.

LLM Providers
^^^^^^^^^^^^^

.. automodule:: app.services.ai_graph.providers
   :members:
   :undoc-members:
   :show-inheritance:

Provider interfaces for:

- **OpenAI**: GPT-4 / GPT-3.5
- **Google**: Gemini Pro / Flash
- **Anthropic**: Claude Sonnet / Haiku

Analytics
---------

Causality Analysis
^^^^^^^^^^^^^^^^^^

.. automodule:: app.services.analytics.causality
   :members:
   :undoc-members:
   :show-inheritance:

Statistical methods for identifying causal relationships between variables.

Export Helpers
--------------

Plotly Renderer
^^^^^^^^^^^^^^^

.. automodule:: app.services.export_helpers.plotly_renderer
   :members:
   :undoc-members:
   :show-inheritance:

Static image export using Plotly + Kaleido engine.

Statistics
^^^^^^^^^^

.. automodule:: app.services.export_helpers.statistics
   :members:
   :undoc-members:
   :show-inheritance:

Statistical summary generation for export reports.

HTML Templates
^^^^^^^^^^^^^^

.. automodule:: app.services.export_helpers.html_templates
   :members:
   :undoc-members:
   :show-inheritance:

Jinja2-based HTML template rendering for dashboard exports.

Utilities
^^^^^^^^^

.. automodule:: app.services.export_helpers.utils
   :members:
   :undoc-members:
   :show-inheritance:

Helper functions for export operations.
