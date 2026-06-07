Services Layer
==============

Business logic layer containing all core application services. Services are
accessed via singleton getter functions (e.g. ``get_data_service()``) and
manage state, caching, and orchestration of domain operations.

.. note::

   The module reference below is generated automatically from the
   ``app.services`` package and recurses into every submodule. New service
   modules appear here on the next build with **no manual edits** — there is
   no hand-maintained list to keep in sync.

Orientation
-----------

A high-level map of what lives where. The authoritative, always-current
detail is in the auto-generated reference at the bottom of this page.

- **Data** (``data_service``) — upload processing, datetime detection,
  delegation to cleaning, in-memory dataset storage, and per-column statistics.
- **Visualization** (``visualization_service`` + the ``visualization``
  engine package) — turns a ``VisualizationConfig`` + DataFrame into a
  ``PlotDataResponse``. Engine submodules cover plotting, regression,
  processing/transforms, validation, FFT, root-cause, and KPI summaries.
- **Reconciliation** (``reconciliation_service``) — constrained data
  reconciliation via OSQP quadratic programming with SymPy-parsed balance
  equations; emits reconciled Excel reports.
- **Cleaning** (``cleaning_service``) — the upload-time preprocessing
  pipeline (header selection, find/replace, NaN strategies, type coercion,
  row filters).
- **Export** (``export_service`` + the ``export_helpers`` package) —
  self-contained HTML dashboard reports with Plotly/Kaleido static images,
  statistics, and templating.
- **AI** (``ai_service``, ``ai_metrics``, and the ``ai_graph`` package) — a
  LangGraph workflow for visualization and formula suggestions across
  multiple LLM providers, with dataset-profile grounding, optional agentic
  dataset tools, closed-loop formula verification, and run metrics.
- **Analytics** (``analytics`` package) — shared statistical methods such as
  causality analysis used by the visualization engine and AI tools.

Module Reference
----------------

.. autosummary::
   :toctree: _autosummary
   :recursive:

   app.services
