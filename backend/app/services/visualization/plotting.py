"""Plot data generation functions for various visualization types.

This module provides functions to generate plot data from DataFrames for
different chart types supported by the application:

- Line, scatter, area, step charts
- Bar charts and histograms
- Box plots with outlier detection
- Regression analysis plots
- PCA biplots (correlation circles)
- Correlation matrix heatmaps
- Custom formula plots
- Multi-axis and universal plots with per-series configuration

Each generator function takes a DataFrame and VisualizationConfig, returning
a PlotDataResponse with series data ready for Plotly rendering.
"""

import numpy as np
import pandas as pd
from scipy.stats import gaussian_kde
from typing import Optional, List, Dict, Any
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

from app.models.schemas import (
    VisualizationConfig,
    PlotDataSeries,
    PlotDataResponse,
    PlotType
)
from app.services.visualization.processing import (
    get_x_data,
    get_y_label,
    get_color,
    get_legend_label,
    downsample_series,
    column_exists,
    get_column_data,
    COLORS
)
from app.services.visualization.regression import RegressionEngine
from app.services.formula_safety import safe_exec

import logging

logger = logging.getLogger(__name__)


def _parse_bounds(bounds_str: str) -> Optional[List[float]]:
    """Parse comma-separated bounds string to list of floats.

    Supports 'inf', '+inf', and '-inf' for unbounded parameters.

    Args:
        bounds_str: Comma-separated string of bound values (e.g., "0, -inf, 100").

    Returns:
        List of float bounds, or None if input is empty.

    Example:
        >>> _parse_bounds("-inf, 0, inf")
        [-inf, 0.0, inf]
    """
    if not bounds_str:
        return None
    result = []
    for val in bounds_str.split(','):
        val = val.strip().lower()
        if val in ('inf', '+inf'):
            result.append(np.inf)
        elif val == '-inf':
            result.append(-np.inf)
        else:
            try:
                result.append(float(val))
            except ValueError:
                result.append(np.inf if 'upper' in bounds_str else -np.inf)
    return result if result else None

def generate_line_data(df: pd.DataFrame, config: VisualizationConfig) -> PlotDataResponse:
    """Generate line plot data with optional regression analysis.

    Creates line series for each Y-axis variable, with automatic downsampling
    using LTTB algorithm for large datasets.

    Args:
        df: Source DataFrame containing the data columns.
        config: Visualization configuration specifying axis variables,
            styling, and optional regression settings.

    Returns:
        PlotDataResponse with line series, optional regression line and CI bands.

    Raises:
        ValueError: If specified Y-axis columns are not found in the DataFrame.
    """
    x_data, x_label = get_x_data(df, config)
    y_label = get_y_label(config)
    
    series = []
    missing_cols = []
    for idx, col in enumerate(config.axis.y_axis):
        if not column_exists(df, col):
            missing_cols.append(col)
            continue
        
        y_data = get_column_data(df, col).tolist()
        label = get_legend_label(idx, col, config)
        color = get_color(idx, config)
        
        # Downsample if needed
        # NOTE: Area charts (stacked) require identical X-axes for all series.
        # LTTB downsamples each series differently based on its own peaks/valleys,
        # causing misalignment and glitches. We disable it for AREA.
        if config.viz_type.value != "area":
            ds_x, ds_y = downsample_series(x_data, y_data)
        else:
            ds_x, ds_y = x_data, y_data
        
        series.append(PlotDataSeries(
            name=label,
            data=[{"x": x, "y": y} for x, y in zip(ds_x, ds_y)],
            color=color,
            type="line"
        ))
        
    if not series and config.axis.y_axis:
         # If we tried to plot columns but none were found, raise error
         available = list(df.columns[:5]) + (["..."] if len(df.columns) > 5 else [])
         raise ValueError(f"Columns not found in dataset: {', '.join(missing_cols)}. Available: {available}")
    
    # Add regression if enabled
    regression_line = None
    reg_model = None
    if config.regression.added and series:
        first_y = get_column_data(df, config.axis.y_axis[0]).tolist()
        regression_line, ci_series, reg_model = RegressionEngine.add_regression(
            x_data, 
            first_y, 
            config.regression.degree,
            config.regression.remove_outliers,
            model_type=config.regression.model_type,
            alpha=config.regression.alpha,
            l1_ratio=config.regression.l1_ratio,
            rf_params={
                'n_estimators': config.regression.rf_n_estimators,
                'max_depth': config.regression.rf_max_depth,
                'min_samples_split': config.regression.rf_min_samples_split,
                'min_samples_leaf': config.regression.rf_min_samples_leaf
            },
            line_color=config.regression.line_color,
            custom_formula=config.regression.custom_formula,
            custom_params=[p.strip() for p in config.regression.custom_params.split(',')] if config.regression.custom_params else [],
            custom_guesses=[float(g.strip()) for g in config.regression.custom_initial_guesses.split(',')] if config.regression.custom_initial_guesses else [],
            custom_bounds_lower=_parse_bounds(config.regression.custom_bounds_lower),
            custom_bounds_upper=_parse_bounds(config.regression.custom_bounds_upper),
            dataframe=df,
            predictor_names=[config.axis.x_axis] if config.axis.x_axis != "Index" and config.axis.x_axis in df.columns else ["Index"],
            iqr_multiplier=config.regression.iqr_multiplier or 1.5
        )
        if ci_series:
            series.extend(ci_series)

    
    # Build limits
    limits = config.limits.thresholds if config.limits.thresholds else None
    
    return PlotDataResponse(
        title=config.title,
        series=series,
        x_label=x_label,
        y_label=y_label,
        regression_line=regression_line,
        regression_model=reg_model,
        limits=limits
    )

