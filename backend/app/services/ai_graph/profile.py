"""Server-computed dataset profile for grounding AI suggestions.

The profile is a compact, mostly-aggregate snapshot of the loaded DataFrame —
per-column role/null%/cardinality/skew/examples, datetime-like text columns,
strong correlation pairs, and the best timestamp candidate. It is used in two
places:

    1. **Default (metadata-only) path** — ``format_profile_for_prompt`` renders
       it into the user prompt so the AI is grounded in what the data actually
       looks like without spending any tool round-trips. Only aggregates plus a
       few example values per column travel to the provider; no full rows.
    2. **Agent (dataset_access) path** — exposed as the ``overview()`` tool so
       the model can fetch the whole profile in a single call instead of
       rediscovering basics with ``schema()`` + ``null_counts()`` +
       ``top_correlations()`` + ``describe()``.

Design constraints mirror ``tools.py``: read-only, bounded output, and
JSON-serializable values (NaN/Inf collapse to ``None``).
"""

from __future__ import annotations

import logging
import math
import warnings
from typing import Any, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


# ============= Bounds =============
# Caps that keep the profile (and its prompt rendering) bounded regardless of
# dataset width/length.
_MAX_EXAMPLES = 3            # distinct example values shown per column
_EXAMPLE_STR_CHARS = 40      # truncation for a single stringified example
_MAX_CORR_COLUMNS = 40       # numeric columns considered for the corr matrix
_MAX_CORR_ROWS = 50_000      # rows sampled before computing correlations
_MAX_CORR_PAIRS = 15         # strong pairs surfaced
_CORR_THRESHOLD = 0.7        # |pearson_r| cutoff for "strong"
_DATETIME_SAMPLE = 50        # values sampled when sniffing datetime-like text
_DATETIME_PARSE_RATIO = 0.8  # fraction that must parse for a datetime candidate
_IDENTIFIER_MIN_ROWS = 20    # below this, all-distinct isn't a reliable id signal


def _jsonable(v: Any) -> Any:
    """Coerce a pandas/numpy scalar into a JSON-native value.

    NaN/Inf collapse to ``None``; numpy scalars unwrap via ``.item()`` but only
    when that yields a JSON-native type. Anything exotic (timestamps unwrapped
    to ``datetime``, Decimals, etc.) falls back to ``str`` so the result always
    survives ``json.dumps(..., allow_nan=False)``.
    """
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, float):
        return None if (math.isnan(v) or math.isinf(v)) else v
    if isinstance(v, (int, str)):
        return v
    if hasattr(v, "item"):
        try:
            x = v.item()
        except (ValueError, TypeError):
            x = None
        if isinstance(x, bool):
            return x
        if isinstance(x, float):
            return None if (math.isnan(x) or math.isinf(x)) else x
        if isinstance(x, (int, str)):
            return x
        if x is not None:
            return str(x)  # datetime, Decimal, … → stringify
    return str(v)


def _example_values(s: pd.Series) -> list[Any]:
    """Up to ``_MAX_EXAMPLES`` distinct non-null example values, JSON-safe.

    Datetimes and other non-native scalars are stringified; long strings are
    truncated so a single wide cell can't bloat the payload.
    """
    out: list[Any] = []
    try:
        seen = pd.unique(s.dropna())
    except Exception:
        return out
    for v in seen[:_MAX_EXAMPLES]:
        jv = _jsonable(v)
        if isinstance(jv, float):
            # Trim noisy precision (e.g. 411.5893546463605 → 411.6) to keep the
            # prompt compact; the per-column stats already convey distribution.
            jv = float(f"{jv:.4g}")
        elif isinstance(jv, str) and len(jv) > _EXAMPLE_STR_CHARS:
            jv = jv[: _EXAMPLE_STR_CHARS - 1] + "…"
        out.append(jv)
    return out


