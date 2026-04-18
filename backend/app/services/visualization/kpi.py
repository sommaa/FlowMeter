"""KPI / Summary visualization handler.

Computes one or more aggregated scalars (sum, avg, min, max, median, count,
first, last, std, or a custom formula) over the visualization's filtered
DataFrame. Each metric becomes a card in the frontend grid.

The DataFrame received here has already been date-range filtered by
VisualizationService._generate_plot_data_internal, so this handler operates
on whatever rows the user's window covers.
"""

import math
from typing import Any, Optional

import numpy as np
import pandas as pd

from app.models.schemas import (
    KPIResultPayload,
    KPIResultValue,
    PlotDataResponse,
    VisualizationConfig,
)


_BUILTIN_OPS = {
    "sum":    lambda s: s.sum(skipna=True),
    "avg":    lambda s: s.mean(skipna=True),
    "min":    lambda s: s.min(skipna=True),
    "max":    lambda s: s.max(skipna=True),
    "median": lambda s: s.median(skipna=True),
    "count":  lambda s: int(s.count()),
    "std":    lambda s: s.std(skipna=True),
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


def generate_kpi_data(df: pd.DataFrame, config: VisualizationConfig) -> PlotDataResponse:
    """Compute KPI metrics for a (date-filtered) DataFrame.

    Per-metric failures are caught and surfaced via KPIResultValue.error so a
    single bad metric doesn't break the whole card grid.
    """
    kpi_cfg = config.kpi
    raw_cpr = kpi_cfg.columns_per_row if kpi_cfg.columns_per_row is not None else 3
    columns_per_row = max(1, min(int(raw_cpr), 6))

    payload = KPIResultPayload(
        values=[],
        columns_per_row=columns_per_row,
        compact=bool(kpi_cfg.compact),
        sample_count=int(len(df)),
    )

    # Mirror the eval namespace used by compute_global_variables so authors
    # have a single, consistent formula language across the app.
    base_namespace = {"col": df, "np": np, "pd": pd}

    for metric in kpi_cfg.metrics:
        try:
            if metric.operation == "formula":
                if not metric.formula or not metric.formula.strip():
                    raise ValueError("Formula is empty")
                raw = eval(metric.formula, base_namespace)  # noqa: S307 - same surface as global vars
                value = _coerce_scalar(raw)
            else:
                op = _BUILTIN_OPS.get(metric.operation)
                if op is None and metric.operation not in ("first", "last"):
                    raise ValueError(f"Unsupported operation '{metric.operation}'")
                if not metric.column:
                    raise ValueError("Column is required for this operation")
                if metric.column not in df.columns:
                    raise ValueError(f"Column '{metric.column}' not found in dataset")
                series = pd.to_numeric(df[metric.column], errors="coerce")
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