def generate_scatter_data(df: pd.DataFrame, config: VisualizationConfig) -> PlotDataResponse:
    """Generate scatter plot data.

    Reuses line plot generation but changes series type to 'scatter'.
    Preserves regression lines and confidence intervals as line type.

    Args:
        df: Source DataFrame.
        config: Visualization configuration.

    Returns:
        PlotDataResponse with scatter series.
    """
    response = generate_line_data(df, config)
    # Change type to scatter, but preserve regression lines/CI
    for s in response.series:
        if not s.name.startswith("Reg:") and "95% CI" not in s.name and "Regression" not in s.name:
            s.type = "scatter"
    return response

def generate_bar_data(df: pd.DataFrame, config: VisualizationConfig) -> PlotDataResponse:
    """Generate bar chart data.

    Creates bar series for each Y-axis variable without downsampling.

    Args:
        df: Source DataFrame.
        config: Visualization configuration.

    Returns:
        PlotDataResponse with bar series.
    """
    x_data, x_label = get_x_data(df, config)
    y_label = get_y_label(config)
    
    series = []
    for idx, col in enumerate(config.axis.y_axis):
        if col not in df.columns:
            continue
        
        y_data = df[col].tolist()
        label = get_legend_label(idx, col, config)
        color = get_color(idx, config)
        
        series.append(PlotDataSeries(
            name=label,
            data=[{"x": x, "y": y} for x, y in zip(x_data, y_data)],
            color=color,
            type="bar"
        ))
    
    return PlotDataResponse(
        title=config.title,
        series=series,
        x_label=x_label,
        y_label=y_label
    )

def generate_area_data(df: pd.DataFrame, config: VisualizationConfig) -> PlotDataResponse:
    """Generate stacked area chart data.

    Reuses line plot generation but changes series type to 'area'.
    Note: Downsampling is disabled for area charts to prevent misalignment.

    Args:
        df: Source DataFrame.
        config: Visualization configuration.

    Returns:
        PlotDataResponse with area series.
    """
    response = generate_line_data(df, config)
    for s in response.series:
        s.type = "area"
    return response

