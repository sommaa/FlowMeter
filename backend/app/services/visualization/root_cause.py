"""
Root Cause Visualization Handler

Generates PlotDataResponse for root_cause visualization type.
Follows the same pattern as fft.py — called from visualization_service.py dispatcher.
"""
import pandas as pd
import logging
from typing import Any

from app.models.schemas import (
    VisualizationConfig,
    PlotDataResponse,
    PlotDataSeries,
)
from app.services.analytics.causality import CausalityAnalyzer

logger = logging.getLogger(__name__)


def generate_root_cause_data(df: pd.DataFrame, config: VisualizationConfig) -> PlotDataResponse:
    """Generate root cause analysis data.
    
    Args:
        df: Source DataFrame.
        config: VisualizationConfig with root_cause settings.
        
    Returns:
        PlotDataResponse with:
          - series: Target variable trend data
          - root_cause_analysis: Full ranking results
    """
    if df.empty:
        raise ValueError("Dataset is empty")

    rc_config = config.root_cause

    # Determine target variable
    target_col = rc_config.target_variable
    if not target_col:
        # Fallback: use first y_axis variable if available
        if config.axis.y_axis:
            target_col = config.axis.y_axis[0]
        else:
            raise ValueError("No target variable specified for Root Cause Analysis. "
                           "Set it in root_cause.target_variable or select a Y-axis variable.")

    if target_col not in df.columns:
        raise ValueError(f"Target variable '{target_col}' not found in dataset")

    # Run analysis
    analyzer = CausalityAnalyzer(
        max_lag=rc_config.max_lag,
        top_n=rc_config.top_n,
        significance_threshold=rc_config.significance_threshold,
        min_correlation=rc_config.min_correlation,
    )

    analysis_result = analyzer.analyze(
        df=df,
        target_col=target_col,
        methods=rc_config.methods,
        include_variables=[v for v in rc_config.include_variables if v != '__none__'] if rc_config.include_variables else None,
    )

    # Build target trend series for the frontend chart
    target_data = df[target_col].dropna()
    trend_series = PlotDataSeries(
        name=target_col,
        data=[{"x": _serialize_index(idx), "y": float(val)}
              for idx, val in target_data.items()],
        type="line",
        y_axis_id="left",
    )

    # Build scatter series for top candidates (for the diagnostic scatter plots)
    diagnostic_series = []
    for candidate in analysis_result["ranking"][:5]:
        col = candidate["variable"]
        if col in df.columns:
            col_data = df[[target_col, col]].dropna()
            # Downsample scatter data if too large
            if len(col_data) > 500:
                step = len(col_data) // 500
                col_data = col_data.iloc[::step]
            x_vals = col_data[col].values
            y_vals = col_data[target_col].values
            scatter = PlotDataSeries(
                name=col,
                data=[{"x": float(x_vals[i]), "y": float(y_vals[i])}
                      for i in range(len(x_vals))],
                type="scatter",
                y_axis_id="left",
            )
            diagnostic_series.append(scatter)

    return PlotDataResponse(
        title=f"Root Cause Analysis — {target_col}",
        series=[trend_series] + diagnostic_series,
        x_label="Sample" if not isinstance(df.index, pd.DatetimeIndex) else "Time",
        y_label=target_col,
        root_cause_analysis={
            "target_variable": target_col,
            "target_stats": analysis_result["target_stats"],
            "ranking": analysis_result["ranking"],
            "methods_used": analysis_result["methods_used"],
        },
    )


def _serialize_index(idx) -> Any:
    """Serialize a DataFrame index value for JSON."""
    if hasattr(idx, 'isoformat'):
        return idx.isoformat()
    return idx
