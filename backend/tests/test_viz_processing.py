"""Tests for backend/app/services/visualization/processing.py."""

import pytest
import os
import sys
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.visualization.processing import compute_global_variables, COLORS
from app.models.schemas import GlobalVariable


class TestComputeGlobalVariables:
    """Tests for compute_global_variables function."""

    def test_empty_list(self):
        df = pd.DataFrame({"x": [1, 2, 3]})
        result = compute_global_variables(df, [])
        pd.testing.assert_frame_equal(result, df)

    def test_none_list(self):
        df = pd.DataFrame({"x": [1, 2, 3]})
        result = compute_global_variables(df, None)
        pd.testing.assert_frame_equal(result, df)

    def test_simple_formula(self):
        df = pd.DataFrame({"x": [1.0, 2.0, 3.0]})
        gvs = [GlobalVariable(name="double_x", formula="col['x'] * 2")]
        result = compute_global_variables(df, gvs)
        assert "double_x" in result.columns
        assert list(result["double_x"]) == [2.0, 4.0, 6.0]

    def test_formula_with_numpy(self):
        df = pd.DataFrame({"x": [1.0, 4.0, 9.0]})
        gvs = [GlobalVariable(name="sqrt_x", formula="np.sqrt(col['x'])")]
        result = compute_global_variables(df, gvs)
        assert "sqrt_x" in result.columns
        np.testing.assert_array_almost_equal(result["sqrt_x"], [1.0, 2.0, 3.0])

    def test_multiple_formulas(self):
        df = pd.DataFrame({"a": [1.0, 2.0], "b": [3.0, 4.0]})
        gvs = [
            GlobalVariable(name="sum", formula="col['a'] + col['b']"),
            GlobalVariable(name="diff", formula="col['a'] - col['b']"),
        ]
        result = compute_global_variables(df, gvs)
        assert "sum" in result.columns
        assert "diff" in result.columns
        assert list(result["sum"]) == [4.0, 6.0]
        assert list(result["diff"]) == [-2.0, -2.0]

    def test_does_not_modify_original(self):
        df = pd.DataFrame({"x": [1.0, 2.0]})
        original_cols = list(df.columns)
        gvs = [GlobalVariable(name="y", formula="col['x'] + 1")]
        compute_global_variables(df, gvs)
        assert list(df.columns) == original_cols


class TestColors:
    """Tests for default color palette."""

    def test_colors_not_empty(self):
        assert len(COLORS) > 0

    def test_colors_are_hex(self):
        for c in COLORS:
            assert c.startswith("#")