def generate_histogram_data(df: pd.DataFrame, config: VisualizationConfig) -> PlotDataResponse:
    """Generate histogram data with 30 bins.

    Computes frequency distribution for each Y-axis variable using numpy histogram.

    Args:
        df: Source DataFrame.
        config: Visualization configuration.

    Returns:
        PlotDataResponse with bar series representing histogram bins.
    """
    series = []
    
    for idx, col in enumerate(config.axis.y_axis):
        if col not in df.columns:
            continue
        
        data = df[col].dropna()
        
        # Get bin count and axis from series config
        bins = 30
        y_axis_id = "left"
        if col in config.series_configs:
            if config.series_configs[col].bins:
                bins = config.series_configs[col].bins
            if config.series_configs[col].y_axis_id:
                y_axis_id = config.series_configs[col].y_axis_id

        hist, bin_edges = np.histogram(data, bins=bins)
        
        label = get_legend_label(idx, col, config)
        color = get_color(idx, config)
        
        # Convert to bar chart format
        series.append(PlotDataSeries(
            name=label,
            data=[{"x": float(bin_edges[i]), "y": int(hist[i])} for i in range(len(hist))],
            color=color,
            type="bar",
            y_axis_id=y_axis_id
        ))

        # Add KDE if enabled
        if config.series_configs.get(col) and config.series_configs[col].show_kde:
            try:
                # Calculate KDE
                kde = gaussian_kde(data)
                
                # Generate x points for smooth curve
                x_min, x_max = data.min(), data.max()
                padding = (x_max - x_min) * 0.1 if x_max != x_min else 1.0
                x_grid = np.linspace(x_min - padding, x_max + padding, 200)
                
                # Calculate bin width for scaling
                # np.histogram with int bins produces uniform bins
                bin_width = bin_edges[1] - bin_edges[0]
                
                # Scale PDF to matching count: pdf * count * bin_width
                y_kde = kde(x_grid) * len(data) * bin_width
                
                series.append(PlotDataSeries(
                    name=f"{label} (KDE)",
                    data=[{"x": float(x), "y": float(y)} for x, y in zip(x_grid, y_kde)],
                    color=color,
                    type="line",
                    y_axis_id=y_axis_id
                ))
            except Exception as e:
                # Log error but continue (e.g., typically singular matrix for const data)
                logger.warning(f"KDE generation failed for {col}: {e}")
    
    y_label = get_y_label(config)
    
    return PlotDataResponse(
        title=config.title,
        series=series,
        x_label="Value",
        y_label="Frequency"
    )

def generate_box_data(df: pd.DataFrame, config: VisualizationConfig) -> PlotDataResponse:
    """Generate box plot data with quartiles and outliers.

    Calculates box plot statistics (Q1, median, Q3) and identifies outliers
    using the 1.5*IQR rule for each Y-axis variable.

    Args:
        df: Source DataFrame.
        config: Visualization configuration.

    Returns:
        PlotDataResponse with box series containing:
            - low: lower fence (max of min value or Q1 - 1.5*IQR)
            - q1: first quartile
            - median: second quartile
            - q3: third quartile
            - high: upper fence (min of max value or Q3 + 1.5*IQR)
            - outliers: list of values outside fences
    """
    series = []
    
    for idx, col in enumerate(config.axis.y_axis):
        if col not in df.columns:
            continue
        
        data = df[col].dropna()
        color = get_color(idx, config)
        
        # Calculate box plot statistics
        q1 = float(data.quantile(0.25))
        q2 = float(data.quantile(0.5))  # median
        q3 = float(data.quantile(0.75))
        iqr = q3 - q1
        lower_fence = max(float(data.min()), q1 - 1.5 * iqr)
        upper_fence = min(float(data.max()), q3 + 1.5 * iqr)
        
        # Find outliers
        outliers = data[(data < lower_fence) | (data > upper_fence)].tolist()
        
        series.append(PlotDataSeries(
            name=col,
            data=[{
                "x": col,
                "low": lower_fence,
                "q1": q1,
                "median": q2,
                "q3": q3,
                "high": upper_fence,
                "outliers": outliers
            }],
            color=color,
            type="box"
        ))
    
    return PlotDataResponse(
        title=config.title,
        series=series,
        x_label="Variable",
        y_label="Value"
    )

def generate_step_data(df: pd.DataFrame, config: VisualizationConfig) -> PlotDataResponse:
    """Generate step plot data (staircase line).

    Reuses line plot generation but changes series type to 'step'.

    Args:
        df: Source DataFrame.
        config: Visualization configuration.

    Returns:
        PlotDataResponse with step series.
    """
    response = generate_line_data(df, config)
    for s in response.series:
        s.type = "step"
    return response

