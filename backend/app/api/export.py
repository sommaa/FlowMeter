"""
FastAPI routes for dashboard export operations.

This module provides REST API endpoints for:
    - HTML report generation with embedded charts
    - Multi-visualization dashboard export
    - Storyline annotations and commentary
    - Custom styling and branding
    - Raw data export to Excel

Reports are generated server-side using Plotly static image export
and embedded into a self-contained HTML document with CSS styling.

Endpoints are grouped under the "Export" tag in OpenAPI docs.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional
import pandas as pd
import numpy as np
import os
import tempfile
import logging
from app.services.data_service import get_data_service
from app.services.export_service import DashboardExporter
from app.services.visualization_service import VisualizationService
from app.services.visualization.processing import compute_global_variables
from app.models.schemas import VisualizationConfig, ExportSettings, GlobalVariable, StorylineEvent, DataExportRequest
from app.core.config import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)
exporter = DashboardExporter()

class ReportSections(BaseModel):
    """Toggleable sections for the exported HTML report."""
    comments: bool = True
    storyline: bool = True
    statistics: bool = True
    visualizations: bool = True

class ExportRequest(BaseModel):
    """Request model for dashboard export.

    Attributes:
        dataset_id: Dataset identifier for data source.
        visualizations: List of chart configurations to include.
        plant_name: Plant/facility name for report header.
        comments: Optional commentary text for report.
        settings: Export configuration (layout, styling, etc.).
        date_range: Optional date filter for all visualizations.
        global_variables: Computed columns to apply before plotting.
        storyline_events: Timeline annotations for the report.
        report_sections: Which sections to include in the report.
    """
    dataset_id: str
    visualizations: List[VisualizationConfig]
    plant_name: str
    comments: Optional[str] = ""
    settings: Optional[ExportSettings] = None
    date_range: Optional[dict[str, str]] = None
    global_variables: List[GlobalVariable] = []
    storyline_events: List[StorylineEvent] = []
    report_sections: ReportSections = ReportSections()

@router.post("/dashboard", response_class=HTMLResponse)
async def export_dashboard(request: ExportRequest):
    """Generate a self-contained HTML report with embedded visualizations.

    Creates a professional HTML document containing:
    - Report header with plant name, date range, and comments
    - All specified visualizations as embedded static images
    - Storyline timeline showing key events
    - Statistical summaries and annotations
    - Custom styling and branding

    The report is fully self-contained (no external dependencies) and
    can be saved, emailed, or archived for compliance purposes.

    Request body:
        - dataset_id: Source dataset
        - visualizations: List of chart configs (same schema as /plot-data)
        - plant_name: Facility identifier for header
        - comments: Optional markdown commentary
        - settings: Export options (image format, DPI, layout)
        - date_range: Global date filter
        - global_variables: Computed columns (formulas)
        - storyline_events: Timeline annotations

    Returns:
        HTMLResponse: Complete HTML document with embedded images.

    Raises:
        HTTPException 404: Dataset not found
        HTTPException 500: Chart rendering error

    Example request:
        ```json
        {
          "dataset_id": "abc123",
          "plant_name": "Refinery Unit 5",
          "comments": "Monthly performance review",
          "visualizations": [
            {
              "viz_type": "universal",
              "title": "Temperature Trend",
              "axis": {"x_axis": "Date", "y_axis": ["T101"]}
            }
          ],
          "storyline_events": [
            {
              "date": "2024-01-15T10:00:00",
              "description": "Maintenance shutdown",
              "category": "maintenance"
            }
          ]
        }
        ```

    Note:
        Chart rendering uses Plotly's static export (kaleido), which may
        take several seconds for reports with many visualizations.
        Consider using async processing for large reports.
    """
    try:
        data_service = get_data_service()
        # Get dataset
        df = data_service.get_dataset(request.dataset_id)
        if df is None:
            raise HTTPException(status_code=404, detail="Dataset not found")
        
        # Compute global variables before generating report
        if request.global_variables:
            df = VisualizationService.compute_global_variables(df, request.global_variables)
        
        # Generate Report
        html_content = exporter.generate_html_report(
            df=df,
            visualizations=request.visualizations,
            plant_name=request.plant_name,
            comments=request.comments,
            settings=request.settings,
            date_range=request.date_range,
            storyline_events=request.storyline_events,
            report_sections=request.report_sections
        )
        
        return HTMLResponse(content=html_content)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Export failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _cleanup_file(path: str):
    """Delete a temporary file after download completion."""
    try:
        os.remove(path)
    except Exception as e:
        logger.warning(f"Error removing temp file {path}: {e}")


@router.post("/data")
async def export_data(request: DataExportRequest, background_tasks: BackgroundTasks):
    """Export raw dataset data to an Excel file with selectable column categories.

    Allows users to choose which categories of columns to include:
    - Original data columns (no _rec suffix)
    - Reconciled variables (_rec suffix columns)
    - Global variables (user-defined computed columns)
    - Formula results (outputs from formula-type visualizations)

    Returns:
        FileResponse: Excel file with selected columns.
    """
    try:
        data_service = get_data_service()
        df = data_service.get_dataset(request.dataset_id)
        if df is None:
            raise HTTPException(status_code=404, detail="Dataset not found")

        df = df.copy()

        # Apply date range filter on DatetimeIndex
        if request.date_range:
            start = request.date_range.get("start")
            end = request.date_range.get("end")
            if start and end and isinstance(df.index, pd.DatetimeIndex):
                df = df.loc[start:end]

        # Separate columns into original and reconciled
        all_cols = list(df.columns)
        rec_cols = [c for c in all_cols if c.endswith("_rec")]
        orig_cols = [c for c in all_cols if not c.endswith("_rec")]

        final_cols = []

        # 1. Original data
        if request.sections.original_data:
            final_cols.extend(orig_cols)

        # 2. Reconciled variables
        if request.sections.reconciled_variables:
            final_cols.extend(rec_cols)

        # 3. Global variables
        gv_col_names = []
        if request.sections.global_variables and request.global_variables:
            df = compute_global_variables(df, request.global_variables)
            gv_col_names = [gv.name for gv in request.global_variables if gv.name in df.columns]
            final_cols.extend(gv_col_names)

        # 4. Formula results
        if request.sections.formula_results and request.formula_visualizations:
            # Make sure global variables are computed even if not selected for export
            if not request.sections.global_variables and request.global_variables:
                df = compute_global_variables(df, request.global_variables)

            for viz in request.formula_visualizations:
                if not viz.formula or not viz.formula.input:
                    continue

                work_df = df.copy()
                if work_df.index.name:
                    work_df[work_df.index.name] = work_df.index
                work_df['Index'] = work_df.index

                namespace = {'col': work_df, 'np': np, 'pd': pd}
                try:
                    exec(viz.formula.input, namespace)
                except Exception as e:
                    logger.warning(f"Formula '{viz.title}' failed: {e}")
                    continue

                # Extract result, result1, result2, etc.
                if 'result' in namespace:
                    col_name = f"{viz.title}_result"
                    val = namespace['result']
                    if isinstance(val, (pd.Series, np.ndarray)):
                        df[col_name] = val if isinstance(val, pd.Series) else pd.Series(val, index=df.index)
                    else:
                        df[col_name] = float(val)
                    final_cols.append(col_name)

                j = 1
                while f'result{j}' in namespace:
                    col_name = f"{viz.title}_result{j}"
                    val = namespace[f'result{j}']
                    if isinstance(val, (pd.Series, np.ndarray)):
                        df[col_name] = val if isinstance(val, pd.Series) else pd.Series(val, index=df.index)
                    else:
                        df[col_name] = float(val)
                    final_cols.append(col_name)
                    j += 1

        # Deduplicate while preserving order
        seen = set()
        unique_cols = []
        for c in final_cols:
            if c not in seen and c in df.columns:
                seen.add(c)
                unique_cols.append(c)

        if not unique_cols:
            raise HTTPException(status_code=400, detail="No columns selected for export")

        # Write to temp Excel file
        settings = get_settings()
        os.makedirs(settings.upload_dir, exist_ok=True)
        filepath = os.path.join(settings.upload_dir, f"data_export_{request.dataset_id}.xlsx")
        df[unique_cols].to_excel(filepath, index=True)

        background_tasks.add_task(_cleanup_file, filepath)

        return FileResponse(
            path=filepath,
            filename="data_export.xlsx",
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Data export failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
