"""
Visualization data generation service for FlowMeter dashboards.

This module provides the VisualizationService class, which orchestrates
the transformation of raw dataset data into PlotDataResponse objects
ready for frontend rendering with Plotly.

The service handles:
    - Dataset lookup and caching
    - Global variable computation
    - Date range filtering
    - Routing to visualization-type specific generators
    - Configuration validation

Supported visualization types:
    - universal: General plots (line, scatter, bar, step)
    - area: Stacked area charts
    - histogram: Distribution histograms
    - box: Box-and-whisker plots
    - regression: ML regression with multiple models
    - pca: Principal Component Analysis biplots
    - formula: Custom calculated fields
    - correlation: Correlation matrix heatmaps

Performance optimization:
    - LRU caching for repeated requests with same config
    - Separate cache for global variable computation
"""
import pandas as pd
import json
import functools
import os
from typing import Optional

from app.models.schemas import (
    VisualizationConfig,
    VisualizationType,
    PlotDataResponse,
    GlobalVariable,
)
from app.services.data_service import get_data_service
from app.core.profiler import profile_performance

# Import refactored modules
from app.services.visualization.processing import compute_global_variables
from app.services.visualization.validation import validate_config
from app.services.visualization.regression import RegressionEngine, MODEL_DIR
from app.services.visualization import plotting
from app.services.visualization import fft
from app.services.visualization import root_cause