def _classify_role(s: pd.Series, n_nonnull: int, n_unique: int) -> str:
    """Assign an analytical role used to steer (and guard) suggestions.

    Roles: ``empty``, ``constant``, ``datetime``, ``boolean``, ``identifier``,
    ``numeric``, ``categorical``. The ordering matters — a one-value column is
    ``constant`` before it can look ``boolean``, and an all-distinct key column
    is ``identifier`` before it falls through to ``numeric``/``categorical``.
    """
    if n_nonnull == 0:
        return "empty"
    if n_unique <= 1:
        return "constant"
    if pd.api.types.is_datetime64_any_dtype(s):
        return "datetime"
    if pd.api.types.is_bool_dtype(s) or n_unique == 2:
        return "boolean"

    is_numeric = pd.api.types.is_numeric_dtype(s)
    all_distinct = n_unique == n_nonnull

    # Non-numeric all-distinct columns with enough rows are almost always keys
    # (order ids, run labels) — not something to plot.
    if not is_numeric and all_distinct and n_nonnull >= _IDENTIFIER_MIN_ROWS:
        return "identifier"

    # A strictly increasing, all-distinct integer column starting at 0/1 is a
    # row index / auto-increment id. Restrict to integer dtype so continuous
    # float sensors (often all-distinct too) are never misflagged.
    if (
        is_numeric
        and pd.api.types.is_integer_dtype(s)
        and all_distinct
        and n_nonnull >= _IDENTIFIER_MIN_ROWS
    ):
        nn = s.dropna()
        if nn.is_monotonic_increasing and _jsonable(nn.min()) in (0, 1):
            return "identifier"

    if is_numeric:
        return "numeric"
    return "categorical"


def _column_skew(s: pd.Series) -> Optional[float]:
    """Pearson skewness of a numeric series, or ``None`` when undefined."""
    nn = s.dropna()
    if len(nn) < 3:
        return None
    try:
        sk = float(nn.skew())
    except (TypeError, ValueError):
        return None
    if math.isnan(sk) or math.isinf(sk):
        return None
    return round(sk, 3)


def _is_datetime_candidate(s: pd.Series) -> bool:
    """True when an object/text column parses as datetimes for most values.

    Pure-numeric strings are excluded so integer-coded columns aren't mistaken
    for epoch timestamps.
    """
    if pd.api.types.is_datetime64_any_dtype(s):
        return False
    if pd.api.types.is_numeric_dtype(s) or pd.api.types.is_bool_dtype(s):
        return False
    sample = s.dropna().astype(str).head(_DATETIME_SAMPLE)
    if sample.empty:
        return False
    # Skip columns that are just numbers as text (e.g. "1", "2.5").
    if sample.str.fullmatch(r"\s*-?\d+(\.\d+)?\s*").all():
        return False
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            parsed = pd.to_datetime(sample, errors="coerce")
    except Exception:
        return False
    return float(parsed.notna().mean()) >= _DATETIME_PARSE_RATIO


