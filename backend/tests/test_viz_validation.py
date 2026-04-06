"""Tests for backend/app/services/visualization/validation.py."""

import pytest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.visualization.validation import validate_config
from app.models.schemas import VisualizationConfig, AxisConfig, RegressionConfig, FormulaConfig


class TestValidateConfig:
    """Tests for the validate_config function."""

    def test_valid_config(self):
        config = VisualizationConfig(
            id="v1", title="Test", viz_type="universal",
            axis=AxisConfig(y_axis=["temp"]),
        )
        result = validate_config(config)
        assert result["valid"] is True
        assert result["errors"] == []

    def test_empty_title_warning(self):
        config = VisualizationConfig(id="v1", title="", viz_type="universal")
        result = validate_config(config)
        assert any("Title" in w for w in result["warnings"])

    def test_pca_needs_two_vars(self):
        config = VisualizationConfig(
            id="v1", title="PCA", viz_type="pca",
            axis=AxisConfig(y_axis=["x"]),
        )
        result = validate_config(config)
        assert result["valid"] is False
        assert any("PCA" in e for e in result["errors"])

    def test_formula_needs_input(self):
        config = VisualizationConfig(
            id="v1", title="Formula", viz_type="formula",
            formula=FormulaConfig(input=None),
        )
        result = validate_config(config)
        assert result["valid"] is False
        assert any("Formula" in e for e in result["errors"])

    def test_regression_degree_bounds(self):
        config = VisualizationConfig(
            id="v1", title="Reg", viz_type="regression",
            regression=RegressionConfig(degree=15),
        )
        result = validate_config(config)
        assert any("degree" in e.lower() for e in result["errors"])

    def test_regression_alpha_bounds(self):
        config = VisualizationConfig(
            id="v1", title="Reg", viz_type="regression",
            regression=RegressionConfig(alpha=5.0),
        )
        result = validate_config(config)
        assert any("alpha" in e.lower() or "Alpha" in e for e in result["errors"])