def generate_regression_data(df: pd.DataFrame, config: VisualizationConfig) -> PlotDataResponse:
    """Generate dedicated regression analysis visualization.

    Creates a scatter plot of actual values with a fitted regression line
    and 95% confidence interval bands. Supports single-variable and
    multi-variable regression with various model types.

    Args:
        df: Source DataFrame.
        config: Visualization configuration including regression settings:
            - model_type: linear, ridge, lasso, elastic_net, random_forest, custom
            - degree: polynomial degree
            - predictors: list of predictor columns for multi-variable regression
            - remove_outliers: IQR-based outlier filtering
            - custom_formula: formula string for custom model type

    Returns:
        PlotDataResponse with scatter series (actual data), regression line,
        CI bands, and RegressionModel metadata.

    Raises:
        ValueError: If Y-axis column not found in DataFrame.
    """
    # Use configured X-Axis (Generic)
    x_data, x_label = get_x_data(df, config)
    
    logger.debug(f"Generating Regression: Model={config.regression.model_type}, Predictors={config.regression.predictors}, RemoveOutliers={config.regression.remove_outliers}, X-Axis={config.axis.x_axis}")
    
    if not config.axis.y_axis:
        # Return empty response instead of error to allow UI configuration
        return PlotDataResponse(
            title="Select a Y-axis variable",
            series=[],
            x_label="",
            y_label="",
            regression_equation=None
        )
    
    y_col = config.axis.y_axis[0]
    if y_col not in df.columns:
        raise ValueError(f"Column {y_col} not found")
    
    y_data = df[y_col].tolist()
    y_label = config.axis.y_label or y_col
    color = COLORS[0]
    
    # Scatter points (Actual)
    # Downsample if needed
    ds_x, ds_y = downsample_series(x_data, y_data)
    
    # Use custom legend label if available
    legend_label = get_legend_label(0, y_col, config)
    
    scatter_series = PlotDataSeries(
        name=legend_label,
        data=[{"x": x, "y": y} for x, y in zip(ds_x, ds_y)],
        color=color,
        type="scatter"
    )
    
    # Regression line
    regression_line = None
    ci_series = []
    regression_equation = None
    reg_model = None
    
    if config.regression.predictors and config.regression.model_type != 'custom':
         regression_line, ci_series, regression_equation, reg_model = RegressionEngine.add_multivariable_regression(df, y_col, config.regression.predictors, config)
    else:
         regression_line, ci_series, reg_model = RegressionEngine.add_regression(
             x_data, 
             y_data, 
             config.regression.degree,
             config.regression.remove_outliers,
             model_type=config.regression.model_type,
             alpha=config.regression.alpha,
             l1_ratio=config.regression.l1_ratio,
             rf_params={
                'n_estimators': config.regression.rf_n_estimators,
                'max_depth': config.regression.rf_max_depth,
                'min_samples_split': config.regression.rf_min_samples_split,
                'min_samples_leaf': config.regression.rf_min_samples_leaf
             },
             line_color=config.regression.line_color,
             custom_formula=config.regression.custom_formula,
             custom_params=[p.strip() for p in config.regression.custom_params.split(',')] if config.regression.custom_params else [],
             custom_guesses=[float(g.strip()) for g in config.regression.custom_initial_guesses.split(',')] if config.regression.custom_initial_guesses else [],
             custom_bounds_lower=_parse_bounds(config.regression.custom_bounds_lower),
             custom_bounds_upper=_parse_bounds(config.regression.custom_bounds_upper),
             custom_loss=config.regression.custom_loss,
             custom_method=config.regression.custom_method,
             dataframe=df,
             predictor_names=[config.axis.x_axis] if config.axis.x_axis != "Index" and config.axis.x_axis in df.columns else ["Index"],
             iqr_multiplier=config.regression.iqr_multiplier or 1.5
         )
         # Extract formula from name if possible or reconstruct simple one
         if regression_line:
             regression_equation = regression_line.name.split("Reg: ")[1].split(" |")[0] if "Reg: " in regression_line.name else None
    
    series = [scatter_series]
    if regression_line:
        series.append(regression_line)
        series.extend(ci_series)
    
    return PlotDataResponse(
        title=config.title,
        series=series,
        x_label=x_label,
        y_label=y_label,
        regression_equation=regression_equation,
        regression_model=reg_model
    )

