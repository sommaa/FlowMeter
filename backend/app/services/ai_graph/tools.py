"""Read-only DataFrame inspection tools for AI tool-use mode.

When the user opts to share dataset access with the AI, these tools are bound
to the LLM via ``model.bind_tools(...)`` so the model can iteratively probe the
dataset (sample rows, value counts, descriptive stats, correlations) before
producing its final structured suggestion.

Design constraints:
    - Read-only: no tool mutates the underlying DataFrame.
    - Bounded payloads: every tool clamps its return size so a malformed call
      can't dump the entire dataset into the prompt context.
    - JSON-serializable output: results pass through ``json.dumps`` with a
      string fallback so timestamps, numpy scalars, and NaN don't break the
      tool message.
    - Error-as-data: invalid arguments return ``"ERROR: <reason>"`` strings so
      the LLM can self-correct on the next turn instead of aborting the run.
"""

from __future__ import annotations

import json
import logging
import math
from typing import Any

import pandas as pd
from langchain_core.tools import BaseTool, tool

logger = logging.getLogger(__name__)


# ============= Output bounds =============
# Hard caps applied even if the LLM asks for more. These bound worst-case token
# spend in the tool-result message and prevent a row dump masquerading as a
# legitimate query.
_MAX_SAMPLE_N = 10
_MAX_HEAD_N = 10
_MAX_VALUE_COUNTS_TOP_K = 50
_MAX_GROUPBY_TOP_K = 50
_MAX_TOP_CORRELATIONS_K = 20

# Aggregation operations exposed to the agent. Mirrors the KPI operation set
# minus "first/last/formula" (which only make sense on a single Series, not a
# group), and includes "var" since it's a natural complement to std.
_GROUPBY_OPS = {"sum", "mean", "median", "min", "max", "count", "std", "var"}


def _safe_json(payload: Any) -> str:
    """Serialize a payload to JSON, coercing non-JSON-native values to strings.

    Tool results travel as a string in the LLM message stream, so anything that
    can't be JSON-serialized (timestamps, numpy scalars, NaN/Inf) gets turned
    into ``str(...)`` rather than raising.
    """
    return json.dumps(payload, default=str, allow_nan=False, ensure_ascii=False)


def _clean_scalar(v: Any) -> Any:
    """Convert a pandas/numpy scalar to a JSON-serializable Python value.

    NaN/Inf collapse to None because ``allow_nan=False`` in ``_safe_json``
    would otherwise reject them.
    """
    if v is None:
        return None
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            return None
        return v
    if hasattr(v, "item"):
        try:
            x = v.item()
            if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
                return None
            return x
        except (ValueError, TypeError):
            pass
    return str(v)


def _series_describe(s: pd.Series) -> dict[str, Any]:
    """Return a compact descriptive summary for a Series.

    Numeric series: full quantile summary. Datetime: min/max/count.
    Anything else: count, unique-count, top, freq.
    """
    if pd.api.types.is_numeric_dtype(s):
        s = s.dropna()
        if s.empty:
            return {"count": 0, "note": "all values are null"}
        return {
            "count": int(s.count()),
            "min": _clean_scalar(s.min()),
            "max": _clean_scalar(s.max()),
            "mean": _clean_scalar(float(s.mean())),
            "std": _clean_scalar(float(s.std())) if len(s) > 1 else None,
            "median": _clean_scalar(float(s.median())),
            "q25": _clean_scalar(float(s.quantile(0.25))),
            "q75": _clean_scalar(float(s.quantile(0.75))),
        }
    if pd.api.types.is_datetime64_any_dtype(s):
        s = s.dropna()
        if s.empty:
            return {"count": 0, "note": "all values are null"}
        return {
            "count": int(s.count()),
            "min": _clean_scalar(s.min()),
            "max": _clean_scalar(s.max()),
        }
    # Categorical / object
    s = s.dropna()
    if s.empty:
        return {"count": 0, "note": "all values are null"}
    vc = s.value_counts()
    return {
        "count": int(s.count()),
        "unique": int(s.nunique()),
        "top": _clean_scalar(vc.index[0]) if len(vc) else None,
        "freq": int(vc.iloc[0]) if len(vc) else 0,
    }


