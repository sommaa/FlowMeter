"""Data processing utilities for visualization generation.

This module provides helper functions used by the plotting module for:
- Extracting and formatting axis data from DataFrames
- Computing derived columns from user-defined global variable formulas
- Downsampling large datasets using LTTB (Largest Triangle Three Buckets)
- Managing series colors, labels, and styling

The LTTB algorithm preserves visual appearance while reducing data points,
enabling smooth rendering of time series with millions of points.
"""

import pandas as pd
import numpy as np
from typing import Any, Tuple, List, Optional
from app.models.schemas import VisualizationConfig, GlobalVariable

import logging
import re

logger = logging.getLogger(__name__)

COLORS = [
    '#0072BD', '#D95319', '#EDB120', '#7E2F8E', '#77AC30',
    '#4DBEEE', '#A2142F', '#2563eb', '#16a34a', '#dc2626'
]
"""Default color palette matching MATLAB-style colors for data series."""


def compute_global_variables(df: pd.DataFrame, global_variables: list[GlobalVariable]) -> pd.DataFrame:
    """Compute global variables and add them as columns to the DataFrame.

    Evaluates user-defined formulas to create derived columns that can be used
    in visualizations. Formulas have access to existing columns via col['Name']
    syntax, numpy (np), and pandas (pd).

    Args:
        df: Source DataFrame to extend with computed columns.
        global_variables: List of GlobalVariable objects, each with:
            - name: Column name for the computed result
            - formula: Python expression using col['ColName'], np, pd

    Returns:
        DataFrame with additional columns for each global variable.

    Raises:
        ValueError: If formula evaluation fails (syntax error, missing column, etc.).

    Example:
        GlobalVariable(name="TempF", formula="col['TempC'] * 1.8 + 32")
    """
    if not global_variables:
        return df
    
    df = df.copy()

    # helper: try to convert object columns to numeric (fixes "str + float" errors)
    for col_name in df.columns:
        if df[col_name].dtype == 'object':
            try:
                # Coerce errors will turn non-parseable strings to NaN
                df[col_name] = pd.to_numeric(df[col_name], errors='coerce')
            except Exception:
                pass
    
    # Make index available as a column for formulas
    if df.index.name:
        df[df.index.name] = df.index
    df['Index'] = df.index  # Always available as 'Index'

    
    for gv in global_variables:
        try:
            # Create namespace for formula evaluation
            # NOTE: We exclusively use 'col' now. 'df' is removed to enforce this.
            namespace = {'col': df, 'np': np, 'pd': pd}
            
            # Also add previously computed global variables to namespace
            for prev_gv in global_variables:
                if prev_gv.name in df.columns:
                    namespace[prev_gv.name] = df[prev_gv.name]
            
            # Evaluate formula
            result = eval(gv.formula, namespace)
            
            # Add result as column
            if isinstance(result, (pd.Series, np.ndarray)):
                df[gv.name] = result
            elif isinstance(result, (int, float)):
                df[gv.name] = result  # Broadcast scalar
            else:
                df[gv.name] = pd.Series(result, index=df.index)
                
        except Exception as e:
            # Re-raise as ValueError so it propagates to the API response
            raise ValueError(f"Error computing global variable '{gv.name}': {str(e)}")
    
    return df

def get_x_data(df: pd.DataFrame, config: VisualizationConfig) -> Tuple[List[Any], str]:
    """Extract X-axis data based on visualization configuration.

    Supports three modes for X-axis:
    - "Index": Use the DataFrame index
    - "Custom Formula": Evaluate a formula to compute X values
    - Column name: Use values from a specific column

    Args:
        df: Source DataFrame.
        config: Visualization config with axis.x_axis setting.

    Returns:
        A tuple of (x_data_list, x_label_string).

    Raises:
        ValueError: If custom X formula fails to evaluate.
    """
    if config.axis.x_axis == "Index":
        x_data = df.index.tolist()
        x_label = config.axis.x_label or "Index"
    elif config.axis.x_axis == "Custom Formula" and config.formula.x_formula:
        try:
            work_df = df.copy()
            if work_df.index.name:
                work_df[work_df.index.name] = work_df.index
            work_df['Index'] = work_df.index
            work_df['Index'] = work_df.index
            namespace = {'col': work_df, 'np': np, 'pd': pd}
            x_data = eval(config.formula.x_formula, namespace)
            if isinstance(x_data, pd.Series):
                x_data = x_data.tolist()
            x_label = config.axis.x_label or "Custom X"
        except Exception as e:
            raise ValueError(f"X-axis formula error: {str(e)}")
    elif config.axis.x_axis in df.columns:
        x_data = df[config.axis.x_axis].tolist()
        x_label = config.axis.x_label or config.axis.x_axis
    else:
        x_data = df.index.tolist()
        x_label = config.axis.x_label or "Index"
    
    return x_data, x_label

