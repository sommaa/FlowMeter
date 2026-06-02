"""Tests for backend/app/services/ai_graph/tools.py.

Covers each read-only DataFrame inspection tool: bounds enforcement, missing
columns, JSON-serializable output, and the error-as-data contract that lets
the LLM self-correct without aborting the agent loop.
"""

import json
import os
import sys

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.ai_graph.tools import build_dataset_tools


@pytest.fixture
def df():
    """A small mixed-type DataFrame fixture covering numeric/datetime/categorical."""
    return pd.DataFrame({
        "temp": [10.0, 20.0, 30.0, 40.0, np.nan, 50.0],
        "cat": ["a", "b", "a", "a", "c", "b"],
        "ts": pd.to_datetime([
            "2024-01-01", "2024-01-02", "2024-01-03",
            "2024-01-04", "2024-01-05", "2024-01-06",
        ]),
        "ratio": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
    })


@pytest.fixture
def tools(df):
    """Tools bound to ``df`` keyed by name for direct lookup."""
    return {t.name: t for t in build_dataset_tools(df)}


def _payload(tool, **kwargs):
    """Invoke ``tool`` with ``kwargs`` and decode the JSON result."""
    raw = tool.invoke(kwargs) if kwargs else tool.invoke({})
    assert isinstance(raw, str)
    return json.loads(raw)


class TestOverview:
    def test_returns_profile_with_expected_keys(self, tools):
        out = _payload(tools["overview"])
        assert out["rows"] == 6
        assert out["columns"] == 4
        names = {c["name"] for c in out["column_profiles"]}
        assert names == {"temp", "cat", "ts", "ratio"}
        # The datetime column is surfaced as the suggested time index.
        assert out["suggested_time_index"] == "ts"

    def test_output_is_strict_json(self, tools):
        # NaN in `temp` must serialize as null, not a bare NaN token.
        raw = tools["overview"].invoke({})
        assert "NaN" not in raw


class TestTestFormula:
    def test_single_result_ok(self, tools):
        out = _payload(tools["test_formula"], expression="result = col['temp'] * 2")
        assert out["ok"] is True
        assert out["n_rows_tested"] == 6
        assert len(out["results"]) == 1
        r = out["results"][0]
        assert r["name"] == "result"
        # temp = [10,20,30,40,NaN,50] * 2 -> first value 20
        assert r["preview"][0] == 20.0
        # one NaN out of six rows
        assert r["null_pct"] == round(1 / 6 * 100, 1)

    def test_multiple_results(self, tools):
        out = _payload(
            tools["test_formula"],
            expression="result1 = col['temp'] + 1\nresult2 = col['ratio'] * 10",
        )
        assert out["ok"] is True
        names = {r["name"] for r in out["results"]}
        assert names == {"result1", "result2"}

    def test_missing_column_reports_error(self, tools):
        out = _payload(tools["test_formula"], expression="result = col['nope'] * 2")
        assert out["ok"] is False
        assert "error" in out

    def test_unsafe_code_rejected(self, tools):
        out = _payload(tools["test_formula"], expression="result = __import__('os').listdir('.')")
        assert out["ok"] is False
        assert "error" in out

    def test_auto_fix_caret_power(self, tools):
        # `^` should be auto-corrected to `**`; the corrected form is surfaced.
        out = _payload(tools["test_formula"], expression="result = col['ratio'] ^ 2")
        assert out["ok"] is True
        assert "fixed_expression" in out
        assert "**" in out["fixed_expression"]

    def test_auto_fix_missing_result_assignment(self, tools):
        # A bare expression gets a `result =` prepended and still runs.
        out = _payload(tools["test_formula"], expression="col['ratio'] * 3")
        assert out["ok"] is True
        assert "fixed_expression" in out

    def test_empty_expression(self, tools):
        out = _payload(tools["test_formula"], expression="   ")
        assert out["ok"] is False

    def test_output_is_strict_json(self, tools):
        raw = tools["test_formula"].invoke({"expression": "result = col['temp'] * 2"})
        assert "NaN" not in raw