def generate_pca_data(df: pd.DataFrame, config: VisualizationConfig) -> PlotDataResponse:
    """Generate PCA correlation circle (biplot) visualization.

    Performs Principal Component Analysis on selected variables and creates
    a correlation circle showing variable loadings on the first two components.
    Loading vectors are normalized so the longest has length 1.

    Args:
        df: Source DataFrame.
        config: Visualization configuration with:
            - axis.y_axis: List of numeric variables for PCA (minimum 2)
            - pca.show_loadings: Whether to display loading arrows

    Returns:
        PlotDataResponse with:
            - Circle outline series (radius 1)
            - Annotations for loading arrows with variable labels
            - Axis labels showing explained variance percentages

    Raises:
        ValueError: If fewer than 2 variables selected or insufficient data.
    """
    if len(config.axis.y_axis) < 2:
        raise ValueError("PCA requires at least 2 variables")
    
    # Get data and drop NaN
    data = df[config.axis.y_axis].dropna()
    
    if len(data) < 3:
        raise ValueError("Not enough data points for PCA")
    
    # Standardize and fit PCA (always use 2 components for biplot)
    scaler = StandardScaler()
    data_scaled = scaler.fit_transform(data)
    
    pca = PCA(n_components=2)
    pca.fit(data_scaled)
    
    series = []
    annotations = []
    
    # Loading vectors (correlation circle style - max length exactly 1)
    if config.pca.show_loadings:
        # Get loadings: components scaled by sqrt of eigenvalues give correlations
        loadings = pca.components_[:2, :].T * np.sqrt(pca.explained_variance_[:2])
        
        # Always normalize so max length is exactly 1
        max_norm = np.linalg.norm(loadings, axis=1).max()
        loadings = loadings / max_norm  # Now longest vector is exactly 1
        
        for i, var in enumerate(config.axis.y_axis):
            annotations.append({
                "type": "arrow",
                "x0": 0,
                "y0": 0,
                "x1": float(loadings[i, 0]),
                "y1": float(loadings[i, 1]),
                "label": var
            })
    
    # Add circle annotation (for correlation circle with radius 1)
    # Generate points for a circle
    theta = np.linspace(0, 2 * np.pi, 100)
    circle_x = np.cos(theta).tolist()
    circle_y = np.sin(theta).tolist()
    
    # Add circle as a special series
    series.append(PlotDataSeries(
        name="_circle",  # Underscore prefix means hidden from legend
        data=[{"x": x, "y": y} for x, y in zip(circle_x, circle_y)],
        color="#888888",  # Grey circle outline
        type="line"
    ))
    
    x_label = config.axis.x_label or f"PC1 ({pca.explained_variance_ratio_[0]:.1%} variance)"
    y_label = config.axis.y_label or f"PC2 ({pca.explained_variance_ratio_[1]:.1%} variance)"
    
    return PlotDataResponse(
        title=config.title,
        series=series,
        x_label=x_label,
        y_label=y_label,
        annotations=annotations
    )

def generate_correlation_data(df: pd.DataFrame, config: VisualizationConfig) -> PlotDataResponse:
    """Generate correlation matrix heatmap data.

    Computes Pearson correlation coefficients between selected numeric variables.
    If no variables specified, uses up to 20 numeric columns.

    Args:
        df: Source DataFrame.
        config: Visualization configuration with axis.y_axis specifying variables.

    Returns:
        PlotDataResponse with correlation_matrix containing:
            - x: list of variable names (columns)
            - y: list of variable names (rows, reversed for display)
            - z: 2D list of correlation values
    """
    # Use y_axis as selected variables
    cols = config.axis.y_axis
    
    # If no columns selected, default to all numeric columns (up to 20)
    if not cols:
         # Find numeric columns
         cols = df.select_dtypes(include=[np.number]).columns.tolist()
         if len(cols) > 20:
             cols = cols[:20]
    
    # Filter existing columns
    valid_cols = [c for c in cols if c in df.columns]

    if len(valid_cols) < 2:
         # Not enough cols for correlation
         # Fallback to empty
         return PlotDataResponse(
             title=config.title,
             series=[],
             x_label="Variables",
             y_label="Variables",
             correlation_matrix=None
         )
    
    # Compute Correlation
    # Only numeric
    sub_df = df[valid_cols].select_dtypes(include=[np.number])
    if sub_df.empty:
         return PlotDataResponse(
             title=config.title,
             series=[],
             x_label="Variables",
             y_label="Variables",
             correlation_matrix=None
         )
        
    corr = sub_df.corr().fillna(0)
    
    # Prepare response
    return PlotDataResponse(
        title=config.title,
        series=[],
        x_label="Variables",
        y_label="Variables",
        correlation_matrix={
            "x": corr.columns.tolist(),
            "y": corr.columns.tolist()[::-1], 
            "z": corr.values.tolist()[::-1]
        }
    )



