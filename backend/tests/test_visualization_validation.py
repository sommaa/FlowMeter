"""Tests for app/services/visualization/validation.py - validate_config function."""

import pytest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.models.schemas import (
    VisualizationConfig,
    VisualizationType,
    AxisConfig,
    RegressionConfig,
    FormulaConfig,
)
from app.services.visualization.validation import validate_config


def _make_config(**kwargs):
    """Helper to build a VisualizationConfig with sensible defaults."""
    defaults = dict(id="test", title="Test Chart")
    defaults.update(kwargs)
    return VisualizationConfig(**defaults)


class TestValidateConfigBasic:
    """Basic validation: title, errors/warnings structure."""

    def test_valid_config_returns_valid_true(self):
        config = _make_config(
            axis=AxisConfig(x_axis="Index", y_axis=["Col1"]),
        )
        result = validate_config(config)
        assert result["valid"] is True
        assert result["errors"] == []

    def test_empty_title_gives_warning(self):
        config = _make_config(title="")
        result = validate_config(config)
        assert "Title is empty" in result["warnings"]

    def test_nonempty_title_no_warning(self):
        config = _make_config(title="Good Title")
        result = validate_config(config)
        assert result["warnings"] == []

    def test_result_always_has_required_keys(self):
        config = _make_config()
        result = validate_config(config)
        assert "valid" in result
        assert "errors" in result
        assert "warnings" in result


class TestValidateConfigYAxis:
    """Y-axis requirement for line/scatter/bar/area viz types."""

    @pytest.mark.parametrize("viz_type", [
        VisualizationType.AREA,
    ])
    def test_missing_y_axis_for_plot_types(self, viz_type):
        """Area type requires y_axis (check is for line/scatter/bar/area)."""
        config = _make_config(
            viz_type=viz_type,
            axis=AxisConfig(x_axis="Index", y_axis=[]),
        )
        result = validate_config(config)
        assert "Y-axis must be specified" in result["errors"]
        assert result["valid"] is False

    def test_universal_missing_y_axis_no_error(self):
        """'universal' is not in the explicit ['line','scatter','bar','area'] check list."""
        config = _make_config(
            viz_type=VisualizationType.UNIVERSAL,
            axis=AxisConfig(x_axis="Index", y_axis=[]),
        )
        result = validate_config(config)
        assert "Y-axis must be specified" not in result["errors"]

    def test_present_y_axis_no_error(self):
        config = _make_config(
            viz_type=VisualizationType.UNIVERSAL,
            axis=AxisConfig(x_axis="Index", y_axis=["Col1"]),
        )
        result = validate_config(config)
        assert "Y-axis must be specified" not in result["errors"]


class TestValidateConfigPCA:
    """PCA requires at least 2 y-axis variables."""

    def test_pca_with_one_variable_errors(self):
        config = _make_config(
            viz_type=VisualizationType.PCA,
            axis=AxisConfig(y_axis=["Col1"]),
        )
        result = validate_config(config)
        assert "PCA requires at least 2 variables" in result["errors"]

    def test_pca_with_two_variables_ok(self):
        config = _make_config(
            viz_type=VisualizationType.PCA,
            axis=AxisConfig(y_axis=["Col1", "Col2"]),
        )
        result = validate_config(config)
        assert "PCA requires at least 2 variables" not in result["errors"]

    def test_pca_with_three_variables_ok(self):
        config = _make_config(
            viz_type=VisualizationType.PCA,
            axis=AxisConfig(y_axis=["A", "B", "C"]),
        )
        result = validate_config(config)
        assert "PCA requires at least 2 variables" not in result["errors"]


class TestValidateConfigFormula:
    """Formula viz type requires formula input."""

    def test_formula_without_input_errors(self):
        config = _make_config(
            viz_type=VisualizationType.FORMULA,
            formula=FormulaConfig(input=""),
        )
        result = validate_config(config)
        assert "Formula input is required" in result["errors"]

    def test_formula_with_input_ok(self):
        config = _make_config(
            viz_type=VisualizationType.FORMULA,
            formula=FormulaConfig(input="result = col['A'] + col['B']"),
        )
        result = validate_config(config)
        assert "Formula input is required" not in result["errors"]


class TestValidateConfigCustomXFormula:
    """Custom X-axis formula validation."""

    def test_custom_x_formula_missing_errors(self):
        config = _make_config(
            axis=AxisConfig(x_axis="Custom Formula", y_axis=["Col1"]),
            formula=FormulaConfig(x_formula=""),
        )
        result = validate_config(config)
        assert "X-axis formula is required when using custom formula" in result["errors"]

    def test_custom_x_formula_present_ok(self):
        config = _make_config(
            axis=AxisConfig(x_axis="Custom Formula", y_axis=["Col1"]),
            formula=FormulaConfig(x_formula="col['A'] * 2"),
        )
        result = validate_config(config)
        assert "X-axis formula is required when using custom formula" not in result["errors"]


class TestValidateConfigRegression:
    """Regression degree and alpha bounds."""

    def test_degree_below_1_errors(self):
        config = _make_config(
            regression=RegressionConfig(degree=0),
        )
        result = validate_config(config)
        assert "Regression degree must be between 1 and 10" in result["errors"]

    def test_degree_above_10_errors(self):
        config = _make_config(
            regression=RegressionConfig(degree=11),
        )
        result = validate_config(config)
        assert "Regression degree must be between 1 and 10" in result["errors"]

    def test_degree_in_range_ok(self):
        config = _make_config(
            regression=RegressionConfig(degree=3),
        )
        result = validate_config(config)
        assert "Regression degree must be between 1 and 10" not in result["errors"]

    def test_alpha_negative_errors(self):
        config = _make_config(
            regression=RegressionConfig(alpha=-0.1),
        )
        result = validate_config(config)
        assert "Alpha must be between 0 and 1" in result["errors"]

    def test_alpha_above_1_errors(self):
        config = _make_config(
            regression=RegressionConfig(alpha=1.5),
        )
        result = validate_config(config)
        assert "Alpha must be between 0 and 1" in result["errors"]

    def test_alpha_in_range_ok(self):
        config = _make_config(
            regression=RegressionConfig(alpha=0.5),
        )
        result = validate_config(config)
        assert "Alpha must be between 0 and 1" not in result["errors"]


class TestValidateConfigMultipleErrors:
    """Multiple errors can be reported at once."""

    def test_multiple_errors(self):
        config = _make_config(
            title="",
            viz_type=VisualizationType.PCA,
            axis=AxisConfig(x_axis="Custom Formula", y_axis=["Col1"]),
            formula=FormulaConfig(x_formula=""),
            regression=RegressionConfig(degree=0, alpha=-1),
        )
        result = validate_config(config)
        assert result["valid"] is False
        assert len(result["errors"]) >= 3  # PCA, x-formula, degree, alpha
        assert len(result["warnings"]) >= 1  # empty title