class TestSchema:
    def test_returns_dtypes_and_row_count(self, tools, df):
        out = _payload(tools["schema"])
        assert out["rows"] == len(df)
        assert set(out["columns"].keys()) == set(df.columns)
        # dtype strings include "float64", "object", and a datetime variant
        assert "float64" in out["columns"]["temp"]
        assert "datetime64" in out["columns"]["ts"]


class TestDescribe:
    def test_numeric_summary_drops_nans(self, tools):
        out = _payload(tools["describe"], column="temp")
        s = out["summary"]
        # NaN is dropped — count is 5, not 6
        assert s["count"] == 5
        assert s["min"] == 10.0
        assert s["max"] == 50.0
        # NaN/Inf must not leak through (they collapse to None)
        for k in ("min", "max", "mean", "std", "median", "q25", "q75"):
            assert s[k] is not None

    def test_datetime_summary(self, tools):
        out = _payload(tools["describe"], column="ts")
        s = out["summary"]
        assert s["count"] == 6
        assert "min" in s and "max" in s

    def test_categorical_summary(self, tools):
        out = _payload(tools["describe"], column="cat")
        s = out["summary"]
        assert s["count"] == 6
        assert s["unique"] == 3
        assert s["top"] == "a"
        assert s["freq"] == 3

    def test_missing_column_returns_error_string(self, tools):
        # Errors travel as raw "ERROR: ..." strings (not JSON) so the LLM
        # can self-correct on the next turn.
        raw = tools["describe"].invoke({"column": "nope"})
        assert raw.startswith("ERROR:")
        assert "nope" in raw


class TestValueCounts:
    def test_returns_top_values(self, tools):
        out = _payload(tools["value_counts"], column="cat", top_k=2)
        assert out["top_k"] == 2
        assert len(out["values"]) == 2
        # Most frequent is "a" with 3 occurrences
        assert out["values"][0]["value"] == "a"
        assert out["values"][0]["count"] == 3
        assert out["unique_in_column"] == 3

    def test_top_k_clamped_to_max_50(self, tools):
        out = _payload(tools["value_counts"], column="cat", top_k=999)
        assert out["top_k"] == 50  # clamped down
        # The fixture only has 3 unique values, so we can't see the full 50;
        # but the field reflects the requested-clamped k.

    def test_top_k_clamped_to_min_1(self, tools):
        out = _payload(tools["value_counts"], column="cat", top_k=0)
        assert out["top_k"] == 1
        assert len(out["values"]) == 1

    def test_missing_column(self, tools):
        raw = tools["value_counts"].invoke({"column": "missing"})
        assert raw.startswith("ERROR:")


class TestSample:
    def test_default_returns_5_rows(self, tools):
        out = _payload(tools["sample"], n=5)
        assert out["n"] == 5
        assert len(out["rows"]) == 5

    def test_clamps_to_max_10(self, tools, df):
        # Even when asked for many more, only at most 10 rows leak — and the
        # fixture only has 6, so we should see at most 6.
        out = _payload(tools["sample"], n=999)
        assert out["n"] <= min(10, len(df))

    def test_empty_dataframe_returns_empty_rows(self):
        empty_tools = {t.name: t for t in build_dataset_tools(pd.DataFrame())}
        out = _payload(empty_tools["sample"], n=5)
        assert out["rows"] == []


class TestHead:
    def test_default_returns_first_rows(self, tools, df):
        out = _payload(tools["head"], n=3)
        assert out["n"] == 3
        # Order preserved — head() should give the first three temp values
        assert out["rows"][0]["temp"] == 10.0
        assert out["rows"][1]["temp"] == 20.0

    def test_clamps_to_max_10(self, tools, df):
        out = _payload(tools["head"], n=100)
        assert out["n"] <= min(10, len(df))