def downsample_series(x_data: list, y_data: list, threshold: int = 500) -> Tuple[list, list]:
    """Downsample data series using LTTB algorithm for efficient plotting.

    LTTB (Largest Triangle Three Buckets) preserves the visual shape of the
    data while dramatically reducing point count. This enables smooth rendering
    of time series with millions of points.

    NaN values in y_data are ALWAYS filtered out (along with corresponding x values)
    to ensure consistent data alignment, regardless of whether LTTB is applied.

    Args:
        x_data: X-axis values (numeric or datetime strings).
        y_data: Y-axis values (numeric).
        threshold: Maximum number of points to return (default 500).

    Returns:
        A tuple (downsampled_x, downsampled_y). Returns filtered data if:
        - Length is already below threshold (after NaN filtering)
        - lttbc library is not installed
        - Data cannot be converted to numeric format

    Note:
        Datetime X values are converted to timestamps for LTTB processing,
        then converted back to ISO strings in the output.
    """
    if len(x_data) == 0:
        return x_data, y_data

    # --- STEP 1: Convert to numpy arrays for processing ---
    # Handle Y-axis datetime conversion first (similar to X-axis logic below)
    is_y_datetime = False
    y_arr = None
    
    # Check if Y looks like datetime (objects or pandas Timestamps)
    # We try to convert to numeric if it's not already
    try:
        # First try as standard float array
        y_arr = np.array(y_data, dtype=float)
    except (ValueError, TypeError):
        # Conversion failed, try as datetime
        try:
            ts_y = pd.to_datetime(y_data)
            # Detect datetime unit (same logic as X)
            dtype_str = str(ts_y.dtype)
            if '[ns]' in dtype_str:
                divisor = 10**9
            elif '[us]' in dtype_str:
                divisor = 10**6
            elif '[ms]' in dtype_str:
                divisor = 10**3
            else:
                divisor = 10**9
            
            y_arr = ts_y.values.astype(np.int64) // divisor
            y_arr = y_arr.astype(float) # LTTB needs float
            is_y_datetime = True
        except Exception:
             # If both fail, we might have mixed types or strings that aren't dates.
             # We can't really downsample non-numeric Y effectively for a line chart 
             # (except maybe categorical, but LTTB is for continuous).
             # For now, let's try to pass through or error gracefully.
             # If we can't make it float, we can't use LTTB.
             pass

    x_arr = np.array(x_data)
    
    if y_arr is None:
         # Fallback if Y conversion completely failed
         # Attempt to create array keeping original objects for length checking
         y_arr = np.array(y_data) 
         # We won't be able to run LTTB, so we'll just fall through to the "filtered_len <= threshold" check
         # or fail later if we try LTTB.
    
    # --- STEP 2: Detect datetime X-axis ---
    is_datetime = False
    x_numeric = None
    
    if x_arr.dtype.kind not in 'iuhatf':  # Not numeric
        try:
            ts = pd.to_datetime(x_arr)
            # Detect datetime unit from dtype (e.g., datetime64[ns], datetime64[us], datetime64[ms])
            # and convert to seconds accordingly
            dtype_str = str(ts.dtype)
            if '[ns]' in dtype_str:
                divisor = 10**9
            elif '[us]' in dtype_str:
                divisor = 10**6
            elif '[ms]' in dtype_str:
                divisor = 10**3
            else:
                divisor = 10**9  # Default to nanoseconds
            x_numeric = ts.values.astype(np.int64) // divisor  # Use .values to get numpy array
            is_datetime = True
        except Exception:
            # Fallback: keep original data if conversion fails
            # Still need to filter NaN from y_data
            pass
    else:
        x_numeric = x_arr.astype(float)
    
    # --- STEP 3: Filter NaN values (ALWAYS, regardless of data size) ---
    if x_numeric is not None:
        mask = ~np.isnan(x_numeric) & ~np.isnan(y_arr)
    else:
        # For non-numeric X, only filter by Y
        mask = ~np.isnan(y_arr)
    
    if not mask.all():
        if x_numeric is not None:
            x_numeric = x_numeric[mask]
        x_arr = x_arr[mask]
        y_arr = y_arr[mask]
    
    # --- STEP 4: Early return if below threshold (with filtered data) ---
    filtered_len = len(y_arr)
    if filtered_len <= threshold:
        # Return filtered data in original format
        if is_datetime and x_numeric is not None:
            filtered_x = pd.to_datetime(x_numeric, unit='s').map(lambda x: x.isoformat()).tolist()
        else:
            filtered_x = x_arr.tolist()
            
        if is_y_datetime:
             filtered_y = pd.to_datetime(y_arr.astype(np.int64), unit='s').map(lambda x: x.isoformat()).tolist()
        else:
             filtered_y = y_arr.tolist()
             
        return filtered_x, filtered_y
    
    # --- STEP 5: Apply LTTB downsampling for large datasets ---
    try:
        import lttbc
        
        if x_numeric is None:
            # Cannot apply LTTB without numeric X, return filtered data
            # NOTE: Logic duplication here from above block, but simplified
             if is_y_datetime:
                 return x_arr.tolist(), pd.to_datetime(y_arr.astype(np.int64), unit='s').map(lambda x: x.isoformat()).tolist()
             return x_arr.tolist(), y_arr.tolist()
        
        # Ensure C-Contiguous Float64 (strict requirement for LTTB C-extension)
        x_numeric = np.ascontiguousarray(x_numeric, dtype=np.float64)
        y_arr = np.ascontiguousarray(y_arr, dtype=np.float64)

        # Run LTTB
        nx, ny = lttbc.downsample(x_numeric, y_arr, threshold)

        # Convert X back to original format
        if is_datetime:
            nx_iso = pd.to_datetime(nx, unit='s').map(lambda x: x.isoformat()).tolist()
            out_x = nx_iso
        else:
            out_x = nx.tolist()
            
        # Convert Y back if needed
        if is_y_datetime:
            ny_iso = pd.to_datetime(ny.astype(np.int64), unit='s').map(lambda x: x.isoformat()).tolist()
            out_y = ny_iso
        else:
            out_y = ny.tolist()

        return out_x, out_y
            
    except ImportError:
        # lttbc not installed, return filtered data
        if is_datetime and x_numeric is not None:
            filtered_x = pd.to_datetime(x_numeric, unit='s').map(lambda x: x.isoformat()).tolist()
        else:
            filtered_x = x_arr.tolist()
            
        if is_y_datetime:
             filtered_y = pd.to_datetime(y_arr.astype(np.int64), unit='s').map(lambda x: x.isoformat()).tolist()
        else:
             filtered_y = y_arr.tolist()
        return filtered_x, filtered_y
            
    except Exception as e:
        logger.warning(f"LTTB Error: {e}")
        if is_datetime and x_numeric is not None:
            filtered_x = pd.to_datetime(x_numeric, unit='s').map(lambda x: x.isoformat()).tolist()
        else:
            filtered_x = x_arr.tolist()
            
        if is_y_datetime:
             filtered_y = pd.to_datetime(y_arr.astype(np.int64), unit='s').map(lambda x: x.isoformat()).tolist()
        else:
             filtered_y = y_arr.tolist()
             
        return filtered_x, filtered_y


