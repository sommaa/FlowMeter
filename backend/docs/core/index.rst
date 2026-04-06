Core Utilities
==============

Core infrastructure modules providing configuration, middleware, and
response handling for the application.

.. contents:: Modules
   :local:
   :depth: 1

Application Entry Point
-----------------------

.. automodule:: app.main
   :members:
   :undoc-members:
   :show-inheritance:

The ``app`` object is the FastAPI application instance configured with:

- **7 API router groups** (data, visualizations, reconciliation, templates, export, models, ai)
- **3 middleware layers** (CORS, ProcessTime, GZip)
- **Global exception handler** returning structured JSON errors
- **NaNSafeJSONResponse** as default response class
- **SPA static file serving** for the React frontend
- **Kaleido prewarm** on startup for faster first export

Configuration
-------------

.. automodule:: app.core.config
   :members:
   :undoc-members:
   :show-inheritance:

Environment-based configuration using ``pydantic-settings``:

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

Profiler Middleware
------------------

.. automodule:: app.core.profiler
   :members:
   :undoc-members:
   :show-inheritance:

Request timing middleware that:

- Measures request processing duration
- Adds ``X-Process-Time`` response header
- Logs slow requests to the ``profiler`` logger
- Provides ``@profile_performance`` decorator for service functions

NaN-Safe JSON Response
----------------------

.. automodule:: app.core.responses
   :members:
   :undoc-members:
   :show-inheritance:

Custom FastAPI response class that handles scientific data serialization:

- Converts ``NaN`` values to ``null``
- Converts ``Inf``/``-Inf`` values to ``null``
- Uses ``orjson`` for high-performance serialization
- Compatible with numpy arrays and pandas objects
- Set as the default response class for the entire application
