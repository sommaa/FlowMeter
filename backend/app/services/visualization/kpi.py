"""KPI / Summary visualization handler.

Computes one or more aggregated scalars (sum, avg, min, max, median, count,
first, last, std, or a custom formula) over the visualization's filtered
DataFrame. Each metric becomes a card in the frontend grid.

Unlike other visualization handlers, this one receives the *unfiltered*
DataFrame (plus the global date_range) so each metric can override the window
— e.g. one card shows the last-week average while another shows the all-time
max. When a metric has no period override it falls back to the global window.
"""

import math
from typing import Any, Optional

import numpy as np
import pandas as pd

from app.models.schemas import (
    KPIMetric,
    KPIResultPayload,
    KPIResultValue,
    PlotDataResponse,
    VisualizationConfig,
)
from app.services.export_helpers.utils import filter_dataframe_by_date


_BUILTIN_OPS = {
    "sum":    lambda s: s.sum(skipna=True),
    "avg":    lambda s: s.mean(skipna=True),
    "min":    lambda s: s.min(skipna=True),
    "max":    lambda s: s.max(skipna=True),
    "median": lambda s: s.median(skipna=True),
    "count":  lambda s: int(s.count()),
    "std":    lambda s: s.std(skipna=True),
}


# Relative presets anchored to the dataset's most recent timestamp.
_PRESET_DELTAS = {
    "12h": pd.Timedelta(hours=12),
    "24h": pd.Timedelta(hours=24),
    "7d":  pd.Timedelta(days=7),
    "30d": pd.Timedelta(days=30),
    "90d": pd.Timedelta(days=90),
    "1y":  pd.Timedelta(days=365),
}


def _first_valid(s: pd.Series) -> Optional[float]:
    s = s.dropna()
    return None if s.empty else s.iloc[0]


def _last_valid(s: pd.Series) -> Optional[float]:
    s = s.dropna()
    return None if s.empty else s.iloc[-1]


def _coerce_scalar(value: Any) -> Optional[float]:
    """Convert arbitrary aggregation result to a Python float (or None)."""
    if value is None:
        return None
    if hasattr(value, "item"):  # numpy / pandas scalar
        try:
            value = value.item()
        except (ValueError, TypeError):
            pass
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None if math.isnan(value) else value
        return float(value)
    # Last resort: let pandas try
    try:
        coerced = float(value)
        return None if math.isnan(coerced) else coerced
    except (TypeError, ValueError):
        raise ValueError(f"Result is not numeric: {value!r}")


def _format_value(value: Optional[float], decimals: int, unit: Optional[str]) -> str:
    if value is None:
        return "—"
    decimals = max(0, min(int(decimals), 10))
    abs_v = abs(value)
    # Use scientific notation for very large or very small (non-zero) magnitudes
    if abs_v != 0 and (abs_v >= 1e12 or abs_v < 10 ** (-decimals - 2)):
        text = f"{value:.{decimals}e}"
    else:
        text = f"{value:,.{decimals}f}"
    if unit:
        text = f"{text} {unit}"
    return text


def _slice_preset(df: pd.DataFrame, preset: str) -> pd.DataFrame:
    """Return the last-N slice anchored to the dataset's most recent timestamp."""
    delta = _PRESET_DELTAS.get(preset)
    if delta is None:
        raise ValueError(f"Unknown period preset '{preset}'")
    if not isinstance(df.index, pd.DatetimeIndex) or len(df) == 0:
        return df
    end = df.index.max()
    start = end - delta
    return df.loc[(df.index >= start) & (df.index <= end)]


def _slice_for_metric(
    df: pd.DataFrame,
    metric: KPIMetric,
    global_date_range: Optional[dict],
) -> pd.DataFrame:
    """Resolve a metric's time window.

    No period / mode == "all" => inherit the global window (equivalent to the
    old behavior where VisualizationService pre-filtered the df).

    mode == "preset" => last-N anchored to dataset end, ignoring the global window.
    mode == "custom" => explicit start/end, ignoring the global window.
    """
    period = metric.period
    if period is None or period.mode == "all":
        return filter_dataframe_by_date(df, global_date_range)
    if period.mode == "preset":
        return _slice_preset(df, period.preset)
    if period.mode == "custom":
        return filter_dataframe_by_date(df, {"start": period.start, "end": period.end})
    raise ValueError(f"Unknown period mode '{period.mode}'")


def generate_kpi_data(
    df: pd.DataFrame,
    config: VisualizationConfig,
    global_date_range: Optional[dict] = None,
) -> PlotDataResponse:
    """Compute KPI metrics, applying per-metric time windows when set.

    Per-metric failures are caught and surfaced via KPIResultValue.error so a
    single bad metric doesn't break the whole card grid.

    Args:
        df: DataFrame with global variables already computed; NOT yet
            date-filtered (VisualizationService defers filtering for KPI so
            each metric can override the window).
        config: Visualization configuration (uses config.kpi).
        global_date_range: The visualization's effective date_range; used as
            the fallback window for metrics without a period override.
    """
    kpi_cfg = config.kpi
    raw_cpr = kpi_cfg.columns_per_row if kpi_cfg.columns_per_row is not None else 3
    columns_per_row = max(1, min(int(raw_cpr), 6))

    # Footer row-count reflects the globally-filtered view (matches what the
    # user sees in the rest of the app). Per-metric counts live on each card.
    base_df = filter_dataframe_by_date(df, global_date_range)

    payload = KPIResultPayload(
        values=[],
        columns_per_row=columns_per_row,
        compact=bool(kpi_cfg.compact),
        sample_count=int(len(base_df)),
    )

    for metric in kpi_cfg.metrics:
        try:
            metric_df = _slice_for_metric(df, metric, global_date_range)
            # Formula metrics use the same eval namespace as compute_global_variables
            # so authors have a single, consistent formula language across the app.
            namespace = {"col": metric_df, "np": np, "pd": pd}

            if metric.operation == "formula":
                if not metric.formula or not metric.formula.strip():
                    raise ValueError("Formula is empty")
                raw = eval(metric.formula, namespace)  # noqa: S307 - same surface as global vars
                value = _coerce_scalar(raw)
            else:
                op = _BUILTIN_OPS.get(metric.operation)
                if op is None and metric.operation not in ("first", "last"):
                    raise ValueError(f"Unsupported operation '{metric.operation}'")
                if not metric.column:
                    raise ValueError("Column is required for this operation")
                if metric.column not in metric_df.columns:
                    raise ValueError(f"Column '{metric.column}' not found in dataset")
                series = pd.to_numeric(metric_df[metric.column], errors="coerce")
                if metric.operation == "first":
                    raw = _first_valid(series)
                elif metric.operation == "last":
                    raw = _last_valid(series)
                else:
                    raw = op(series)
                value = _coerce_scalar(raw)

            payload.values.append(KPIResultValue(
                id=metric.id,
                label=metric.label,
                value=value,
                formatted=_format_value(value, metric.decimals, metric.unit),
                unit=metric.unit,
                color=metric.color,
                sample_count=int(len(metric_df)),
            ))
        except Exception as exc:
            payload.values.append(KPIResultValue(
                id=metric.id,
                label=metric.label,
                value=None,
                formatted="—",
                unit=metric.unit,
                color=metric.color,
                error=str(exc),
            ))

    return PlotDataResponse(
        title=config.title,
        series=[],
        x_label="",
        y_label="",
        kpi=payload,
    )