def column_exists(df: pd.DataFrame, col: str) -> bool:
    """Check if a column exists in the DataFrame, including the index.

    Args:
        df: DataFrame to check.
        col: Column name to look for.

    Returns:
        True if column exists or matches the index name/"Index".
    """
    if col in df.columns:
        return True
    # Check if it's the index
    index_name = df.index.name or 'Index'
    if col == index_name or col == 'Index':
        return True
    return False

def get_column_data(df: pd.DataFrame, col: str) -> pd.Series:
    """Get column data as a Series, handling index as a pseudo-column.

    Args:
        df: Source DataFrame.
        col: Column name, or "Index"/index name to get index values.

    Returns:
        Series containing the column or index data.

    Raises:
        KeyError: If column not found and doesn't match index.
    """
    if col in df.columns:
        return df[col]
    # Check if it's the index
    index_name = df.index.name or 'Index'
    if col == index_name or col == 'Index':
        # Return index as a Series
        return pd.Series(df.index, index=df.index, name=index_name)
    raise KeyError(f"Column '{col}' not found in dataframe")

def get_y_label(config: VisualizationConfig) -> str:
    """Generate Y-axis label from configuration.

    Priority: explicit y_label > auto-generated from column names > "Value".
    For multiple columns, shows first two with "(+N more)" suffix.

    Args:
        config: Visualization configuration.

    Returns:
        Y-axis label string.
    """
    if config.axis.y_label:
        return config.axis.y_label
    if config.axis.y_axis:
        if len(config.axis.y_axis) == 1:
            return config.axis.y_axis[0]
        return ', '.join(config.axis.y_axis[:2]) + (f' (+{len(config.axis.y_axis)-2} more)' if len(config.axis.y_axis) > 2 else '')
    return "Value"

def get_color(index: int, config: VisualizationConfig) -> str:
    """Get color for a data series from the palette.

    For single-series plots, uses config.style.color_index to select color.
    For multi-series, cycles through COLORS palette by series index.

    Args:
        index: Series index (0-based).
        config: Visualization configuration.

    Returns:
        Hex color string (e.g., '#0072BD').
    """
    if len(config.axis.y_axis) == 1:
        return COLORS[config.style.color_index % len(COLORS)]
    return COLORS[index % len(COLORS)]

def get_legend_label(index: int, default: str, config: VisualizationConfig) -> str:
    """Get legend label for a data series.

    Uses custom label from config.legend.labels if available and non-empty,
    otherwise falls back to the default (usually column name).

    Args:
        index: Series index (0-based).
        default: Fallback label (typically column name).
        config: Visualization configuration.

    Returns:
        Legend label string.
    """
    if config.legend.labels and index < len(config.legend.labels) and config.legend.labels[index]:
        return config.legend.labels[index]
    return default
