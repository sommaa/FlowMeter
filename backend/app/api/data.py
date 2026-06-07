"""
FastAPI routes for dataset upload and management operations.

This module provides REST API endpoints for:
    - File upload (Excel/CSV/Parquet) with optional cleaning configuration
    - Dataset listing and metadata retrieval
    - Dataset deletion
    - Statistics computation
    - Dataset preview (first N rows)

All endpoints return APIResponse objects with consistent structure:
    - success (bool): Operation status
    - message (str): Optional message
    - data (Any): Response payload
    - error (str): Error details if failed

Endpoints are grouped under the "Data" tag in OpenAPI documentation.
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from typing import Optional

from app.models.schemas import (
    APIResponse, 
    DatasetInfo, 
    DatasetInfo, 
    DataStatistics,
    ErrorResponse,
    CleaningConfig
)
from app.services.data_service import get_data_service
from app.core.config import get_settings
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Data"])
settings = get_settings()


@router.post("/upload", response_model=APIResponse)
async def upload_file(
    file: UploadFile = File(...),
    cleaning_config: Optional[str] = Form(None)
):
    """Upload and process an Excel, CSV, or Parquet file.

    Validates file type and size, then loads the dataset into memory with
    optional cleaning configuration. Automatically detects datetime columns,
    infers types, and generates comprehensive metadata.

    Validation:
        - File extension must be in allowed_extensions (.xlsx, .xls, .csv, .parquet, .pqt)
        - File size must be under max_file_size_mb limit

    Args:
        file: Uploaded file (multipart/form-data).
        cleaning_config: Optional JSON string with CleaningConfig structure
            for preprocessing (header row, replacements, filters, NaN strategy).

    Returns:
        APIResponse with:
            - success: True
            - message: Summary of loaded rows and columns
            - data: DatasetInfo with id, columns, types, date range, etc.

    Raises:
        HTTPException 400: Invalid file type or size exceeded
        HTTPException 500: File processing error

    Example response:
        ```json
        {
          "success": true,
          "message": "Successfully loaded 1000 rows × 15 columns",
          "data": {
            "id": "abc12345",
            "name": "data.xlsx",
            "rows": 1000,
            "columns": 15,
            "column_names": ["Date", "Temperature", ...],
            "numeric_columns": ["Temperature", ...],
            "datetime_columns": ["Date"],
            "date_range": {"start": "2024-01-01T00:00:00", "end": "2024-12-31T23:59:59"}
          }
        }
        ```
    """
    # Validate file extension
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    ext = "." + file.filename.split(".")[-1].lower()
    if ext not in settings.allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"File type not allowed. Allowed types: {settings.allowed_extensions}"
        )
    
    # Read file content
    content = await file.read()
    
    # Check file size
    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.max_file_size_mb:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.max_file_size_mb}MB"
        )
    
    try:
        data_service = get_data_service()
        
        # Parse cleaning config if provided
        config = None
        if cleaning_config:
            try:
                config_dict = json.loads(cleaning_config)
                config = CleaningConfig(**config_dict)
            except Exception as e:
                logger.warning(f"Error parsing cleaning config: {e}")
                # Continue without config if parsing fails
        
        info = data_service.load_excel(content, file.filename, config)
        
        return APIResponse(
            success=True,
            message=f"Successfully loaded {info.rows} rows × {info.columns} columns",
            data=info.model_dump()
        )
    except Exception as e:
        logger.error(f"Upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")


@router.get("/datasets", response_model=APIResponse)
async def list_datasets():
    """List all datasets currently loaded in memory.

    Returns metadata for all uploaded datasets including their IDs,
    names, sizes, and column information.

    Returns:
        APIResponse with:
            - success: True
            - data: List of DatasetInfo objects

    Example response:
        ```json
        {
          "success": true,
          "data": [
            {"id": "abc123", "name": "data1.xlsx", "rows": 1000, ...},
            {"id": "def456", "name": "data2.csv", "rows": 500, ...}
          ]
        }
        ```
    """
    data_service = get_data_service()
    datasets = data_service.list_datasets()
    
    return APIResponse(
        success=True,
        data=[d.model_dump() for d in datasets]
    )


@router.get("/datasets/{dataset_id}", response_model=APIResponse)
async def get_dataset_info(dataset_id: str):
    """Retrieve metadata for a specific dataset.

    Args:
        dataset_id: Unique identifier of the dataset.

    Returns:
        APIResponse with:
            - success: True
            - data: DatasetInfo object

    Raises:
        HTTPException 404: Dataset not found
    """
    data_service = get_data_service()
    info = data_service.get_metadata(dataset_id)
    
    if info is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    return APIResponse(
        success=True,
        data=info.model_dump()
    )


@router.delete("/datasets/{dataset_id}", response_model=APIResponse)
async def delete_dataset(dataset_id: str):
    """Remove a dataset from memory.

    Deletes both the DataFrame and its associated metadata.

    Args:
        dataset_id: Unique identifier of the dataset to delete.

    Returns:
        APIResponse with:
            - success: True
            - message: Confirmation message

    Raises:
        HTTPException 404: Dataset not found
    """
    data_service = get_data_service()
    success = data_service.delete_dataset(dataset_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    return APIResponse(
        success=True,
        message="Dataset deleted successfully"
    )


@router.get("/datasets/{dataset_id}/statistics", response_model=APIResponse)
async def get_statistics(dataset_id: str, columns: Optional[str] = None):
    """Compute descriptive statistics for numeric columns.

    Calculates count, mean, std, min, max, median, and quartiles for
    specified columns or all numeric columns if not specified.

    Args:
        dataset_id: Unique identifier of the dataset.
        columns: Optional comma-separated list of column names to analyze.
            If None, analyzes all numeric columns.

    Returns:
        APIResponse with:
            - success: True
            - data: List of DataStatistics objects with computed metrics

    Raises:
        HTTPException 404: Dataset not found

    Example request:
        GET /datasets/abc123/statistics?columns=temperature,pressure

    Example response:
        ```json
        {
          "success": true,
          "data": [
            {
              "column": "temperature",
              "count": 1000,
              "mean": 25.5,
              "std": 2.3,
              "min": 18.0,
              "max": 32.0,
              "median": 25.0,
              "q25": 23.5,
              "q75": 27.2
            }
          ]
        }
        ```
    """
    data_service = get_data_service()
    
    if data_service.get_metadata(dataset_id) is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    col_list = columns.split(",") if columns else None
    stats = data_service.get_statistics(dataset_id, col_list)
    
    return APIResponse(
        success=True,
        data=[s.model_dump() for s in stats]
    )


@router.get("/datasets/{dataset_id}/preview", response_model=APIResponse)
async def get_preview(dataset_id: str, rows: int = 10):
    """Retrieve a preview of the dataset showing the first N rows.

    Returns the dataset head including the index (reset to 0-based) with
    all columns. Datetime values are serialized to ISO format strings.

    Args:
        dataset_id: Unique identifier of the dataset.
        rows: Number of rows to return (default: 10).

    Returns:
        APIResponse with:
            - success: True
            - data: Dict with 'columns' (list) and 'rows' (list of dicts)

    Raises:
        HTTPException 404: Dataset not found

    Example request:
        GET /datasets/abc123/preview?rows=5

    Example response:
        ```json
        {
          "success": true,
          "data": {
            "columns": ["index", "Date", "Temperature", "Pressure"],
            "rows": [
              {"index": 0, "Date": "2024-01-01T00:00:00", "Temperature": 25.3, "Pressure": 1013.2},
              {"index": 1, "Date": "2024-01-01T01:00:00", "Temperature": 24.8, "Pressure": 1013.5}
            ]
          }
        }
        ```
    """
    data_service = get_data_service()
    df = data_service.get_dataset(dataset_id)
    
    if df is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Get first N rows as dict
    preview = df.head(rows).reset_index()
    
    # Convert to serializable format
    preview_data = preview.to_dict(orient='records')
    
    # Handle datetime serialization
    for row in preview_data:
        for key, value in row.items():
            if hasattr(value, 'isoformat'):
                row[key] = value.isoformat()
    
    return APIResponse(
        success=True,
        data={
            "columns": list(preview.columns),
            "rows": preview_data
        }
    )