class VisualizationService:
    """Orchestrates visualization data generation from datasets.

    This service provides the main entry points for generating plot data
    from stored datasets or DataFrames. It handles caching, global variable
    computation, and routing to visualization-type specific generators.

    Attributes:
        data_service: DataService instance for dataset lookups.

    Example:
        >>> service = get_visualization_service()
        >>> response = service.generate_plot_data(
        ...     dataset_id="main",
        ...     config=viz_config,
        ...     global_variables=[GlobalVariable(...)]
        ... )
        >>> # response.series contains data ready for Plotly
    """

    def __init__(self):
        """Initialize the service with a data service instance."""
        self.data_service = get_data_service()

    def clear_caches(self):
        """Clear all LRU caches to invalidate stale data.
        
        Should be called when the underlying dataset is modified (e.g., after
        reconciliation) to ensure subsequent requests fetch fresh data.
        """
        self._generate_cached.cache_clear()
        self._get_dataset_with_globals_cached.cache_clear()

    @profile_performance
    def generate_plot_data(
        self,
        dataset_id: str,
        config: VisualizationConfig,
        global_variables: list[GlobalVariable] = None
    ) -> PlotDataResponse:
        """Generate plot data for a stored dataset with caching.

        Main entry point for API endpoints. Looks up the dataset by ID,
        applies global variables and date filtering, then routes to the
        appropriate visualization generator.

        Args:
            dataset_id: Identifier of the dataset in the data service.
            config: VisualizationConfig defining the chart type and settings.
            global_variables: Optional list of computed variables to add
                as columns to the dataset.

        Returns:
            PlotDataResponse containing series, labels, and metadata ready
            for frontend rendering.

        Note:
            Results are cached via _generate_cached to speed up repeated
            requests with identical parameters.
        """
        g_vars_json = "[]"
        if global_variables:
             g_vars_json = json.dumps([g.model_dump() for g in global_variables])
        
        return self._generate_cached(dataset_id, config.model_dump_json(), g_vars_json)

    @functools.lru_cache(maxsize=32)
    def _generate_cached(self, dataset_id: str, config_json: str, global_vars_str: str) -> PlotDataResponse:
        """Cached wrapper for plot generation using JSON-serialized arguments.

        Uses functools.lru_cache to cache results based on dataset_id, config,
        and global variables. Arguments are serialized to JSON strings to ensure
        they are hashable for the cache key.

        Args:
            dataset_id: Dataset identifier.
            config_json: VisualizationConfig serialized as JSON string.
            global_vars_str: List of GlobalVariable objects serialized as JSON.

        Returns:
            Cached or freshly generated PlotDataResponse.

        Note:
            Cache size is 32 entries. The cache is instance-specific and
            cleared when the service is recreated.
        """
        # Deserialize configuration
        config = VisualizationConfig.model_validate_json(config_json)
        
        # Deserialize Global Variables
        # We accept passing global variables as a serialized JSON string to allow caching.
        # This wrapper then deserializes them back to the Pydantic models required by the internal logic.
        g_vars = []
        try:
            if global_vars_str and global_vars_str != "[]":
                raw = json.loads(global_vars_str)
                g_vars = [GlobalVariable(**g) for g in raw]
        except (json.JSONDecodeError, ValueError):
            # Fallback for caching safety
            g_vars = []

        return self._generate_plot_data_internal(dataset_id, config, g_vars)
    
    @staticmethod
    def compute_global_variables(df: pd.DataFrame, global_variables: list[GlobalVariable]) -> pd.DataFrame:
        """Compute global variables and add them as columns to the DataFrame.

        Delegates to the processing module's compute_global_variables function
        to evaluate formulas and create new derived columns.

        Args:
            df: Source DataFrame to augment.
            global_variables: List of GlobalVariable definitions with formulas.

        Returns:
            DataFrame with additional computed columns.

        Example:
            >>> gvar = GlobalVariable(name="efficiency", formula="power / fuel * 100")
            >>> df_with_vars = service.compute_global_variables(df, [gvar])
            >>> "efficiency" in df_with_vars.columns
            True
        """
        return compute_global_variables(df, global_variables)

    def validate_config(self, config: VisualizationConfig) -> dict:
        """Validate a visualization configuration for errors and warnings.

        Checks that the configuration is complete and valid for rendering.
        Used by the API to provide feedback before attempting to generate plots.

        Args:
            config: VisualizationConfig to validate.

        Returns:
            Dictionary with keys:
                - valid (bool): True if no errors
                - errors (list): Critical issues that prevent rendering
                - warnings (list): Non-critical issues or suggestions
        """
        return validate_config(config)

    def _generate_plot_data_internal(
        self,
        dataset_id: str,
        config: VisualizationConfig,
        global_variables: list[GlobalVariable] = None
    ) -> PlotDataResponse:
        """Internal implementation of plot data generation.

        Handles dataset lookup, global variable computation, date filtering,
        and routing to the appropriate visualization handler. This is the
        core logic called by both generate_plot_data and _generate_cached.

        Args:
            dataset_id: Dataset identifier.
            config: Visualization configuration.
            global_variables: Optional global variables to compute.

        Returns:
            PlotDataResponse with series data.

        Raises:
            ValueError: If dataset is not found or viz_type is unsupported.
        """
        df = self.data_service.get_dataset(dataset_id)
        if df is None:
            raise ValueError(f"Dataset {dataset_id} not found")
        
        # Compute global variables (Cached)
        # We need to pass the globals as JSON/string because list[GlobalVariable] is not hashable
        if global_variables:
            g_vars_json = json.dumps([g.model_dump() for g in global_variables], sort_keys=True)
            df = self._get_dataset_with_globals_cached(dataset_id, g_vars_json)
            
        # Filter by date range if provided
        if config.date_range and config.date_range.get("start") and config.date_range.get("end"):
            start_date = pd.to_datetime(config.date_range["start"])
            end_date = pd.to_datetime(config.date_range["end"])
            
            print(f"[DEBUG] Filtering date range: {start_date} to {end_date}")
            print(f"[DEBUG] Index type: {type(df.index)}")
            if hasattr(df.index, 'dtype'):
                 print(f"[DEBUG] Index dtype: {df.index.dtype}")
            
            # Check if index is datetime
            if isinstance(df.index, pd.DatetimeIndex):
                # Ensure timezone awareness consistency
                if start_date.tzinfo and df.index.tz is None:
                     print("[DEBUG] Localizing index to UTC")
                     df.index = df.index.tz_localize('UTC')
                elif start_date.tzinfo is None and df.index.tz:
                     print("[DEBUG] Converting start/end to offset-naive")
                     start_date = start_date.tz_localize(None)
                     end_date = end_date.tz_localize(None)
                
                # Inclusive filtering
                mask = (df.index >= start_date) & (df.index <= end_date)
                df = df[mask]
                print(f"[DEBUG] Rows after filtering: {len(df)}")
            else:
                print("[DEBUG] Index is NOT DatetimeIndex - skipping filter")
                pass
        
        # Route to appropriate handler based on visualization type
        handlers = {
            VisualizationType.UNIVERSAL: plotting.generate_universal_data,  # General Plot (line, scatter, bar, step)
            VisualizationType.AREA: plotting.generate_area_data,  # Area has specific stacking logic
            VisualizationType.HISTOGRAM: plotting.generate_histogram_data,
            VisualizationType.BOX: plotting.generate_box_data,
            VisualizationType.REGRESSION: plotting.generate_regression_data,
            VisualizationType.PCA: plotting.generate_pca_data,
            VisualizationType.FORMULA: plotting.generate_formula_data,
            VisualizationType.CORRELATION: plotting.generate_correlation_data,
            VisualizationType.FFT: fft.generate_fft_data,
            VisualizationType.ROOT_CAUSE: root_cause.generate_root_cause_data,
        }
        
        handler = handlers.get(config.viz_type)
        if handler is None:
            raise ValueError(f"Unsupported visualization type: {config.viz_type}")
        
        return handler(df, config)
    
    def generate_plot_data_from_df(
        self,
        df: pd.DataFrame,
        config: VisualizationConfig,
        global_variables: list[GlobalVariable] = None
    ) -> PlotDataResponse:
        """Generate plot data directly from a DataFrame without dataset lookup.

        Alternative entry point for the export service, which already has
        the DataFrame loaded and doesn't need dataset_id-based lookup.
        Bypasses caching since exports are one-time operations.

        Args:
            df: The source DataFrame to visualize.
            config: VisualizationConfig defining chart type and settings.
            global_variables: Optional list of global variables to compute.

        Returns:
            PlotDataResponse with series data ready for rendering.

        Raises:
            ValueError: If viz_type is unsupported.

        Note:
            This method does NOT use caching. For cached generation from
            stored datasets, use generate_plot_data instead.
        """
        # Compute global variables if provided
        if global_variables:
            df = self.compute_global_variables(df, global_variables)
        
        # Filter by date range if provided
        if config.date_range and config.date_range.get("start") and config.date_range.get("end"):
            start_date = pd.to_datetime(config.date_range["start"])
            end_date = pd.to_datetime(config.date_range["end"])
            
            if isinstance(df.index, pd.DatetimeIndex):
                if start_date.tzinfo and df.index.tz is None:
                    df.index = df.index.tz_localize('UTC')
                elif start_date.tzinfo is None and df.index.tz:
                    start_date = start_date.tz_localize(None)
                    end_date = end_date.tz_localize(None)
                
                mask = (df.index >= start_date) & (df.index <= end_date)
                df = df[mask]
        
        # Route to appropriate handler
        handlers = {
            VisualizationType.UNIVERSAL: plotting.generate_universal_data,
            VisualizationType.AREA: plotting.generate_area_data,
            VisualizationType.HISTOGRAM: plotting.generate_histogram_data,
            VisualizationType.BOX: plotting.generate_box_data,
            VisualizationType.REGRESSION: plotting.generate_regression_data,
            VisualizationType.PCA: plotting.generate_pca_data,
            VisualizationType.FORMULA: plotting.generate_formula_data,
            VisualizationType.CORRELATION: plotting.generate_correlation_data,
            VisualizationType.FFT: fft.generate_fft_data,
            VisualizationType.ROOT_CAUSE: root_cause.generate_root_cause_data,
        }
        
        handler = handlers.get(config.viz_type)
        if handler is None:
            raise ValueError(f"Unsupported visualization type: {config.viz_type}")
        
        return handler(df, config)
    
    @functools.lru_cache(maxsize=8)
    def _get_dataset_with_globals_cached(self, dataset_id: str, global_vars_json: str) -> pd.DataFrame:
        """Retrieve dataset and compute global variables with caching.

        Separate cache for dataset+globals combinations to avoid recomputing
        expensive formula evaluations when the same globals are used across
        multiple visualization requests.

        Args:
            dataset_id: Dataset identifier.
            global_vars_json: GlobalVariable list serialized as JSON string.

        Returns:
            DataFrame with computed global variable columns.

        Raises:
            ValueError: If dataset is not found.
        """
        df = self.data_service.get_dataset(dataset_id)
        if df is None:
             raise ValueError(f"Dataset {dataset_id} not found")
             
        # Parse globals
        # Import internally to avoid circular imports if any, though schemas is safe
        try:
             raw = json.loads(global_vars_json)
             g_vars = [GlobalVariable(**g) for g in raw]
        except:
             return df
             
        return self.compute_global_variables(df, g_vars)

    def predict_regression(self, df: pd.DataFrame, config: VisualizationConfig, inputs: dict) -> float:
        """Train a regression model and make a prediction for given inputs.

        Trains a regression model using the configuration settings, then
        predicts the target value for the provided input feature values.
        Respects date range filtering if configured.

        Args:
            df: Source DataFrame for training.
            config: VisualizationConfig with regression settings (target,
                predictors, model_type, etc.).
            inputs: Dictionary mapping predictor column names to their
                values for prediction (e.g., {"temp": 350, "pressure": 15}).

        Returns:
            Predicted target value as a float.

        Note:
            Delegates to RegressionEngine.predict_regression for the
            actual model training and prediction logic.
        """
        # Filter by date range if provided in config
        # This ensures the prediction model matches the one seen in the visualization
        if config.date_range and config.date_range.get("start") and config.date_range.get("end"):
            from app.services.export_helpers.utils import filter_dataframe_by_date
            df = filter_dataframe_by_date(df, config.date_range)
            
        return RegressionEngine.predict_regression(df, config, inputs)

    def save_trained_model(self, df: pd.DataFrame, config: VisualizationConfig, name: str) -> dict:
        """Train a regression model and save it to disk for reuse.

        Trains a model using the current config and serializes it to the
        MODEL_DIR directory for later loading and prediction without retraining.

        Args:
            df: Source DataFrame for training.
            config: VisualizationConfig with regression settings.
            name: Filename for the saved model (without extension).

        Returns:
            Dictionary with keys:
                - success (bool): Whether save succeeded
                - path (str): Full path to the saved model file
                - message (str): Success or error message

        Note:
            Delegates to RegressionEngine.save_trained_model for
            serialization logic.
        """
        return RegressionEngine.save_trained_model(df, config, name)


# Global service instance (singleton pattern)
_viz_service: Optional[VisualizationService] = None


def get_visualization_service() -> VisualizationService:
    """Get the global singleton VisualizationService instance.

    Creates the service on first call and returns the same instance
    for subsequent calls. This ensures caches are shared across
    the application.

    Returns:
        The shared VisualizationService instance.
    """
    global _viz_service
    if _viz_service is None:
        _viz_service = VisualizationService()
    return _viz_service