def _high_correlation_pairs(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Pairs of numeric columns with ``|pearson_r| >= _CORR_THRESHOLD``.

    Columns and rows are capped to bound the O(rows·cols²) correlation cost on
    very wide/long datasets; row sampling is seeded for determinism.
    """
    numeric = df.select_dtypes(include=[np.number])
    cols = list(numeric.columns)[:_MAX_CORR_COLUMNS]
    if len(cols) < 2:
        return []
    sub = numeric[cols]
    if len(sub) > _MAX_CORR_ROWS:
        sub = sub.sample(_MAX_CORR_ROWS, random_state=0)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            corr = sub.corr(numeric_only=True)
    except Exception:
        return []

    pairs: list[dict[str, Any]] = []
    for i, a in enumerate(cols):
        for b in cols[i + 1:]:
            try:
                r = corr.loc[a, b]
            except KeyError:
                continue
            if pd.notna(r) and abs(float(r)) >= _CORR_THRESHOLD:
                pairs.append({"a": a, "b": b, "r": round(float(r), 3)})
    pairs.sort(key=lambda d: abs(d["r"]), reverse=True)
    return pairs[:_MAX_CORR_PAIRS]


def build_dataset_profile(df: pd.DataFrame) -> dict[str, Any]:
    """Compute a compact, JSON-serializable profile of ``df``.

    Returns a dict with::

        rows, columns,
        column_profiles: [{name, dtype, role, null_pct, n_unique, skew, examples}],
        datetime_candidates: [name, ...],
        high_correlation_pairs: [{a, b, r}, ...],
        suggested_time_index: name | None

    The function never raises on a per-column basis — a column that blows up
    during profiling is skipped with its name preserved and a ``note`` field —
    so one pathological column can't sink the whole suggestion request.
    """
    n_rows = int(len(df))
    column_profiles: list[dict[str, Any]] = []
    datetime_candidates: list[str] = []

    for name in df.columns:
        col_name = str(name)
        try:
            s = df[name]
            n_nonnull = int(s.notna().sum())
            n_unique = int(s.nunique(dropna=True))
            role = _classify_role(s, n_nonnull, n_unique)
            null_pct = round((1 - n_nonnull / n_rows) * 100, 1) if n_rows else 0.0
            profile: dict[str, Any] = {
                "name": col_name,
                "dtype": str(s.dtype),
                "role": role,
                "null_pct": null_pct,
                "n_unique": n_unique,
                "skew": _column_skew(s) if role == "numeric" else None,
                "examples": _example_values(s),
            }
            column_profiles.append(profile)

            if _is_datetime_candidate(s):
                datetime_candidates.append(col_name)
        except Exception as exc:  # pragma: no cover - defensive per-column guard
            logger.warning("profile: failed on column %r: %s", col_name, exc)
            column_profiles.append({"name": col_name, "note": f"profiling failed: {exc}"})

    # Best timestamp: an existing datetime dtype wins; else the first text
    # column that sniffs as datetime.
    suggested_time_index: Optional[str] = None
    for p in column_profiles:
        if p.get("role") == "datetime":
            suggested_time_index = p["name"]
            break
    if suggested_time_index is None and datetime_candidates:
        suggested_time_index = datetime_candidates[0]

    return {
        "rows": n_rows,
        "columns": int(df.shape[1]),
        "column_profiles": column_profiles,
        "datetime_candidates": datetime_candidates,
        "high_correlation_pairs": _high_correlation_pairs(df),
        "suggested_time_index": suggested_time_index,
    }


# How many per-column lines to render in the prompt before truncating. The full
# column list already appears elsewhere in the prompt; this section adds the
# computed signal (role/null/cardinality/examples) on top.
_MAX_PROMPT_COLUMNS = 80


def _fmt_examples(examples: list[Any]) -> str:
    return ", ".join(str(e) for e in examples) if examples else "—"


def format_profile_for_prompt(profile: dict[str, Any]) -> str:
    """Render a profile dict as a compact markdown block for the user prompt.

    Returns an empty string for an empty/zero-column dataset so the caller can
    skip the section entirely.
    """
    n_rows = profile.get("rows", 0)
    col_profiles = profile.get("column_profiles", [])
    if not col_profiles:
        return ""

    lines: list[str] = ["## Dataset Profile (computed from the full dataset)"]

    header = f"Rows: {n_rows:,} · Columns: {profile.get('columns', len(col_profiles))}"
    if profile.get("suggested_time_index"):
        header += f" · Likely timestamp: `{profile['suggested_time_index']}`"
    lines.append(header)
    lines.append("")
    lines.append("Columns (role · null% · unique · examples):")

    for p in col_profiles[:_MAX_PROMPT_COLUMNS]:
        if "note" in p:
            lines.append(f"- `{p['name']}` — {p['note']}")
            continue
        parts = [
            f"{p['role']}",
            f"{p['null_pct']}% null",
            f"{p['n_unique']} uniq",
        ]
        if p.get("skew") is not None:
            parts.append(f"skew {p['skew']}")
        parts.append(f"e.g. {_fmt_examples(p.get('examples', []))}")
        lines.append(f"- `{p['name']}` — " + " · ".join(parts))

    if len(col_profiles) > _MAX_PROMPT_COLUMNS:
        lines.append(f"- … and {len(col_profiles) - _MAX_PROMPT_COLUMNS} more columns")

    candidates = profile.get("datetime_candidates", [])
    if candidates:
        lines.append("")
        lines.append(
            "Datetime-like text columns (parse to timestamps): "
            + ", ".join(f"`{c}`" for c in candidates)
        )

    pairs = profile.get("high_correlation_pairs", [])
    lines.append("")
    if pairs:
        rendered = "; ".join(f"`{p['a']}`↔`{p['b']}` {p['r']}" for p in pairs)
        lines.append(f"Strong correlations (|r| ≥ {_CORR_THRESHOLD}): {rendered}")
    else:
        lines.append(f"Strong correlations (|r| ≥ {_CORR_THRESHOLD}): none found")

    return "\n".join(lines)