def generate_formula_data(df: pd.DataFrame, config: VisualizationConfig) -> PlotDataResponse:
    """Generate plot data from custom Python formula evaluation.

    Executes user-provided Python code with access to DataFrame columns via
    'col' variable and numpy/pandas via 'np'/'pd'. Results are extracted from
    variables named 'result', 'result1', 'result2', etc.

    Supports per-result configuration including:
        - Custom colors and plot types
        - Assignment to left/right Y-axis
        - Individual regression trendlines with CI

    Args:
        df: Source DataFrame accessible as 'col' in the formula namespace.
        config: Visualization configuration with formula.input containing Python code.

    Returns:
        PlotDataResponse with series for each result variable.

    Raises:
        ValueError: If formula is missing, has syntax errors, references
            missing columns, or doesn't define any result variables.

    Example formula:
        result1 = col['Temperature'] * 1.8 + 32  # Celsius to Fahrenheit
        result2 = col['Pressure'] / 100          # Pa to hPa
    """
    if not config.formula.input:
        raise ValueError("Formula input is required")
    
    x_data, x_label = get_x_data(df, config)
    
    # Ensure index is available for formula
    work_df = df.copy()
    
    # helper: try to convert object columns to numeric (fixes "str + float" errors)
    for col_name in work_df.columns:
        if work_df[col_name].dtype == 'object':
            try:
                # Coerce errors will turn non-parseable strings to NaN, which allows math to proceed (producing NaNs)
                # rather than crashing with TypeError
                work_df[col_name] = pd.to_numeric(work_df[col_name], errors='coerce')
            except Exception:
                pass # Keep as is if something goes wrong

    if work_df.index.name:
        work_df[work_df.index.name] = work_df.index
    work_df['Index'] = work_df.index
    
    namespace = {'col': work_df, 'np': np, 'pd': pd}
    
    # Execute formula (sandboxed: see app.services.formula_safety)
    try:
        safe_exec(config.formula.input, namespace)
    except KeyError as e:
        raise ValueError(f"Column not found in dataset: {e}")
    except SyntaxError as e:
        raise ValueError(f"Formula syntax error: {e}")
    except Exception as e:
        raise ValueError(f"Error executing formula: {e}")
    
    # Extract results
    results = {}
    
    # Check for result1, result2, etc.
    j = 1
    while f'result{j}' in namespace:
        results[f'result{j}'] = namespace[f'result{j}']
        j += 1
    
    # Check for single 'result'
    if 'result' in namespace:
        results['result'] = namespace['result']
    
    if not results:
        raise ValueError("Formula must define 'result', 'results', or 'result1', 'result2', etc.")
    
    # Convert to series
    series = []
    for idx, (name, result) in enumerate(results.items()):
        if isinstance(result, pd.Series):
            y_data = result.tolist()
        elif isinstance(result, np.ndarray):
            y_data = result.tolist()
        else:
            y_data = [float(result)] * len(x_data)
        
        label = get_legend_label(idx, name, config)
        
        # Get per-result configuration
        result_config = None
        if config.formula.result_configs and name in config.formula.result_configs:
            result_config = config.formula.result_configs[name]
    
        # Determine color: per-result > custom_colors > palette
        color = None
        if result_config and result_config.color:
            color = result_config.color
        elif config.style.custom_colors and name in config.style.custom_colors:
            color = config.style.custom_colors[name]
        elif len(results) == 1 and config.style.custom_colors and 'result' in config.style.custom_colors:
            color = config.style.custom_colors['result']
        else:
            color = COLORS[idx % len(COLORS)] if len(results) > 1 else COLORS[config.style.color_index % len(COLORS)]
        
        # Determine plot type: per-result > legacy global
        plot_type = "line"
        if result_config and result_config.type:
            plot_type = result_config.type.lower()
        elif config.formula.plot_type == PlotType.SCATTER:
            plot_type = "scatter"
        
        # Determine Y-axis: per-result > default left
        y_axis_id = "left"
        if result_config and result_config.y_axis_id:
            y_axis_id = result_config.y_axis_id
        
        # Determine marker symbol: per-result > default circle
        marker_symbol = "circle"
        if result_config and result_config.marker_symbol:
            marker_symbol = result_config.marker_symbol
        
        # Determine marker size: per-result > None (auto)
        marker_size = None
        if result_config and result_config.marker_size is not None:
            marker_size = result_config.marker_size
        
        # Determine marker fill: per-result > default True
        marker_filled = True
        if result_config and not result_config.marker_filled:
            marker_filled = False
        
        # Determine line style: per-result > defaults
        line_dash = "solid"
        if result_config and result_config.line_dash:
            line_dash = result_config.line_dash
        line_width = None
        if result_config and result_config.line_width is not None:
            line_width = result_config.line_width
            
        # Downsample if needed
        ds_x, ds_y = downsample_series(x_data, y_data)
        
        series.append(PlotDataSeries(
             name=label,
             data=[{"x": x, "y": y} for x, y in zip(ds_x, ds_y)],
             color=color,
             type=plot_type,
             y_axis_id=y_axis_id,
             marker_symbol=marker_symbol,
             marker_size=marker_size,
             marker_filled=marker_filled,
             line_dash=line_dash,
             line_width=line_width
        ))
        
        # Per-result regression (trendline)
        if result_config and result_config.show_regression:
            try:
                # Enforce regression color matches series color
                reg_color = color
                
                regression_line, ci_series, _ = RegressionEngine.add_regression(
                    x_data, 
                    y_data, 
                    degree=1,  # Linear trendline
                    remove_outliers=result_config.remove_outliers,
                    model_type='linear',
                    line_color=reg_color,
                    predictor_names=[config.axis.x_axis] if config.axis.x_axis != "Index" and config.axis.x_axis in df.columns else ["Index"],
                    iqr_multiplier=1.5,
                    dataframe=df
                )
                
                if regression_line:
                    regression_line.name = f"Trend ({label})"
                    regression_line.y_axis_id = y_axis_id  # Same axis as the series
                    series.append(regression_line)
                    
                    # Add Confidence Intervals if requested
                    if result_config.show_confidence_interval: # Assuming result_config has this field, verified in schemas.py
                         for ci in ci_series:
                            ci.y_axis_id = y_axis_id
                         series.extend(ci_series)

            except Exception as e:
                logger.warning(f"Regression failed for {label}: {e}")
    
    # Legacy: Global regression if add_regression is enabled and no result_configs are used
    regression_line = None
    reg_model = None
    if config.formula.add_regression and results and not config.formula.result_configs:
        first_result = list(results.values())[0]
        if isinstance(first_result, pd.Series):
            first_y = first_result.tolist()
        else:
            first_y = list(first_result)
        
        regression_line, ci_series, reg_model = RegressionEngine.add_regression(
            x_data, 
            first_y, 
            config.formula.regression_degree,
            config.formula.regression_remove_outliers,
            model_type=config.regression.model_type,
            alpha=config.regression.alpha,
            rf_params={
                'n_estimators': config.regression.rf_n_estimators,
                'max_depth': config.regression.rf_max_depth,
                'min_samples_split': config.regression.rf_min_samples_split,
                'min_samples_leaf': config.regression.rf_min_samples_leaf
            },
            line_color=config.regression.line_color,
            custom_formula=config.regression.custom_formula,
            custom_params=[p.strip() for p in config.regression.custom_params.split(',')] if config.regression.custom_params else [],
            custom_guesses=[float(g.strip()) for g in config.regression.custom_initial_guesses.split(',')] if config.regression.custom_initial_guesses else [],
            custom_bounds_lower=_parse_bounds(config.regression.custom_bounds_lower),
            custom_bounds_upper=_parse_bounds(config.regression.custom_bounds_upper),
            predictor_names=[config.axis.x_axis] if config.axis.x_axis != "Index" and config.axis.x_axis in df.columns else ["Index"]
        )
        if ci_series:
            series.extend(ci_series)
    
    y_label = config.axis.y_label or ("Result" if len(results) == 1 else "Results")
    
    return PlotDataResponse(
        title=config.title,
        series=series,
        x_label=x_label,
        y_label=y_label,
        regression_line=regression_line,
        regression_model=reg_model,
        limits=config.limits.thresholds if config.limits.thresholds else None
    )

