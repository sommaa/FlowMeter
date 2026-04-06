"""
FastAPI routes for visualization data generation and metadata.

This module provides REST API endpoints for:
    - Plot data generation from dataset and configuration
    - Regression model predictions
    - Configuration validation
    - Available visualization types listing
    - Color palette retrieval

All endpoints return structured responses:
    - PlotDataResponse for plot data (series, labels, metadata)
    - APIResponse for other operations (success, data, errors)

Endpoints are grouped under the "Visualizations" tag in OpenAPI docs.
"""
from fastapi import APIRouter, HTTPException
from typing import Optional

from app.models.schemas import (
    APIResponse,
    VisualizationConfig,
    PlotDataRequest,
    PlotDataResponse,
    TemplateConfig,
    PredictRequest
)
from app.services.visualization_service import get_visualization_service
from app.services.data_service import get_data_service

import logging

router = APIRouter(tags=["Visualizations"])
logger = logging.getLogger(__name__)


@router.post("/plot-data", response_model=PlotDataResponse)
async def generate_plot_data(request: PlotDataRequest):
    """Generate plot data ready for frontend rendering with Plotly.

    Processes a dataset with the specified visualization configuration and
    optional global variables to produce series data, labels, and metadata.
    Uses caching for repeated requests with identical parameters.

    Request body:
        - dataset_id: Dataset identifier
        - config: VisualizationConfig (viz_type, axes, styling, etc.)
        - global_variables: Optional computed columns to add
        - date_range: Optional date filter (merged into config if not set)

    Returns:
        PlotDataResponse with:
            - series: List of data series with x/y points and styling
            - x_label, y_label: Axis labels
            - limits: Optional threshold lines
            - regression_line: Optional regression overlay
            - correlation_matrix: For correlation viz type
            - annotations: For PCA loading vectors

    Raises:
        HTTPException 404: Dataset not found
        HTTPException 400: Invalid configuration (ValueError)
        HTTPException 500: Processing error

    Example request:
        ```json
        {
          "dataset_id": "abc123",
          "config": {
            "viz_type": "universal",
            "axis": {"x_axis": "Date", "y_axis": ["Temperature"]},
            "style": {"plot_type": "line"}
          }
        }
        ```
    """
    data_service = get_data_service()
    
    # Check dataset exists
    if data_service.get_metadata(request.dataset_id) is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    try:
        viz_service = get_visualization_service()
        
        # Merge global date_range into config if provided
        config = request.config
        if request.date_range and not config.date_range:
            config.date_range = request.date_range
        
        plot_data = viz_service.generate_plot_data(
            request.dataset_id, 
            config,
            request.global_variables
        )
        return plot_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate plot: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate plot: {str(e)}")


@router.post("/predict", response_model=APIResponse)
async def predict_regression(request: PredictRequest):
    """Train a regression model and make a prediction for given inputs.

    Trains a regression model using the dataset and configuration (target,
    predictors, model type), then predicts the target value for the provided
    input feature values. Supports global variables if predictors reference them.

    Request body:
        - dataset_id: Dataset identifier for training
        - config: VisualizationConfig with regression settings
        - inputs: Dict mapping predictor names to values
        - global_variables: Optional computed columns

    Returns:
        APIResponse with:
            - success: True
            - data: {"prediction": float value}

    Raises:
        HTTPException 404: Dataset not found
        HTTPException 500: Training or prediction error

    Example request:
        ```json
        {
          "dataset_id": "abc123",
          "config": {
            "viz_type": "regression",
            "axis": {"y_axis": ["power"]},
            "regression": {
              "predictors": ["temperature", "pressure"],
              "model_type": "linear"
            }
          },
          "inputs": {"temperature": 350, "pressure": 15}
        }
        ```

    Example response:
        ```json
        {"success": true, "data": {"prediction": 1250.5}}
        ```
    """
    data_service = get_data_service()
    if data_service.get_metadata(request.dataset_id) is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    try:
        viz_service = get_visualization_service()
        # We need to get the dataframe first
        # Since logic isn't split perfectly, we'll use a hack or refactor?
        # generate_plot_data calls internal methods.
        # We need the dataframe.
        # Let's peek at generate_plot_data.
        # It calls: df = self.data_loader.load_dataset(dataset_id)
        # But we don't have direct access here.
        # We can call visualization_service.predict_regression(df, ...)
        # How to get DF?
        # Access data service directly.
        
        df = data_service.get_dataset(request.dataset_id)
        if df is None:
             raise HTTPException(status_code=404, detail="Dataset data not found")
             
        # Apply global variables if needed?
        # If the predictor depends on a global variable, we need it.
        # The service `generate_plot_data` does:
        # df = self._compute_global_variables(df, global_variables)
        # We should probably expose that or duplicate it.
        # Accessing protected method `_compute_global_variables` is risky but needed.
        
        df = viz_service.compute_global_variables(df, request.global_variables)
        
        result = viz_service.predict_regression(df, request.config, request.inputs)
        
        return APIResponse(success=True, data={"prediction": result})
        
    except Exception as e:
        logger.error(f"Prediction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@router.post("/validate-config", response_model=APIResponse)
async def validate_config(config: VisualizationConfig):
    """
    Validate a visualization configuration.
    
    Returns validation result with any errors or warnings.
    """
    viz_service = get_visualization_service()
    result = viz_service.validate_config(config)
    
    return APIResponse(
        success=result["valid"],
        data=result
    )


@router.get("/types", response_model=APIResponse)
async def get_visualization_types():
    """Get list of available visualization types with descriptions."""
    types = [
        {"id": "line", "name": "📈 Line Plot", "description": "Line chart for time series and continuous data"},
        {"id": "scatter", "name": "🔵 Scatter Plot", "description": "Scatter plot for correlation analysis"},
        {"id": "bar", "name": "📊 Bar Chart", "description": "Bar chart for categorical comparisons"},
        {"id": "area", "name": "📉 Area Chart", "description": "Filled area chart for cumulative data"},
        {"id": "hist", "name": "📊 Histogram", "description": "Distribution of values"},
        {"id": "box", "name": "📦 Box Plot", "description": "Statistical distribution with quartiles"},
        {"id": "step", "name": "📈 Step Plot", "description": "Step chart for discrete changes"},
        {"id": "regression", "name": "🔬 Regression Analysis", "description": "Linear/polynomial regression"},
        {"id": "pca", "name": "🧮 PCA Analysis", "description": "Principal Component Analysis with biplot"},
        {"id": "anomaly", "name": "🔍 Anomaly Detection", "description": "Identify outliers using statistical thresholds"},
        {"id": "formula", "name": "🔢 Custom Formula", "description": "Plot custom calculated values"},
        {"id": "multi_axis", "name": "📈 Multi-Axis Plot", "description": "Multiple variables on same plot"},
    ]
    
    return APIResponse(
        success=True,
        data=types
    )


@router.get("/colors", response_model=APIResponse)
async def get_color_palette():
    """Get the available color palette."""
    colors = [
        '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
        '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
        '#393b79', '#637939', '#8c6d31', '#843c39', '#7b4173',
        '#3182bd', '#31a354', '#756bb1', '#636363', '#e6550d',
    ]
    
    return APIResponse(
        success=True,
        data=colors
    )