def build_dataset_tools(df: pd.DataFrame) -> list[BaseTool]:
    """Build the tool set that exposes read-only views of ``df`` to the LLM.

    Each tool closes over the supplied DataFrame, so the bound tools are
    request-scoped — there's no global state shared across requests.

    Returns:
        A list of LangChain ``BaseTool`` instances ready for ``bind_tools``.
    """

    @tool
    def schema() -> str:
        """Return the dataset schema as a JSON object mapping column names to dtypes.

        Use this first to understand what columns and types are available before
        calling other tools.
        """
        try:
            cols = {col: str(df[col].dtype) for col in df.columns}
            return _safe_json({"columns": cols, "rows": int(len(df))})
        except Exception as exc:  # pragma: no cover - defensive
            return f"ERROR: schema() failed: {exc}"

    @tool
    def describe(column: str) -> str:
        """Return a statistical summary for a single column.

        For numeric columns: count/min/max/mean/std/median/q25/q75.
        For datetime columns: count/min/max.
        For categorical columns: count/unique/top/freq.

        Args:
            column: Exact column name (case-sensitive).
        """
        if column not in df.columns:
            return f"ERROR: column '{column}' not found. Use schema() to list columns."
        try:
            return _safe_json({"column": column, "summary": _series_describe(df[column])})
        except Exception as exc:
            return f"ERROR: describe('{column}') failed: {exc}"

    @tool
    def value_counts(column: str, top_k: int = 20) -> str:
        """Return the top-k most frequent values in a column with their counts.

        Useful for understanding categorical cardinality, common values, and
        skew. Counts are clamped to at most 50 entries.

        Args:
            column: Exact column name (case-sensitive).
            top_k: Number of top values to return (clamped to [1, 50]).
        """
        if column not in df.columns:
            return f"ERROR: column '{column}' not found. Use schema() to list columns."
        try:
            k = max(1, min(int(top_k), _MAX_VALUE_COUNTS_TOP_K))
            vc = df[column].value_counts(dropna=False).head(k)
            items = [
                {"value": _clean_scalar(idx), "count": int(cnt)}
                for idx, cnt in vc.items()
            ]
            return _safe_json({
                "column": column,
                "top_k": k,
                "total_rows": int(len(df)),
                "unique_in_column": int(df[column].nunique(dropna=True)),
                "values": items,
            })
        except Exception as exc:
            return f"ERROR: value_counts('{column}') failed: {exc}"

    @tool
    def sample(n: int = 5) -> str:
        """Return a random sample of up to 10 rows from the dataset.

        Each row is a JSON object mapping column name → value. Rows are sampled
        without replacement; the same call may return different rows.

        Args:
            n: Number of rows to sample (clamped to [1, 10]).
        """
        try:
            k = max(1, min(int(n), _MAX_SAMPLE_N))
            if df.empty:
                return _safe_json({"rows": []})
            rows = df.sample(n=min(k, len(df))).to_dict(orient="records")
            cleaned = [{c: _clean_scalar(v) for c, v in row.items()} for row in rows]
            return _safe_json({"rows": cleaned, "n": len(cleaned)})
        except Exception as exc:
            return f"ERROR: sample() failed: {exc}"

    @tool
    def head(n: int = 5) -> str:
        """Return the first n rows of the dataset (clamped to 10).

        Useful for understanding the data layout and seeing concrete first-row
        values. Each row is a JSON object mapping column name → value.

        Args:
            n: Number of rows to return (clamped to [1, 10]).
        """
        try:
            k = max(1, min(int(n), _MAX_HEAD_N))
            rows = df.head(k).to_dict(orient="records")
            cleaned = [{c: _clean_scalar(v) for c, v in row.items()} for row in rows]
            return _safe_json({"rows": cleaned, "n": len(cleaned)})
        except Exception as exc:
            return f"ERROR: head() failed: {exc}"

    @tool
    def correlation(col1: str, col2: str) -> str:
        """Return the Pearson correlation coefficient between two numeric columns.

        Both columns must be numeric. Null pairs are dropped before computing.

        Args:
            col1: First column name.
            col2: Second column name.
        """
        if col1 not in df.columns:
            return f"ERROR: column '{col1}' not found. Use schema() to list columns."
        if col2 not in df.columns:
            return f"ERROR: column '{col2}' not found. Use schema() to list columns."
        try:
            s1, s2 = df[col1], df[col2]
            if not pd.api.types.is_numeric_dtype(s1):
                return f"ERROR: column '{col1}' is not numeric"
            if not pd.api.types.is_numeric_dtype(s2):
                return f"ERROR: column '{col2}' is not numeric"
            paired = pd.concat([s1, s2], axis=1).dropna()
            if len(paired) < 2:
                return _safe_json({"col1": col1, "col2": col2, "pearson_r": None, "n": int(len(paired)), "note": "not enough non-null pairs"})
            r = float(paired.iloc[:, 0].corr(paired.iloc[:, 1]))
            return _safe_json({"col1": col1, "col2": col2, "pearson_r": _clean_scalar(r), "n": int(len(paired))})
        except Exception as exc:
            return f"ERROR: correlation('{col1}', '{col2}') failed: {exc}"

    @tool
    def null_counts() -> str:
        """Return the count of null/NaN values per column.

        Useful for understanding data quality before suggesting visualizations
        that may be sensitive to missingness.
        """
        try:
            counts = {col: int(df[col].isna().sum()) for col in df.columns}
            return _safe_json({"null_counts": counts, "total_rows": int(len(df))})
        except Exception as exc:
            return f"ERROR: null_counts() failed: {exc}"

    @tool
    def groupby_agg(group_col: str, agg_col: str, op: str = "mean", top_k: int = 20) -> str:
        """Aggregate one column grouped by another and return the top-k groups.

        For ``op`` in {sum, mean, median, min, max, std, var}, ``agg_col`` must
        be numeric. ``count`` works on any column. Groups with null
        ``group_col`` values are dropped. Results are sorted by aggregated
        value descending and clamped to at most 50 rows.

        Args:
            group_col: Column to group by (categorical or any).
            agg_col: Column to aggregate.
            op: Aggregation operation: sum, mean, median, min, max, count, std, var.
            top_k: Number of groups to return (clamped to [1, 50]).
        """
        if group_col not in df.columns:
            return f"ERROR: column '{group_col}' not found. Use schema() to list columns."
        if agg_col not in df.columns:
            return f"ERROR: column '{agg_col}' not found. Use schema() to list columns."
        if op not in _GROUPBY_OPS:
            return f"ERROR: unsupported op '{op}'. Allowed: {sorted(_GROUPBY_OPS)}."
        if op != "count" and not pd.api.types.is_numeric_dtype(df[agg_col]):
            return f"ERROR: agg_col '{agg_col}' must be numeric for op '{op}'."
        try:
            k = max(1, min(int(top_k), _MAX_GROUPBY_TOP_K))
            grouped = df.dropna(subset=[group_col]).groupby(group_col, dropna=True)[agg_col]
            agg_series = grouped.agg(op)
            count_series = grouped.size()
            # Sort by aggregated value desc; ties broken by index for stability.
            sort_key = agg_series.abs() if op in ("min", "max") else agg_series
            ordered = sort_key.sort_values(ascending=False, kind="mergesort").head(k)
            results = [
                {
                    "value": _clean_scalar(idx),
                    "agg": _clean_scalar(float(agg_series.loc[idx])) if op != "count" else int(agg_series.loc[idx]),
                    "count": int(count_series.loc[idx]),
                }
                for idx in ordered.index
            ]
            return _safe_json({
                "group_col": group_col,
                "agg_col": agg_col,
                "op": op,
                "top_k": k,
                "total_groups": int(agg_series.shape[0]),
                "results": results,
            })
        except Exception as exc:
            return f"ERROR: groupby_agg('{group_col}','{agg_col}',op='{op}') failed: {exc}"

    @tool
    def top_correlations(target: str, k: int = 5) -> str:
        """Rank numeric columns by their Pearson correlation with a target column.

        Computes ``|pearson_r|`` between ``target`` and every other numeric
        column and returns the top-k by absolute correlation. Avoids the
        N×N call cost of probing pairs one-by-one. Results include both the
        signed ``pearson_r`` and the non-null sample size for each pair.

        Args:
            target: Numeric column to correlate against.
            k: Number of top columns to return (clamped to [1, 20]).
        """
        if target not in df.columns:
            return f"ERROR: column '{target}' not found. Use schema() to list columns."
        if not pd.api.types.is_numeric_dtype(df[target]):
            return f"ERROR: target '{target}' is not numeric"
        try:
            kk = max(1, min(int(k), _MAX_TOP_CORRELATIONS_K))
            target_series = df[target]
            scores: list[dict[str, Any]] = []
            for col in df.columns:
                if col == target or not pd.api.types.is_numeric_dtype(df[col]):
                    continue
                paired = pd.concat([target_series, df[col]], axis=1).dropna()
                if len(paired) < 2:
                    continue
                r = float(paired.iloc[:, 0].corr(paired.iloc[:, 1]))
                if math.isnan(r):
                    continue
                scores.append({"column": col, "pearson_r": _clean_scalar(r), "n": int(len(paired))})
            scores.sort(key=lambda d: abs(d["pearson_r"] or 0.0), reverse=True)
            return _safe_json({
                "target": target,
                "k": kk,
                "candidates_evaluated": len(scores),
                "correlations": scores[:kk],
            })
        except Exception as exc:
            return f"ERROR: top_correlations('{target}') failed: {exc}"

    @tool
    def time_range(column: str) -> str:
        """Return the min/max/span and inferred frequency for a datetime column.

        Useful for time-series visualization decisions: how long is the
        record, what's the sampling cadence, are there gaps. The frequency
        hint comes from ``pandas.infer_freq`` on a sorted, deduplicated copy
        and may be ``None`` for irregular timelines.

        Args:
            column: Datetime column name.
        """
        if column not in df.columns:
            return f"ERROR: column '{column}' not found. Use schema() to list columns."
        if not pd.api.types.is_datetime64_any_dtype(df[column]):
            return f"ERROR: column '{column}' is not a datetime column"
        try:
            s = df[column].dropna()
            if s.empty:
                return _safe_json({"column": column, "count": 0, "note": "all values are null"})
            tmin = s.min()
            tmax = s.max()
            span = tmax - tmin
            # infer_freq needs ordered unique timestamps and at least 3 points
            sorted_unique = pd.Index(sorted(s.unique()))
            inferred = None
            if len(sorted_unique) >= 3:
                try:
                    inferred = pd.infer_freq(sorted_unique)
                except Exception:
                    inferred = None
            return _safe_json({
                "column": column,
                "min": _clean_scalar(tmin),
                "max": _clean_scalar(tmax),
                "span_seconds": _clean_scalar(float(span.total_seconds())),
                "span_days": _clean_scalar(float(span.total_seconds() / 86400)),
                "count_non_null": int(len(s)),
                "unique_timestamps": int(len(sorted_unique)),
                "inferred_freq": inferred,
            })
        except Exception as exc:
            return f"ERROR: time_range('{column}') failed: {exc}"

    @tool
    def quantile(column: str, q: float = 0.5) -> str:
        """Return a single quantile of a numeric column.

        More flexible than ``describe()``'s fixed q25/q50/q75 — useful when
        the agent needs a specific percentile (e.g. p99 for tail behavior or
        p10 for a lower threshold). Nulls are dropped before computing.

        Args:
            column: Numeric column name.
            q: Quantile in [0.0, 1.0] (e.g. 0.95 for the 95th percentile).
        """
        if column not in df.columns:
            return f"ERROR: column '{column}' not found. Use schema() to list columns."
        if not pd.api.types.is_numeric_dtype(df[column]):
            return f"ERROR: column '{column}' is not numeric"
        try:
            qf = float(q)
        except (TypeError, ValueError):
            return f"ERROR: q must be a number in [0, 1], got {q!r}"
        if not (0.0 <= qf <= 1.0):
            return f"ERROR: q must be in [0.0, 1.0], got {qf}"
        try:
            s = df[column].dropna()
            if s.empty:
                return _safe_json({"column": column, "q": qf, "value": None, "count": 0})
            v = float(s.quantile(qf))
            return _safe_json({
                "column": column,
                "q": qf,
                "value": _clean_scalar(v),
                "count": int(len(s)),
            })
        except Exception as exc:
            return f"ERROR: quantile('{column}', q={q}) failed: {exc}"

    @tool
    def outlier_count(column: str, method: str = "iqr", k: float = 1.5) -> str:
        """Count outliers in a numeric column under the IQR or z-score rule.

        - ``method="iqr"``: outliers are values outside ``[q25 - k·IQR, q75 + k·IQR]``.
          Default ``k=1.5`` is the standard Tukey rule; ``k=3`` flags only
          extreme outliers.
        - ``method="zscore"``: outliers are values with ``|z| > k`` (default 3.0).

        Returns the count and the cutoff bounds so the agent can reason about
        whether to suggest a box plot, a clip, or a separate outlier view.

        Args:
            column: Numeric column name.
            method: "iqr" or "zscore".
            k: IQR multiplier (default 1.5) or z-score threshold (default 3.0).
        """
        if column not in df.columns:
            return f"ERROR: column '{column}' not found. Use schema() to list columns."
        if not pd.api.types.is_numeric_dtype(df[column]):
            return f"ERROR: column '{column}' is not numeric"
        if method not in ("iqr", "zscore"):
            return f"ERROR: method must be 'iqr' or 'zscore', got {method!r}"
        try:
            kf = float(k)
        except (TypeError, ValueError):
            return f"ERROR: k must be a number, got {k!r}"
        try:
            s = df[column].dropna()
            if s.empty:
                return _safe_json({"column": column, "method": method, "outlier_count": 0, "total_count": 0})
            if method == "iqr":
                q25 = float(s.quantile(0.25))
                q75 = float(s.quantile(0.75))
                iqr = q75 - q25
                lower = q25 - kf * iqr
                upper = q75 + kf * iqr
                mask = (s < lower) | (s > upper)
                return _safe_json({
                    "column": column,
                    "method": "iqr",
                    "k": kf,
                    "lower_bound": _clean_scalar(lower),
                    "upper_bound": _clean_scalar(upper),
                    "outlier_count": int(mask.sum()),
                    "total_count": int(len(s)),
                })
            # zscore
            mean = float(s.mean())
            std = float(s.std()) if len(s) > 1 else 0.0
            if std == 0.0:
                return _safe_json({
                    "column": column,
                    "method": "zscore",
                    "k": kf,
                    "outlier_count": 0,
                    "total_count": int(len(s)),
                    "note": "std is zero; no outliers definable",
                })
            z = (s - mean) / std
            mask = z.abs() > kf
            return _safe_json({
                "column": column,
                "method": "zscore",
                "k": kf,
                "mean": _clean_scalar(mean),
                "std": _clean_scalar(std),
                "outlier_count": int(mask.sum()),
                "total_count": int(len(s)),
            })
        except Exception as exc:
            return f"ERROR: outlier_count('{column}', method='{method}') failed: {exc}"

    return [
        schema,
        describe,
        value_counts,
        sample,
        head,
        correlation,
        null_counts,
        groupby_agg,
        top_correlations,
        time_range,
        quantile,
        outlier_count,
    ]