def generate_multi_axis_data(df: pd.DataFrame, config: VisualizationConfig) -> PlotDataResponse:
    """Generate multi-axis plot data with shared X-axis.

    Creates series for multiple Y-axis variables that can be displayed on
    separate Y-axes (left/right) with different scales.

    Args:
        df: Source DataFrame.
        config: Visualization configuration with:
            - axis.y_axis: Variables to plot
            - axis.multi_axis_plot_type: Plot type (line, scatter, line+scatter)
            - limits.thresholds: Optional threshold lines

    Returns:
        PlotDataResponse with series data.
    """
    x_data, x_label = get_x_data(df, config)
    
    series = []
    for idx, col in enumerate(config.axis.y_axis):
        if col not in df.columns:
            continue
        
        y_data = df[col].tolist()
        label = get_legend_label(idx, col, config)
        color = COLORS[idx % len(COLORS)]
        
        # Determine plot type
        if config.axis.multi_axis_plot_type == PlotType.SCATTER:
            plot_type = "scatter"
        elif config.axis.multi_axis_plot_type == PlotType.LINE_SCATTER:
            plot_type = "line+scatter"
        else:
            plot_type = "line"

        # Downsample
        ds_x, ds_y = downsample_series(x_data, y_data)

        series.append(PlotDataSeries(
             name=label,
             data=[{"x": x, "y": y} for x, y in zip(ds_x, ds_y)],
             color=color,
             type=plot_type
        ))
    
    y_label = get_y_label(config)
    
    # Limits
    limits = config.limits.thresholds if config.limits.thresholds else None
    
    return PlotDataResponse(
        title=config.title,
        series=series,
        x_label=x_label,
        y_label=y_label,
        limits=limits
    )

