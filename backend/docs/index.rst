FlowMeter Backend API Documentation
=====================================

.. image:: https://img.shields.io/badge/python-3.11+-blue.svg
   :alt: Python 3.11+

.. image:: https://img.shields.io/badge/framework-FastAPI-009688.svg
   :alt: FastAPI

FlowMeter is an industrial plant monitoring dashboard backend built with **FastAPI**.
It provides data management, visualization generation, AI-powered analysis,
data reconciliation, and HTML report export capabilities.

Quick Start
-----------

.. code-block:: bash

   cd backend
   pip install -r requirements.txt
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

Interactive API docs are available at:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

Architecture Overview
---------------------

The backend follows a **three-layer architecture**:

.. code-block:: text

   ┌─────────────────────────────────────────────┐
   │         API Routes (app/api/*.py)            │
   │   data, visualizations, reconciliation,      │
   │   templates, export, models, ai              │
   └──────────────────┬──────────────────────────-┘
                      │
   ┌──────────────────▼──────────────────────────-┐
   │       Services Layer (app/services/*.py)      │
   │   DataService, VisualizationService,          │
   │   ReconciliationService, ExportService, etc.  │
   └──────────────────┬──────────────────────────-┘
                      │
   ┌──────────────────▼──────────────────────────-┐
   │      Data Models (app/models/schemas.py)      │
   │      45+ Pydantic schemas for validation      │
   └───────────────────────────────────────────────┘

Key Features
^^^^^^^^^^^^

- **In-memory dataset storage** for fast access with pandas DataFrames
- **NaN/Inf-safe JSON serialization** for scientific data
- **LRU caching** on visualization requests for performance
- **AI-powered suggestions** via LangGraph with multi-provider LLM support
- **Constrained optimization** for data reconciliation (OSQP solver)
- **Static chart export** with Plotly Kaleido for HTML reports
- **PyInstaller compatibility** for standalone deployment

Middleware Stack
^^^^^^^^^^^^^^^^

Requests pass through these middleware layers (in order):

1. **CORSMiddleware** - Cross-Origin Resource Sharing headers
2. **ProcessTimeMiddleware** - Request timing (``X-Process-Time`` header)
3. **GZipMiddleware** - Response compression for payloads >1KB


.. toctree::
   :maxdepth: 2
   :caption: Contents

   api/index
   services/index
   models/index
   core/index


Indices and tables
------------------

* :ref:`genindex`
* :ref:`modindex`
* :ref:`search`
