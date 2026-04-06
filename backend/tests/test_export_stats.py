"""Tests for backend/app/services/export_helpers/statistics.py."""

import pytest
import os
import sys
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.export_helpers.statistics import compute_statistics
from app.models.schemas import VisualizationConfig, AxisConfig


class TestComputeStatistics:
    """Tests for compute_statistics function."""

    def test_returns_html_string(self):
        df = pd.DataFrame({"x": [1, 2, 3, 4, 5], "y": [10, 20, 30, 40, 50]})
        vizs = [
            VisualizationConfig(
                id="v1", title="Test", viz_type="universal",
                axis=AxisConfig(x_axis="Index", y_axis=["x", "y"]),
            )
        ]
        result = compute_statistics(df, vizs)
        assert isinstance(result, str)
        assert "<table" in result.lower() or "<p" in result.lower()

    def test_empty_visualizations(self):
        df = pd.DataFrame({"x": [1, 2, 3]})
        result = compute_statistics(df, [])
        assert isinstance(result, str)

    def test_with_nan_values(self):
        df = pd.DataFrame({"x": [1, np.nan, 3, np.nan, 5]})
        vizs = [
            VisualizationConfig(
                id="v1", title="Test", viz_type="universal",
                axis=AxisConfig(y_axis=["x"]),
            )
        ]
        result = compute_statistics(df, vizs)
        assert isinstance(result, str)