def generate_universal_data(df: pd.DataFrame, config: VisualizationConfig) -> PlotDataResponse:
    """Generate universal plot data with per-series configuration.

    The most flexible plot generator, allowing individual configuration
    for each data series including plot type, color, Y-axis assignment,
    and regression trendlines.

    Args:
        df: Source DataFrame.
        config: Visualization configuration with:
            - axis.y_axis: List of variables to plot
            - series_configs: Dict mapping column names to SeriesConfig with:
                - type: line, scatter, step, bar
                - color: hex color string
                - y_axis_id: 'left' or 'right'
                - show_regression: enable trendline
                - show_confidence_interval: show CI bands
                - remove_outliers: IQR outlier filtering for regression

    Returns:
        PlotDataResponse with individually configured series.
    """
    x_data, x_label = get_x_data(df, config)
    
    series = []
    
    # Iterate over order in y_axis (which acts as the master list of active series)
    for idx, col in enumerate(config.axis.y_axis):
        if col not in df.columns:
            continue
            
        # Get series configuration
        series_config = config.series_configs.get(col, None)
        
        # Defaults
        default_type = "line"
        if config.viz_type == "scatter": default_type = "scatter"
        elif config.viz_type == "step": default_type = "step"
        elif config.viz_type == "bar": default_type = "bar"
        
        plot_type = series_config.type if series_config else default_type
        color = series_config.color if series_config and series_config.color else get_color(idx, config)
        y_axis_id = series_config.y_axis_id if series_config else "left"
        show_regression = series_config.show_regression if series_config else False
        remove_outliers = series_config.remove_outliers if series_config else False
        marker_symbol = series_config.marker_symbol if series_config else "circle"
        marker_size = series_config.marker_size if series_config else None
        marker_filled = series_config.marker_filled if series_config else True
        line_dash = series_config.line_dash if series_config else "solid"
        line_width = series_config.line_width if series_config else None
        
        y_data = df[col].tolist()
        label = get_legend_label(idx, col, config)
        
        # Downsample
        ds_x, ds_y = downsample_series(x_data, y_data)
        
        # Main Series
        series.append(PlotDataSeries(
            name=label,
            data=[{"x": x.item() if hasattr(x, "item") else x, "y": y.item() if hasattr(y, "item") else y} for x, y in zip(ds_x, ds_y)],
            color=color,
            type=plot_type,
            y_axis_id=y_axis_id,
            marker_symbol=marker_symbol,
            marker_size=marker_size,
            marker_filled=marker_filled,
            line_dash=line_dash,
            line_width=line_width
        ))
        
        # Regression (using RegressionEngine for consistency)
        if show_regression:
            try:
                # Enforce regression color matches series color (as per user request)
                reg_color = color
                
                # Use RegressionEngine for consistent regression across all plot types
                regression_line, ci_series, _ = RegressionEngine.add_regression(
                    x_data,
                    y_data,
                    degree=1,  # Linear regression for simplicity
                    remove_outliers=remove_outliers,
                    model_type='linear',  # Standard linear regression
                    line_color=reg_color, 
                    predictor_names=[config.axis.x_axis] if config.axis.x_axis != "Index" and config.axis.x_axis in df.columns else ["Index"],
                    iqr_multiplier=1.5,
                    dataframe=df  # Pass dataframe for context
                )
                
                if regression_line:
                    # Rename to "Trend (col)" for clarity
                    regression_line.name = f"Trend ({col})"
                    regression_line.y_axis_id = y_axis_id  # Assign to same axis as series
                    series.append(regression_line)
                    
                    # Add Confidence Intervals if requested
                    if series_config and series_config.show_confidence_interval:
                        # Ensure CI series also follow the correct axis
                        for ci in ci_series:
                            ci.y_axis_id = y_axis_id
                        series.extend(ci_series)
                    
            except Exception as e:
                logger.warning(f"Regression failed for {col}: {e}")

    y_label = config.axis.y_label or "Values"
    
    return PlotDataResponse(
        title=config.title,
        series=series,
        x_label=x_label,
        y_label=y_label,
        limits=config.limits.thresholds if config.limits.thresholds else None
    )