class TestCorrelation:
    def test_returns_pearson_r(self, tools):
        # temp and ratio are both strongly monotonic (one NaN-paired row
        # gets dropped), so the correlation is high but not exactly 1.0.
        out = _payload(tools["correlation"], col1="temp", col2="ratio")
        assert out["pearson_r"] is not None
        assert out["pearson_r"] > 0.95
        assert out["n"] == 5  # NaN pair dropped

    def test_rejects_non_numeric_columns(self, tools):
        raw = tools["correlation"].invoke({"col1": "cat", "col2": "ratio"})
        assert raw.startswith("ERROR:")
        assert "not numeric" in raw

    def test_missing_column(self, tools):
        raw = tools["correlation"].invoke({"col1": "missing", "col2": "temp"})
        assert raw.startswith("ERROR:")


class TestNullCounts:
    def test_returns_per_column_nulls(self, tools, df):
        out = _payload(tools["null_counts"])
        assert out["total_rows"] == len(df)
        # Only `temp` has a NaN in the fixture
        assert out["null_counts"]["temp"] == 1
        assert out["null_counts"]["cat"] == 0
        assert out["null_counts"]["ts"] == 0


def test_build_dataset_tools_returns_full_toolset(df):
    tools = build_dataset_tools(df)
    names = {t.name for t in tools}
    assert names == {
        # One-shot profile
        "overview",
        # Inspection
        "schema",
        "describe",
        "value_counts",
        "sample",
        "head",
        "correlation",
        "null_counts",
        # Aggregation / ranking / time / outliers (added later)
        "groupby_agg",
        "top_correlations",
        "time_range",
        "quantile",
        "outlier_count",
        # Closed-loop verification
        "test_formula",
    }


class TestGroupbyAgg:
    def test_mean_returns_top_groups_sorted(self, tools):
        out = _payload(tools["groupby_agg"], group_col="cat", agg_col="ratio", op="mean")
        # Top result should be the group with highest mean(ratio).
        # cat="b" → ratio mean of [2, 6] = 4
        # cat="c" → ratio mean of [5] = 5
        # cat="a" → ratio mean of [1, 3, 4] = 8/3 ≈ 2.67
        assert out["op"] == "mean"
        assert out["total_groups"] == 3
        assert len(out["results"]) == 3
        assert out["results"][0]["value"] == "c"
        assert out["results"][0]["agg"] == 5.0
        assert out["results"][0]["count"] == 1

    def test_count_works_on_any_column(self, tools):
        out = _payload(tools["groupby_agg"], group_col="cat", agg_col="cat", op="count")
        # cat="a" appears 3 times — should be top
        assert out["results"][0]["value"] == "a"
        assert out["results"][0]["agg"] == 3

    def test_top_k_clamped(self, tools):
        out = _payload(tools["groupby_agg"], group_col="cat", agg_col="ratio", top_k=999)
        assert out["top_k"] == 50  # clamped down

    def test_unsupported_op_returns_error(self, tools):
        raw = tools["groupby_agg"].invoke({
            "group_col": "cat", "agg_col": "ratio", "op": "weird"
        })
        assert raw.startswith("ERROR:")

    def test_non_numeric_agg_col_with_numeric_op_errors(self, tools):
        raw = tools["groupby_agg"].invoke({
            "group_col": "ratio", "agg_col": "cat", "op": "mean"
        })
        assert raw.startswith("ERROR:")
        assert "numeric" in raw.lower()

    def test_missing_column(self, tools):
        raw = tools["groupby_agg"].invoke({
            "group_col": "missing", "agg_col": "ratio"
        })
        assert raw.startswith("ERROR:")


