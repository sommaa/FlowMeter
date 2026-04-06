"""
FastAPI routes for data reconciliation operations.

This module provides REST API endpoints for:
    - Data reconciliation using constrained optimization (OSQP/SymPy)
    - Excel file generation with reconciled data
    - File download with automatic cleanup

The reconciliation process enforces physical equations and constraints
(e.g., mass/energy balance) while minimizing changes to raw measurements.

Endpoints are grouped under the "Reconciliation" tag in OpenAPI docs.
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from app.models.schemas import ReconciliationRequest, ReconciliationResponse, ReconciliationResult
from app.services.data_service import get_data_service
from app.services.reconciliation_service import ReconciliationService
from app.services.visualization_service import get_visualization_service
from app.core.config import get_settings
import pandas as pd
import os
import uuid
from datetime import datetime

import logging

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

def cleanup_file(path: str):
    """Delete a temporary file after download completion.

    Args:
        path: Absolute file path to delete.

    Note:
        Errors are logged but not raised to avoid breaking the download response.
    """
    try:
        os.remove(path)
    except Exception as e:
        logger.warning(f"Error removing file {path}: {e}")

@router.post("/reconcile", response_model=ReconciliationResponse)
async def reconcile_data(
    request: ReconciliationRequest,
    background_tasks: BackgroundTasks
):
    """Reconcile dataset measurements using constrained optimization.

    Applies data reconciliation to enforce physical constraints (equations) while
    minimizing weighted deviations from raw measurements. The reconciled data is:
    1. Saved to the in-memory dataset (immediate availability for plotting)
    2. Exported to Excel in the background (async file generation)
    3. Cached visualizations are invalidated to reflect updated data

    Request body:
        - dataset_id: Dataset identifier
        - config: ReconciliationConfig with:
            - equations: List of constraint equations (sympy format)
            - sigma_values: Measurement uncertainties (weights)
            - sigma_mode: "uniform", "auto", or "custom"
            - fixed_sigma: Default sigma for uniform mode
            - non_negative: Whether to enforce non-negativity

    Returns:
        ReconciliationResponse with:
            - reconciled_file_url: Download endpoint for Excel file
            - file_name: Generated filename with timestamp
            - report: List of per-variable error statistics

    Raises:
        HTTPException 404: Dataset not found
        HTTPException 400: Invalid equations or configuration
        HTTPException 500: Reconciliation solver error

    Example request:
        ```json
        {
          "dataset_id": "abc123",
          "config": {
            "equations": ["F1 - F2 - F3"],
            "sigma_mode": "uniform",
            "fixed_sigma": 0.1,
            "non_negative": true
          }
        }
        ```

    Example response:
        ```json
        {
          "reconciled_file_url": "/api/v1/reconcile/download/reconciled_20260210_143022_abc123.xlsx",
          "file_name": "reconciled_20260210_143022_abc123.xlsx",
          "report": [
            {
              "variable": "F1",
              "mean_error": 0.023,
              "max_error": 0.15,
              "rmse": 0.042
            }
          ]
        }
        ```

    Note:
        Excel file generation happens asynchronously. The download URL is returned
        immediately, but the file may not be ready for 2-3 seconds on large datasets.
    """
    try:
        # Load data
        data_service = get_data_service()
        dataset = data_service.get_dataset(request.dataset_id)
        if dataset is None:
            raise HTTPException(status_code=404, detail="Dataset not found")
            
        df = dataset.copy()
        
        # Perform reconciliation
        rec_df, report_list = ReconciliationService.reconcile_data(
            df=df,
            equations=request.config.equations,
            sigma_values=request.config.sigma_values,
            fixed_sigma=request.config.fixed_sigma,
            sigma_mode=request.config.sigma_mode,
            non_negative=request.config.non_negative
        )
        
        # Merge original data with reconciled columns
        # Ensure we keep the date column if it exists in original but wasn't part of rec
        # The result from service only has reconciled columns
        
        # Align indexes
        df_final = df.copy()
        for col in rec_df.columns:
            df_final[col + "_rec"] = rec_df[col]
            
        # Update in-memory dataset (Fast operation - enables immediate plotting)
        data_service.update_dataset(request.dataset_id, df_final)
        
        # Invalidate visualization caches to ensure fresh data is returned
        get_visualization_service().clear_caches()
        
        # Save to temporary Excel file (Slow operation - move to background)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"reconciled_{timestamp}_{request.dataset_id}.xlsx"
        filepath = os.path.join(settings.upload_dir, filename)
        
        def save_excel_background(df: pd.DataFrame, path: str):
            """Background task to save DataFrame to Excel.

            Args:
                df: DataFrame with original and reconciled columns.
                path: Absolute file path for Excel output.

            Note:
                Runs asynchronously after the HTTP response is sent.
                Errors are logged but don't affect the API response.
            """
            try:
                os.makedirs(settings.upload_dir, exist_ok=True)
                df.to_excel(path, index=True)
            except Exception as e:
                logger.error(f"Error saving background Excel file: {e}")

        background_tasks.add_task(save_excel_background, df_final, filepath)
        
        # Construct download URL 
        # Note: File might not be ready immediately if user clicks download within 2-3 seconds
        download_url = f"/api/v1/reconcile/download/{filename}"
        
        # Map report to schema
        report_objs = [ReconciliationResult(**r) for r in report_list]
        
        return ReconciliationResponse(
            reconciled_file_url=download_url,
            file_name=filename,
            report=report_objs
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reconciliation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/reconcile/download/{filename}")
async def download_reconciled_file(filename: str, background_tasks: BackgroundTasks):
    """Download a reconciled dataset Excel file with automatic cleanup.

    Args:
        filename: Name of the file to download (from reconcile response).
        background_tasks: FastAPI background tasks for file cleanup.

    Returns:
        FileResponse: Excel file stream with appropriate MIME type.

    Raises:
        HTTPException 404: File not found or not yet generated.

    Note:
        The file is automatically deleted after the download completes.
        If the file hasn't finished generating (reconcile was just called),
        this endpoint will return 404. The frontend should retry or wait.
    """
    filepath = os.path.join(settings.upload_dir, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
        
    background_tasks.add_task(cleanup_file, filepath)
    return FileResponse(
        path=filepath, 
        filename=filename, 
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
