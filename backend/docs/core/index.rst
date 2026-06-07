Core Utilities
==============

Core infrastructure modules providing the FastAPI entry point, configuration,
middleware, logging, and response handling for the application.

.. note::

   The module reference below is generated automatically from ``app.main``
   and the ``app.core`` package, so new core modules appear without manual
   edits. The sections that follow are curated orientation that rarely
   changes.

Module Reference
----------------

.. autosummary::
   :toctree: _autosummary
   :recursive:

   app.main
   app.core

Application Entry Point
-----------------------

The ``app`` object (``app.main``) is the FastAPI application instance
configured with:

- **API router groups** for data, visualizations, reconciliation, templates,
  export, models, and ai
- **Middleware stack** (CORS, ProcessTime, GZip)
- **Global exception handler** returning structured JSON errors
- **NaNSafeJSONResponse** as default response class
- **SPA static file serving** for the React frontend
- **Kaleido prewarm** on startup for faster first export

Configuration Variables
-----------------------

Environment-based configuration using ``pydantic-settings`` (see
:mod:`app.core.config` in the reference above for the authoritative model):

.. list-table:: Configuration Variables
   :header-rows: 1
   :widths: 25 15 20 40

   * - Variable
     - Type
     - Default
     - Description
   * - ``APP_NAME``
     - str
     - "FlowMeter API"
     - Application display name
   * - ``APP_VERSION``
     - str
     - "1.0.0"
     - Semantic version string
   * - ``DEBUG``
     - bool
     - False
     - Enable debug mode
   * - ``HOST``
     - str
     - "0.0.0.0"
     - Server bind address
   * - ``PORT``
     - int
     - 8000
     - Server listening port
   * - ``CORS_ORIGINS``
     - list[str]
     - ["http://localhost:3000", "http://localhost:5173"]
     - Allowed CORS origins
   * - ``MAX_FILE_SIZE_MB``
     - int
     - 50
     - Maximum upload file size (MB)
   * - ``ALLOWED_EXTENSIONS``
     - list[str]
     - [".xlsx", ".xls", ".csv"]
     - Permitted file extensions
   * - ``UPLOAD_DIR``
     - str
     - "uploads"
     - Temporary upload directory
   * - ``MAX_DATASETS_PER_SESSION``
     - int
     - 10
     - Max concurrent datasets
