"""Tests for backend/app/services/visualization/root_cause.py."""

import pytest
import os
import sys
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.visualization.root_cause import generate_root_cause_data, _serialize_index
from app.models.schemas import VisualizationConfig, AxisConfig, RootCauseConfig


def _make_config(target_variable="target", y_axis=None):
    """Create a VisualizationConfig for root cause testing."""
    return VisualizationConfig(
        id="rc-test",
        title="Root Cause Test",
        viz_type="root_cause",
        axis=AxisConfig(x_axis="Index", y_axis=y_axis or ["target"]),
        root_cause=RootCauseConfig(
            target_variable=target_variable,
            methods=["pearson"],  # Only pearson for fast testing
            max_lag=10,
            top_n=5,
        ),
    )


@pytest.fixture
def rc_df():
    """Create a DataFrame suitable for root cause analysis."""
    np.random.seed(42)
    n = 200
    x1 = np.cumsum(np.random.randn(n))
    x2 = np.cumsum(np.random.randn(n))
    x3 = np.cumsum(np.random.randn(n))
    target = x1 * 0.8 + x2 * 0.3 + np.random.randn(n) * 0.1
    return pd.DataFrame({
        "target": target,
        "x1": x1,
        "x2": x2,
        "x3": x3,
    })


class TestGenerateRootCauseData:
    """Tests for generate_root_cause_data."""

    def test_basic_analysis(self, rc_df):
        config = _make_config()
        result = generate_root_cause_data(rc_df, config)
        assert result.title.startswith("Root Cause Analysis")
        assert result.root_cause_analysis is not None
        assert "ranking" in result.root_cause_analysis
        assert "target_stats" in result.root_cause_analysis
        assert len(result.series) >= 1  # At least the target trend

    def test_empty_dataframe_raises(self):
        df = pd.DataFrame(columns=["target", "x1"])
        config = _make_config()
        with pytest.raises(ValueError, match="empty"):
            generate_root_cause_data(df, config)

    def test_missing_target_column(self, rc_df):
        config = _make_config(target_variable="nonexistent")
        with pytest.raises(ValueError, match="not found"):
            generate_root_cause_data(rc_df, config)

    def test_no_target_no_y_axis_raises(self, rc_df):
        # Must bypass _make_config's `or` default to actually pass empty y_axis
        config = VisualizationConfig(
            id="rc-test",
            title="Root Cause Test",
            viz_type="root_cause",
            axis=AxisConfig(x_axis="Index", y_axis=[]),
            root_cause=RootCauseConfig(
                target_variable="",
                methods=["pearson"],
                max_lag=10,
                top_n=5,
            ),
        )
        with pytest.raises(ValueError, match="No target variable"):
            generate_root_cause_data(rc_df, config)

    def test_fallback_to_y_axis(self, rc_df):
        config = _make_config(target_variable="", y_axis=["target"])
        config.root_cause.target_variable = ""
        result = generate_root_cause_data(rc_df, config)
        assert result.root_cause_analysis["target_variable"] == "target"

    def test_ranking_has_variables(self, rc_df):
        config = _make_config()
        result = generate_root_cause_data(rc_df, config)
        variables = [r["variable"] for r in result.root_cause_analysis["ranking"]]
        # Should find x1, x2, x3 (not target itself)
        assert "target" not in variables
        assert any(v in variables for v in ["x1", "x2", "x3"])


class TestSerializeIndex:
    """Tests for _serialize_index."""

    def test_datetime_index(self):
        dt = pd.Timestamp("2024-01-15 10:30:00")
        result = _serialize_index(dt)
        assert isinstance(result, str)
        assert "2024" in result

    def test_integer_index(self):
        result = _serialize_index(42)
        assert result == 42

    def test_string_index(self):
        result = _serialize_index("label")
        assert result == "label"
