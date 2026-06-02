"""Tests for backend/app/services/ai_graph/profile.py.

Covers role classification, null/cardinality/skew computation, datetime-candidate
sniffing, strong-correlation detection, the suggested timestamp, JSON-safety, and
the markdown rendering used to ground the metadata-only prompt.
"""

import json
import os
import sys

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.ai_graph.profile import (
    build_dataset_profile,
    format_profile_for_prompt,
)


N = 24


@pytest.fixture
def df():
    """A 24-row frame exercising every role plus a datetime candidate and a
    perfectly-correlated numeric pair."""
    ts = pd.date_range("2024-01-01", periods=N, freq="h")
    rng = np.arange(N)
    return pd.DataFrame({
        "ts": ts,                                              # datetime
        "temp": np.concatenate([[np.nan], np.sin(rng[1:]) * 10 + 50]),  # numeric, 1 null
        "mode": ["Run", "Idle", "Fault"] * 8,                  # categorical (3 uniq)
        "flag": [0, 1] * 12,                                   # boolean (2 uniq)
        "const": [5.0] * N,                                    # constant
        "rid": rng,                                            # identifier (int index)
        "date_str": [d.strftime("%Y-%m-%d") for d in ts],      # datetime-like text
        "numstr": [str(i) for i in rng],                       # numeric-looking text
        "ca": (rng % 7).astype(float),                         # numeric
        "cb": (rng % 7) * 3.0 + 1.0,                           # == 3*ca + 1 (r = 1.0)
        "empty": [np.nan] * N,                                 # all null
    })


def _roles(profile):
    return {p["name"]: p.get("role") for p in profile["column_profiles"]}


class TestBuildDatasetProfile:
    def test_top_level_shape(self, df):
        p = build_dataset_profile(df)
        assert p["rows"] == N
        assert p["columns"] == 11
        assert len(p["column_profiles"]) == 11

    def test_role_classification(self, df):
        roles = _roles(build_dataset_profile(df))
        assert roles["ts"] == "datetime"
        assert roles["temp"] == "numeric"
        assert roles["mode"] == "categorical"
        assert roles["flag"] == "boolean"
        assert roles["const"] == "constant"
        assert roles["rid"] == "identifier"
        assert roles["numstr"] == "identifier"   # non-numeric, all-distinct
        assert roles["ca"] == "numeric"
        assert roles["empty"] == "empty"

    def test_null_pct(self, df):
        by_name = {p["name"]: p for p in build_dataset_profile(df)["column_profiles"]}
        assert by_name["ts"]["null_pct"] == 0.0
        assert by_name["temp"]["null_pct"] == round(1 / N * 100, 1)  # 4.2
        assert by_name["empty"]["null_pct"] == 100.0

    def test_skew_only_for_numeric_role(self, df):
        by_name = {p["name"]: p for p in build_dataset_profile(df)["column_profiles"]}
        assert isinstance(by_name["temp"]["skew"], float)
        assert isinstance(by_name["ca"]["skew"], float)
        # Non-numeric roles carry no skew
        assert by_name["mode"]["skew"] is None
        assert by_name["flag"]["skew"] is None

    def test_examples_bounded_and_present(self, df):
        by_name = {p["name"]: p for p in build_dataset_profile(df)["column_profiles"]}
        assert len(by_name["mode"]["examples"]) <= 3
        assert set(by_name["mode"]["examples"]).issubset({"Run", "Idle", "Fault"})

    def test_datetime_candidates(self, df):
        p = build_dataset_profile(df)
        assert "date_str" in p["datetime_candidates"]
        assert "numstr" not in p["datetime_candidates"]   # numeric strings excluded
        assert "ts" not in p["datetime_candidates"]        # already datetime dtype

    def test_suggested_time_index_prefers_datetime_dtype(self, df):
        assert build_dataset_profile(df)["suggested_time_index"] == "ts"

    def test_suggested_time_index_falls_back_to_candidate(self):
        df = pd.DataFrame({"when": ["2024-01-01", "2024-01-02", "2024-01-03"], "x": [1, 2, 3]})
        assert build_dataset_profile(df)["suggested_time_index"] == "when"

    def test_high_correlation_pairs(self, df):
        pairs = build_dataset_profile(df)["high_correlation_pairs"]
        ca_cb = [p for p in pairs if {p["a"], p["b"]} == {"ca", "cb"}]
        assert len(ca_cb) == 1
        assert abs(ca_cb[0]["r"]) >= 0.99

    def test_json_serializable_no_nan(self, df):
        # NaN/Inf must collapse to null so the overview() tool can emit strict JSON.
        payload = json.dumps(build_dataset_profile(df), allow_nan=False)
        assert "NaN" not in payload

    def test_empty_dataframe(self):
        p = build_dataset_profile(pd.DataFrame())
        assert p["rows"] == 0
        assert p["columns"] == 0
        assert p["column_profiles"] == []
        assert p["suggested_time_index"] is None


class TestFormatProfileForPrompt:
    def test_contains_key_sections(self, df):
        text = format_profile_for_prompt(build_dataset_profile(df))
        assert "## Dataset Profile" in text
        assert f"Rows: {N}" in text
        assert "Likely timestamp: `ts`" in text
        assert "`temp`" in text
        assert "Strong correlations" in text

    def test_empty_dataframe_renders_empty_string(self):
        assert format_profile_for_prompt(build_dataset_profile(pd.DataFrame())) == ""

    def test_no_strong_correlations_note(self):
        df = pd.DataFrame({"a": [1, 2, 3, 4], "b": [4, 1, 3, 2]})
        text = format_profile_for_prompt(build_dataset_profile(df))
        assert "none found" in text