class TestTopCorrelations:
    def test_returns_ranked_list(self, tools):
        out = _payload(tools["top_correlations"], target="temp", k=5)
        # ratio is monotonic with temp → highest |r|
        assert out["target"] == "temp"
        assert len(out["correlations"]) >= 1
        assert out["correlations"][0]["column"] == "ratio"
        assert out["correlations"][0]["pearson_r"] > 0.95

    def test_skips_non_numeric_columns(self, tools):
        out = _payload(tools["top_correlations"], target="temp")
        cols = {c["column"] for c in out["correlations"]}
        # cat (categorical) and ts (datetime) must not appear
        assert "cat" not in cols
        assert "ts" not in cols

    def test_target_must_be_numeric(self, tools):
        raw = tools["top_correlations"].invoke({"target": "cat"})
        assert raw.startswith("ERROR:")
        assert "not numeric" in raw

    def test_k_clamped_to_max_20(self, tools):
        out = _payload(tools["top_correlations"], target="temp", k=999)
        assert out["k"] == 20

    def test_missing_target(self, tools):
        raw = tools["top_correlations"].invoke({"target": "nope"})
        assert raw.startswith("ERROR:")


class TestTimeRange:
    def test_datetime_column_returns_span_and_freq(self, tools):
        out = _payload(tools["time_range"], column="ts")
        assert out["count_non_null"] == 6
        assert out["unique_timestamps"] == 6
        # Daily fixture → infer_freq returns 'D'
        assert out["inferred_freq"] == "D"
        # Span is 5 days exactly (Jan 1 → Jan 6)
        assert out["span_days"] == 5.0

    def test_non_datetime_column_errors(self, tools):
        raw = tools["time_range"].invoke({"column": "temp"})
        assert raw.startswith("ERROR:")
        assert "datetime" in raw

    def test_missing_column(self, tools):
        raw = tools["time_range"].invoke({"column": "nope"})
        assert raw.startswith("ERROR:")


class TestQuantile:
    def test_returns_p50_default(self, tools):
        out = _payload(tools["quantile"], column="ratio")
        # Default q=0.5; ratio = [1..6] → median = 3.5
        assert out["q"] == 0.5
        assert out["value"] == 3.5
        assert out["count"] == 6

    def test_p95(self, tools):
        out = _payload(tools["quantile"], column="ratio", q=0.95)
        # ratio = [1..6], 0.95 quantile ≈ 5.75
        assert out["q"] == 0.95
        assert out["value"] is not None
        assert 5.0 <= out["value"] <= 6.0

    def test_q_out_of_range(self, tools):
        raw = tools["quantile"].invoke({"column": "ratio", "q": 1.5})
        assert raw.startswith("ERROR:")
        assert "[0.0, 1.0]" in raw

    def test_non_numeric_column(self, tools):
        raw = tools["quantile"].invoke({"column": "cat", "q": 0.5})
        assert raw.startswith("ERROR:")
        assert "not numeric" in raw


class TestOutlierCount:
    def test_iqr_default_k_1_5(self):
        # Build a series with one obvious outlier so IQR detection fires.
        df = pd.DataFrame({"v": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 100.0]})
        tools = {t.name: t for t in build_dataset_tools(df)}
        out = _payload(tools["outlier_count"], column="v")
        assert out["method"] == "iqr"
        assert out["outlier_count"] == 1
        assert out["lower_bound"] is not None
        assert out["upper_bound"] is not None

    def test_zscore_with_constant_column_returns_zero(self):
        df = pd.DataFrame({"v": [5.0, 5.0, 5.0, 5.0, 5.0]})
        tools = {t.name: t for t in build_dataset_tools(df)}
        out = _payload(tools["outlier_count"], column="v", method="zscore", k=3.0)
        assert out["outlier_count"] == 0
        assert "std is zero" in out.get("note", "")

    def test_invalid_method_errors(self, tools):
        raw = tools["outlier_count"].invoke({"column": "ratio", "method": "weird"})
        assert raw.startswith("ERROR:")

    def test_non_numeric_column(self, tools):
        raw = tools["outlier_count"].invoke({"column": "cat"})
        assert raw.startswith("ERROR:")
