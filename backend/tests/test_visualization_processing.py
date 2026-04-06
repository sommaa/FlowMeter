"""Tests for app/services/visualization/processing.py - compute_global_variables."""

import pytest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pandas as pd
import numpy as np

from app.models.schemas import GlobalVariable
from app.services.visualization.processing import compute_global_variables


@pytest.fixture
def simple_df():
    """Simple numeric DataFrame."""
    return pd.DataFrame({
        "A": [1.0, 2.0, 3.0, 4.0, 5.0],
        "B": [10.0, 20.0, 30.0, 40.0, 50.0],
    })


@pytest.fixture
def df_with_strings():
    """DataFrame with string columns that look numeric."""
    return pd.DataFrame({
        "A": ["1", "2", "3", "4", "5"],
        "B": [10.0, 20.0, 30.0, 40.0, 50.0],
    })


class TestComputeGlobalVariablesEmpty:
    """When no global variables are given, return the original DataFrame."""

    def test_empty_list_returns_same_data(self, simple_df):
        result = compute_global_variables(simple_df, [])
        pd.testing.assert_frame_equal(result, simple_df)

    def test_none_like_empty(self, simple_df):
        # empty list should be handled
        result = compute_global_variables(simple_df, [])
        assert list(result.columns) == list(simple_df.columns)


class TestComputeGlobalVariablesSimple:
    """Simple formula evaluation."""

    def test_add_columns(self, simple_df):
        gv = GlobalVariable(name="Sum", formula="col['A'] + col['B']")
        result = compute_global_variables(simple_df, [gv])
        assert "Sum" in result.columns
        expected = [11.0, 22.0, 33.0, 44.0, 55.0]
        assert result["Sum"].tolist() == expected

    def test_scalar_broadcast(self, simple_df):
        gv = GlobalVariable(name="Const", formula="42")
        result = compute_global_variables(simple_df, [gv])
        assert "Const" in result.columns
        assert all(result["Const"] == 42)

    def test_numpy_in_formula(self, simple_df):
        gv = GlobalVariable(name="LogA", formula="np.log(col['A'])")
        result = compute_global_variables(simple_df, [gv])
        assert "LogA" in result.columns
        np.testing.assert_allclose(result["LogA"].values, np.log([1, 2, 3, 4, 5]))

    def test_multiply_columns(self, simple_df):
        gv = GlobalVariable(name="Product", formula="col['A'] * col['B']")
        result = compute_global_variables(simple_df, [gv])
        expected = [10.0, 40.0, 90.0, 160.0, 250.0]
        assert result["Product"].tolist() == expected


class TestComputeGlobalVariablesChaining:
    """Global variables can reference previously computed ones."""

    def test_chain_two_variables(self, simple_df):
        gv1 = GlobalVariable(name="Sum", formula="col['A'] + col['B']")
        gv2 = GlobalVariable(name="SumDouble", formula="col['Sum'] * 2")
        result = compute_global_variables(simple_df, [gv1, gv2])
        assert "SumDouble" in result.columns
        expected = [22.0, 44.0, 66.0, 88.0, 110.0]
        assert result["SumDouble"].tolist() == expected


class TestComputeGlobalVariablesStringCoercion:
    """String/object columns are auto-coerced to numeric before formula eval."""

    def test_object_dtype_column_coerced(self):
        """Object-dtype columns holding numeric strings should be coerced.

        Use numpy to build a truly object-dtype Series, because modern
        pandas may infer StringDtype from Python string lists.
        """
        arr = np.array(["1", "2", "3", "4", "5"], dtype=object)
        series_a = pd.Series(arr, name="A")
        df = pd.DataFrame({"A": series_a, "B": [10.0, 20.0, 30.0, 40.0, 50.0]})
        # If pandas still infers StringDtype, skip the test gracefully
        if df["A"].dtype != np.dtype("object"):
            pytest.skip("Pandas version infers StringDtype; coercion path not reachable")
        gv = GlobalVariable(name="Sum", formula="col['A'] + col['B']")
        result = compute_global_variables(df, [gv])
        assert "Sum" in result.columns
        expected = [11.0, 22.0, 33.0, 44.0, 55.0]
        assert result["Sum"].tolist() == expected


class TestComputeGlobalVariablesIndexAccess:
    """The DataFrame index is available as 'Index' in formulas."""

    def test_index_column_available(self, simple_df):
        gv = GlobalVariable(name="Idx", formula="col['Index']")
        result = compute_global_variables(simple_df, [gv])
        assert "Idx" in result.columns
        assert result["Idx"].tolist() == list(simple_df.index)


class TestComputeGlobalVariablesDoesNotMutate:
    """compute_global_variables should not modify the original DataFrame."""

    def test_original_unchanged(self, simple_df):
        original_cols = list(simple_df.columns)
        gv = GlobalVariable(name="New", formula="col['A'] * 100")
        compute_global_variables(simple_df, [gv])
        assert list(simple_df.columns) == original_cols


class TestComputeGlobalVariablesErrors:
    """Invalid formulas should raise ValueError."""

    def test_bad_formula_raises(self, simple_df):
        gv = GlobalVariable(name="Bad", formula="col['NONEXISTENT'] + 1")
        with pytest.raises(ValueError, match="Error computing global variable"):
            compute_global_variables(simple_df, [gv])

    def test_syntax_error_raises(self, simple_df):
        gv = GlobalVariable(name="Bad", formula="((((")
        with pytest.raises(ValueError, match="Error computing global variable"):
            compute_global_variables(simple_df, [gv])
