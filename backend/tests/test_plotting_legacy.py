"""Tests for backend/app/services/export_helpers/_plotting_legacy.py."""

import pytest
import os
import sys
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.export_helpers._plotting_legacy import add_regression


class TestAddRegression:
    """Tests for add_regression function."""

    @pytest.fixture(autouse=True)
    def setup_axes(self):
        """Create a fresh figure and axes for each test."""
        self.fig, self.ax = plt.subplots()
        yield
        plt.close(self.fig)

    def test_linear_regression(self):
        np.random.seed(42)
        x = np.arange(50, dtype=float)
        y = 2 * x + 1 + np.random.randn(50) * 0.5
        add_regression(self.ax, x, y, degree=1, color='#0072BD')
        # Should have added lines to the axes
        assert len(self.ax.lines) > 0

    def test_polynomial_regression(self):
        np.random.seed(42)
        x = np.arange(50, dtype=float)
        y = 0.01 * x ** 2 + x + np.random.randn(50) * 0.5
        add_regression(self.ax, x, y, degree=2, color='#D95319')
        assert len(self.ax.lines) > 0

    def test_ridge_regression(self):
        np.random.seed(42)
        x = np.arange(50, dtype=float)
        y = 3 * x + 5 + np.random.randn(50) * 0.5
        add_regression(self.ax, x, y, degree=1, color='#EDB120',
                       model_type='ridge', alpha=1.0)
        assert len(self.ax.lines) > 0

    def test_lasso_regression(self):
        np.random.seed(42)
        x = np.arange(50, dtype=float)
        y = 3 * x + 5 + np.random.randn(50) * 0.5
        add_regression(self.ax, x, y, degree=1, color='#7E2F8E',
                       model_type='lasso', alpha=0.1)
        assert len(self.ax.lines) > 0

    def test_elastic_net_regression(self):
        np.random.seed(42)
        x = np.arange(50, dtype=float)
        y = 3 * x + 5 + np.random.randn(50) * 0.5
        add_regression(self.ax, x, y, degree=2, color='#77AC30',
                       model_type='elastic_net', alpha=0.1, l1_ratio=0.5)
        assert len(self.ax.lines) > 0

    def test_random_forest_regression(self):
        np.random.seed(42)
        x = np.arange(50, dtype=float)
        y = 3 * x + 5 + np.random.randn(50) * 0.5
        add_regression(self.ax, x, y, degree=1, color='#4DBEEE',
                       model_type='random_forest',
                       rf_params={'n_estimators': 10, 'random_state': 42})
        assert len(self.ax.lines) > 0

    def test_with_outlier_removal(self):
        np.random.seed(42)
        x = np.arange(50, dtype=float)
        y = 2 * x + 1 + np.random.randn(50) * 0.5
        # Add extreme outliers
        y[10] = 1000
        y[20] = -500
        add_regression(self.ax, x, y, degree=1, color='#A2142F',
                       remove_outliers=True)
        assert len(self.ax.lines) > 0

    def test_with_pandas_series(self):
        np.random.seed(42)
        x = pd.Series(np.arange(50, dtype=float))
        y = pd.Series(2 * np.arange(50, dtype=float) + np.random.randn(50) * 0.5)
        add_regression(self.ax, x, y, degree=1, color='#0072BD')
        assert len(self.ax.lines) > 0

    def test_with_datetime_index(self):
        np.random.seed(42)
        dates = pd.date_range('2024-01-01', periods=50, freq='D')
        x = pd.DatetimeIndex(dates)
        y = np.arange(50, dtype=float) + np.random.randn(50) * 0.5
        add_regression(self.ax, x, y, degree=1, color='#2563eb')
        assert len(self.ax.lines) > 0

    def test_insufficient_data_no_crash(self):
        # Only 1 data point - should silently return
        x = np.array([1.0])
        y = np.array([2.0])
        add_regression(self.ax, x, y, degree=1, color='#0072BD')
        # No lines added since len < 2
        assert len(self.ax.lines) == 0

    def test_no_ci(self):
        np.random.seed(42)
        x = np.arange(50, dtype=float)
        y = 2 * x + 1 + np.random.randn(50) * 0.5
        add_regression(self.ax, x, y, degree=1, color='#0072BD', show_ci=False)
        # Still adds the regression line
        assert len(self.ax.lines) > 0

    def test_with_nan_values(self):
        np.random.seed(42)
        x = np.arange(50, dtype=float)
        y = 2 * x + 1 + np.random.randn(50) * 0.5
        y[5] = np.nan
        y[15] = np.nan
        x[25] = np.nan
        add_regression(self.ax, x, y, degree=1, color='#0072BD')
        assert len(self.ax.lines) > 0
