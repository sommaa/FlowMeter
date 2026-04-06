"""
Utility functions for FlowMeter export report generation.

This module provides helper functions used across the export pipeline
for date filtering, color manipulation, and formatting.

Functions:
    - filter_dataframe_by_date: Filter DataFrame by date range
    - hex_to_rgb: Convert hex/rgb color to RGB string
    - lighten_color: Mix a color with white
    - get_contrast_color: Choose black/white text for readability
    - format_datetime_axis: Format matplotlib date axis
"""

import pandas as pd
import re
import numpy as np
import traceback
import logging
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from typing import Optional, Dict

logger = logging.getLogger(__name__)


def filter_dataframe_by_date(df: pd.DataFrame, date_range: Optional[Dict[str, str]]) -> pd.DataFrame:
    """Filter a DataFrame to include only rows within a date range.

    Intelligently detects the datetime source in the DataFrame (index,
    datetime column, or string column) and applies the filter. Handles
    timezone-aware and naive datetimes.

    Args:
        df: The DataFrame to filter.
        date_range: Optional dict with 'start' and 'end' keys containing
            ISO format date strings. If None or incomplete, returns df unchanged.

    Returns:
        Filtered DataFrame containing only rows within the date range.
        Returns original DataFrame if filtering fails or date_range is invalid.

    Detection order:
        1. DatetimeIndex on the DataFrame index
        2. First datetime64 column found
        3. String columns that look like dates (contain -, /, or :)

    Note:
        All timezone-aware datetimes are normalized to naive for comparison
        to ensure consistent behavior across different data sources.
    """
    if not date_range or not date_range.get('start') or not date_range.get('end'):
        return df

    try:
        # Parse bounds
        # Use UTC=True to ensure we get a TZ-aware date if string is ISO, 
        # then convert to naive for consistent comparison with potential naive data
        start_date = pd.to_datetime(date_range['start']).replace(tzinfo=None)
        end_date = pd.to_datetime(date_range['end']).replace(tzinfo=None)

        # 1. Check Index
        if isinstance(df.index, pd.DatetimeIndex):
            # Normalize index to naive for comparison
            check_series = df.index
            if check_series.tz is not None:
                check_series = check_series.tz_localize(None)
            
            mask = (check_series >= start_date) & (check_series <= end_date)
            return df[mask]
        
        # 2. Check DateTime Columns
        date_cols = df.select_dtypes(include=['datetime64', 'datetimetz']).columns
        if len(date_cols) > 0:
            dt_col = date_cols[0]
            check_series = df[dt_col]
            
            # Access .dt accessor properly
            if hasattr(check_series, 'dt') and getattr(check_series.dt, 'tz', None) is not None:
                    check_series = check_series.dt.tz_localize(None)
            
            mask = (check_series >= start_date) & (check_series <= end_date)
            return df.loc[mask]

        # 3. Fallback: Check for String columns looking like dates
        for col in df.columns:
            if df[col].dtype == 'object':
                try:
                    # Attempt to parse first non-null
                    first_valid = df[col].dropna().iloc[0] if not df[col].dropna().empty else None
                    if first_valid and isinstance(first_valid, str):
                        # Heuristic check
                        if any(x in first_valid for x in ['-', '/', ':']):
                            # Try converting column
                            temp_series = pd.to_datetime(df[col], errors='coerce')
                            if not temp_series.isna().all():
                                # Success, use this for filtering
                                if temp_series.dt.tz is not None:
                                    temp_series = temp_series.dt.tz_localize(None)
                                    
                                mask = (temp_series >= start_date) & (temp_series <= end_date)
                                return df.loc[mask.fillna(False)]
                except:
                    continue

        return df
    except Exception as e:
        logger.error(f"Error filtering by date: {e}")
        traceback.print_exc()
        return df

def hex_to_rgb(value: str) -> str:
    """Convert a color value to a comma-separated RGB string.

    Handles multiple input formats including hex (#RGB, #RRGGBB) and
    rgb/rgba function syntax.

    Args:
        value: Color string in hex or rgb format.

    Returns:
        Comma-separated RGB values as string (e.g., "255,128,0").
        Returns "0,0,0" for invalid or empty input.

    Example:
        >>> hex_to_rgb("#ff8000")
        "255,128,0"
        >>> hex_to_rgb("rgb(255, 128, 0)")
        "255,128,0"
    """
    if not value: return "0,0,0"
    
    # Handle rgb/rgba strings
    if value.startswith('rgb'):
        nums = re.findall(r"(\d+)", value)
        return ",".join(nums[:3]) if len(nums) >= 3 else "0,0,0"

    # Handle hex strings
    hex_color = value.lstrip('#')
    try:
        if len(hex_color) == 3:
            hex_color = ''.join([c * 2 for c in hex_color])
        return ",".join(str(int(hex_color[i:i + 2], 16)) for i in (0, 2, 4))
    except BaseException:
        return "0,0,0"

def lighten_color(color_val: str, factor: float = 0.4) -> str:
    """Lighten a color by mixing it with white.

    Creates a lighter tint of the input color by linear interpolation
    toward white (#ffffff).

    Args:
        color_val: Color string in hex or rgb format.
        factor: Blend factor from 0.0 (no change) to 1.0 (white).
            Default 0.4 produces a noticeably lighter shade.

    Returns:
        Hex color string of the lightened color.
        Returns "#f3f4f6" (light gray) on error.

    Example:
        >>> lighten_color("#0066cc", 0.5)
        "#80b3e6"
    """
    try:
        # Use existing hex_to_rgb helper which returns "r,g,b" string
        rgb_str = hex_to_rgb(color_val)
        r, g, b = map(int, rgb_str.split(','))

        r = int(r + (255 - r) * factor)
        g = int(g + (255 - g) * factor)
        b = int(b + (255 - b) * factor)

        return f"#{r:02x}{g:02x}{b:02x}"
    except Exception:
        # If anything goes wrong, return white or a light grey as fallback
        return "#f3f4f6"

def get_contrast_color(value: str) -> str:
    """Determine optimal text color (black or white) for a background.

    Uses the YIQ color space formula to calculate perceived brightness
    and returns a contrasting text color for readability.

    Args:
        value: Background color string in hex or rgb format.

    Returns:
        "#000000" (black) for light backgrounds (YIQ >= 128).
        "#ffffff" (white) for dark backgrounds (YIQ < 128).

    Note:
        The YIQ formula weights RGB channels by human perception:
        Y = (R * 299 + G * 587 + B * 114) / 1000
    """
    rgb_str = hex_to_rgb(value)
    try:
        r, g, b = map(int, rgb_str.split(','))
        # YIQ formula
        yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000
        return '#000000' if yiq >= 128 else '#ffffff'
    except BaseException:
        return '#ffffff'

def format_datetime_axis(ax, df_index):
    """Format a matplotlib axis for datetime display.

    Configures the x-axis of a matplotlib plot to display dates in
    DD-MM-YY format with horizontally centered labels.

    Args:
        ax: Matplotlib axes object to configure.
        df_index: DataFrame index - formatting is only applied if
            this is a DatetimeIndex.

    Note:
        This function is primarily for legacy matplotlib exports.
        The main export pipeline now uses Plotly via PlotlyRenderer.
    """
    if isinstance(df_index, pd.DatetimeIndex):
        date_formatter = mdates.DateFormatter('%d-%m-%y')
        ax.xaxis.set_major_formatter(date_formatter)
        plt.setp(ax.get_xticklabels(), rotation=0, ha='center')
