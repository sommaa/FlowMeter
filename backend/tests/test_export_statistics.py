"""Tests for app/services/export_helpers/statistics.py - compute_statistics."""

import pytest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pandas as pd
import numpy as np
from unittest.mock import patch

from app.models.schemas import (
    VisualizationConfig,
    VisualizationType,
    AxisConfig,
    LegendConfig,
    FormulaConfig,
)
from app.services.export_helpers.statistics import compute_statistics


def _make_viz(**kwargs):
    """Helper to create a VisualizationConfig with defaults."""
    defaults = dict(id="v1", title="Test")
    defaults.update(kwargs)
    return VisualizationConfig(**defaults)


@pytest.fixture
def numeric_df():
    """Simple numeric DataFrame with a known trend."""
    return pd.DataFrame({
        "Temp": [10.0, 20.0, 30.0, 40.0, 50.0],
        "Pressure": [100.0, 100.0, 100.0, 100.0, 100.0],
    })


@pytest.fixture
def large_df():
    """Larger DataFrame for regression testing."""
    np.random.seed(42)
    n = 100
    return pd.DataFrame({
        "X": np.linspace(0, 10, n),
        "Y": np.linspace(100, 200, n) + np.random.normal(0, 1, n),
    })


class TestComputeStatisticsBasic:
    """Basic HTML output and structure."""

    def test_returns_html_table(self, numeric_df):
        viz = _make_viz(
            axis=AxisConfig(y_axis=["Temp"]),
        )
        html = compute_statistics(numeric_df, [viz])
        assert "<table" in html
        assert "</table>" in html

    def test_contains_stat_rows(self, numeric_df):
        viz = _make_viz(
            axis=AxisConfig(y_axis=["Temp"]),
        )
        html = compute_statistics(numeric_df, [viz])
        assert "Median" in html
        assert "Min" in html
        assert "Max" in html
        assert "N" in html  # "N° of Samples" contains N

    def test_no_data_returns_message(self, numeric_df):
        """Viz referencing a column that doesn't exist produces no stats."""
        viz = _make_viz(
            axis=AxisConfig(y_axis=["NonExistent"]),
        )
        html = compute_statistics(numeric_df, [viz])
        assert "No data selected" in html


class TestComputeStatisticsValues:
    """Verify computed statistical values."""

    def test_median_value(self, numeric_df):
        viz = _make_viz(
            axis=AxisConfig(y_axis=["Temp"]),
        )
        html = compute_statistics(numeric_df, [viz])
        # Median of [10, 20, 30, 40, 50] = 30.0
        assert "30.0" in html

    def test_min_max_values(self, numeric_df):
        viz = _make_viz(
            axis=AxisConfig(y_axis=["Temp"]),
        )
        html = compute_statistics(numeric_df, [viz])
        assert "10.0" in html  # min
        assert "50.0" in html  # max

    def test_sample_count(self, numeric_df):
        viz = _make_viz(
            axis=AxisConfig(y_axis=["Temp"]),
        )
        html = compute_statistics(numeric_df, [viz])
        assert "5.0" in html  # count = 5


class TestComputeStatisticsMultipleColumns:
    """Multiple y_axis columns produce multi-column table."""

    def test_two_columns(self, numeric_df):
        viz = _make_viz(
            axis=AxisConfig(y_axis=["Temp", "Pressure"]),
        )
        html = compute_statistics(numeric_df, [viz])
        assert "Temp" in html
        assert "Pressure" in html


class TestComputeStatisticsLegendLabels:
    """Custom legend labels replace column names in the table."""

    def test_custom_label(self, numeric_df):
        viz = _make_viz(
            axis=AxisConfig(y_axis=["Temp"]),
            legend=LegendConfig(labels=["Temperature (C)"]),
        )
        html = compute_statistics(numeric_df, [viz])
        assert "Temperature (C)" in html


class TestComputeStatisticsTrendIndicators:
    """Regression-based % change trend indicators."""

    def test_increasing_trend_green(self, numeric_df):
        """[10, 20, 30, 40, 50] has a clear increasing trend."""
        viz = _make_viz(
            axis=AxisConfig(y_axis=["Temp"]),
        )
        html = compute_statistics(numeric_df, [viz])
        # Should show green arrow for increase > 0.5%
        assert "#10b981" in html  # green color

    def test_stable_trend_gray(self, numeric_df):
        """[100, 100, 100, 100, 100] is stable."""
        viz = _make_viz(
            axis=AxisConfig(y_axis=["Pressure"]),
        )
        html = compute_statistics(numeric_df, [viz])
        # Should show gray arrow for stable
        assert "#64748b" in html  # gray color


class TestComputeStatisticsDeduplication:
    """Same label from multiple visualizations is only included once."""

    def test_duplicate_label_only_once(self, numeric_df):
        viz1 = _make_viz(id="v1", axis=AxisConfig(y_axis=["Temp"]))
        viz2 = _make_viz(id="v2", axis=AxisConfig(y_axis=["Temp"]))
        html = compute_statistics(numeric_df, [viz1, viz2])
        # Count occurrences of "Temp" in header row only
        header_count = html.split("</thead>")[0].count("Temp")
        assert header_count == 1


class TestComputeStatisticsFormula:
    """Formula-type visualization statistics."""

    def test_formula_viz_computes_stats(self, numeric_df):
        viz = _make_viz(
            viz_type=VisualizationType.FORMULA,
            formula=FormulaConfig(input="result = col['Temp'] * 2"),
        )
        html = compute_statistics(numeric_df, [viz])
        # Should contain stats table (not "No data")
        assert "<table" in html


class TestComputeStatisticsErrorHandling:
    """Error handling returns error message in HTML."""

    def test_exception_returns_error_html(self):
        # Pass something that will cause an internal error
        html = compute_statistics(None, [])
        assert "Error" in html or "No data" in html
