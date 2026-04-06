API Routes
==========

REST API endpoint handlers organized by domain. All endpoints are prefixed
with ``/api/v1`` and return structured JSON responses.

.. contents:: Route Groups
   :local:
   :depth: 1

Data Management
---------------

.. automodule:: app.api.data
   :members:
   :undoc-members:
   :show-inheritance:

**Prefix:** ``/api/v1/data``

.. list-table:: Endpoints
   :header-rows: 1
   :widths: 10 30 60

   * - Method
     - Path
     - Description
   * - POST
     - ``/upload``
     - Upload Excel/CSV file with optional cleaning config
   * - GET
     - ``/datasets``
     - List all loaded datasets
   * - GET
     - ``/datasets/{dataset_id}``
     - Get dataset metadata
   * - DELETE
     - ``/datasets/{dataset_id}``
     - Remove dataset from memory
   * - GET
     - ``/datasets/{dataset_id}/statistics``
     - Compute column statistics
   * - GET
     - ``/datasets/{dataset_id}/preview``
     - Preview first N rows

Visualizations
--------------

.. automodule:: app.api.visualizations
   :members:
   :undoc-members:
   :show-inheritance:

**Prefix:** ``/api/v1/visualizations``

.. list-table:: Endpoints
   :header-rows: 1
   :widths: 10 30 60

   * - Method
     - Path
     - Description
   * - POST
     - ``/plot-data``
     - Generate plot data from visualization config
   * - POST
     - ``/predict``
     - Run server-side regression predictions
   * - POST
     - ``/validate-config``
     - Validate visualization configuration
   * - GET
     - ``/types``
     - List available visualization types
   * - GET
     - ``/colors``
     - Get color palettes

Reconciliation
--------------

.. automodule:: app.api.reconciliation
   :members:
   :undoc-members:
   :show-inheritance:

**Prefix:** ``/api/v1/reconcile``

.. list-table:: Endpoints
   :header-rows: 1
   :widths: 10 30 60

   * - Method
     - Path
     - Description
   * - POST
     - ``/reconcile``
     - Reconcile data with constraints (OSQP optimization)
   * - GET
     - ``/download/{filename}``
     - Download reconciled Excel file

Templates
---------

.. automodule:: app.api.templates
   :members:
   :undoc-members:
   :show-inheritance:

**Prefix:** ``/api/v1/templates``

.. list-table:: Endpoints
   :header-rows: 1
   :widths: 10 30 60

   * - Method
     - Path
     - Description
   * - POST
     - ``/save``
     - Save dashboard template (client download)
   * - POST
     - ``/save-persistent``
     - Save template to server
   * - GET
     - ``/list``
     - List saved templates
   * - GET
     - ``/load-persistent/{name}``
     - Load server-stored template
   * - DELETE
     - ``/delete/{name}``
     - Delete template
   * - POST
     - ``/rename``
     - Rename a template
   * - POST
     - ``/validate``
     - Validate template structure

Export
------

.. automodule:: app.api.export
   :members:
   :undoc-members:
   :show-inheritance:

**Prefix:** ``/api/v1/export``

.. list-table:: Endpoints
   :header-rows: 1
   :widths: 10 30 60

   * - Method
     - Path
     - Description
   * - POST
     - ``/dashboard``
     - Generate full HTML dashboard report
   * - POST
     - ``/figure``
     - Export a single chart as image

Models
------

.. automodule:: app.api.models
   :members:
   :undoc-members:
   :show-inheritance:

**Prefix:** ``/api/v1/models``

.. list-table:: Endpoints
   :header-rows: 1
   :widths: 10 30 60

   * - Method
     - Path
     - Description
   * - POST
     - ``/train``
     - Train and save a regression model
   * - GET
     - ``/list``
     - List saved models with metadata
   * - DELETE
     - ``/{model_name}``
     - Delete a saved model

AI Analysis
-----------

.. automodule:: app.api.ai
   :members:
   :undoc-members:
   :show-inheritance:

**Prefix:** ``/api/v1/ai``

.. list-table:: Endpoints
   :header-rows: 1
   :widths: 10 30 60

   * - Method
     - Path
     - Description
   * - POST
     - ``/suggest``
     - Get AI-powered visualization suggestions
   * - GET
     - ``/providers``
     - List available LLM providers
   * - POST
     - ``/apply-suggestions``
     - Convert AI suggestions to visualization configs
