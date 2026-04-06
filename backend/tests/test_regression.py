"""Tests for backend/app/services/visualization/regression.py."""

import pytest
import os
import sys
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.visualization.regression import (
    _sort_key_for_x,
    _sort_points_by_x,
    CustomRegressionWrapper,
    SAFE_MATH,
    RegressionEngine,
)


class TestSortKeyForX:
    """Tests for _sort_key_for_x."""

    def test_numeric_value(self):
        assert _sort_key_for_x(5.0) == 5.0

    def test_integer_value(self):
        assert _sort_key_for_x(10) == 10.0

    def test_iso_datetime_string(self):
        key = _sort_key_for_x("2024-01-15T10:30:00")
        assert isinstance(key, float)

    def test_non_datetime_string(self):
        key = _sort_key_for_x("not-a-date")
        assert key == "not-a-date"


class TestSortPointsByX:
    """Tests for _sort_points_by_x."""

    def test_sort_numeric(self):
        points = [{"x": 3, "y": 30}, {"x": 1, "y": 10}, {"x": 2, "y": 20}]
        result = _sort_points_by_x(points)
        assert [p["x"] for p in result] == [1, 2, 3]

    def test_empty_list(self):
        assert _sort_points_by_x([]) == []

    def test_sort_datetime_strings(self):
        points = [
            {"x": "2024-01-03", "y": 3},
            {"x": "2024-01-01", "y": 1},
            {"x": "2024-01-02", "y": 2},
        ]
        result = _sort_points_by_x(points)
        assert result[0]["y"] == 1
        assert result[2]["y"] == 3


class TestCustomRegressionWrapper:
    """Tests for CustomRegressionWrapper."""

    def test_predict_linear(self):
        # y = 2*x + 1
        wrapper = CustomRegressionWrapper(
            formula="a * x + b",
            param_names=["a", "b"],
            params=np.array([2.0, 1.0]),
            predictors=["x_col"],
        )
        X = np.array([0, 1, 2, 3, 4], dtype=float)
        result = wrapper.predict(X)
        np.testing.assert_array_almost_equal(result, [1.0, 3.0, 5.0, 7.0, 9.0])

    def test_predict_exponential(self):
        # y = a * exp(b * x)
        wrapper = CustomRegressionWrapper(
            formula="a * exp(b * x)",
            param_names=["a", "b"],
            params=np.array([1.0, 0.1]),
            predictors=["x_col"],
        )
        X = np.array([0, 1, 2], dtype=float)
        result = wrapper.predict(X)
        expected = [1.0 * np.exp(0.1 * 0), 1.0 * np.exp(0.1 * 1), 1.0 * np.exp(0.1 * 2)]
        np.testing.assert_array_almost_equal(result, expected)


class TestSafeMath:
    """Tests for SAFE_MATH constants."""

    def test_contains_basic_functions(self):
        assert "sin" in SAFE_MATH
        assert "cos" in SAFE_MATH
        assert "exp" in SAFE_MATH
        assert "log" in SAFE_MATH
        assert "sqrt" in SAFE_MATH

    def test_contains_constants(self):
        assert "pi" in SAFE_MATH
        assert "e" in SAFE_MATH
        assert abs(SAFE_MATH["pi"] - np.pi) < 1e-10
        assert abs(SAFE_MATH["e"] - np.e) < 1e-10


class TestRegressionEngine:
    """Tests for RegressionEngine static methods."""

    def test_train_model_linear(self):
        np.random.seed(42)
        X = np.arange(50, dtype=float).reshape(-1, 1)
        y = 2 * X.ravel() + 1 + np.random.randn(50) * 0.1

        model, poly, r2, y_pred = RegressionEngine.train_model(X, y, model_type="linear")
        assert poly is None  # degree=1 means no polynomial features
        assert r2 > 0.99  # Near-perfect linear fit
        assert len(y_pred) == 50

    def test_train_model_ridge(self):
        np.random.seed(42)
        X = np.arange(50, dtype=float).reshape(-1, 1)
        y = 3 * X.ravel() + 5 + np.random.randn(50) * 0.5

        model, poly, r2, y_pred = RegressionEngine.train_model(
            X, y, model_type="ridge", alpha=1.0
        )
        assert poly is None
        assert r2 > 0.95
        assert len(y_pred) == 50

    def test_add_regression_linear(self):
        np.random.seed(42)
        x_data = list(range(50))
        y_data = [2 * x + 1 + np.random.randn() * 0.1 for x in x_data]

        line_series, band_series, reg_model = RegressionEngine.add_regression(
            x_data, y_data, model_type="linear"
        )
        assert line_series is not None
        assert reg_model is not None
        assert reg_model.r2 > 0.99
