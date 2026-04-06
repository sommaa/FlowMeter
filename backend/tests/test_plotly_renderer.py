"""Tests for backend/app/services/export_helpers/plotly_renderer.py."""

import pytest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.export_helpers.plotly_renderer import (
    PlotlyRenderer,
    COLORS,
    COLORSCALE_MAPPING,
    prewarm_kaleido,
)


class TestHexToRgba:
    """Tests for PlotlyRenderer._hex_to_rgba."""

    def test_standard_hex(self):
        result = PlotlyRenderer._hex_to_rgba("#ff0000", 0.5)
        assert result == "(255, 0, 0, 0.5)"

    def test_short_hex(self):
        result = PlotlyRenderer._hex_to_rgba("#f00", 1.0)
        assert result == "(255, 0, 0, 1.0)"

    def test_hex_without_hash(self):
        result = PlotlyRenderer._hex_to_rgba("0072BD", 0.8)
        assert "(0, 114, 189, 0.8)" == result

    def test_rgb_string(self):
        result = PlotlyRenderer._hex_to_rgba("rgb(128, 64, 32)", 0.5)
        assert result == "(128, 64, 32, 0.5)"

    def test_rgba_string(self):
        result = PlotlyRenderer._hex_to_rgba("rgba(100, 200, 50, 0.3)", 0.7)
        assert result == "(100, 200, 50, 0.7)"

    def test_empty_string(self):
        result = PlotlyRenderer._hex_to_rgba("", 0.5)
        assert result == "(0, 0, 0, 0.5)"

    def test_none(self):
        result = PlotlyRenderer._hex_to_rgba(None, 0.5)
        assert result == "(0, 0, 0, 0.5)"

    def test_invalid_hex(self):
        result = PlotlyRenderer._hex_to_rgba("#ZZZZZZ", 0.5)
        assert result == "(0, 0, 0, 0.5)"


class TestConstants:
    """Tests for module constants."""

    def test_colors_not_empty(self):
        assert len(COLORS) > 0

    def test_colors_are_hex(self):
        for c in COLORS:
            assert c.startswith("#")

    def test_colorscale_mapping_has_rdbu(self):
        assert "RdBu" in COLORSCALE_MAPPING

    def test_colorscale_mapping_has_viridis(self):
        assert "Viridis" in COLORSCALE_MAPPING


class TestFormatConfigDetails:
    """Tests for PlotlyRenderer.format_config_details."""

    def test_universal_config(self):
        from app.models.schemas import VisualizationConfig, AxisConfig
        config = VisualizationConfig(
            id="t1", title="Test", viz_type="universal",
            axis=AxisConfig(x_axis="time", y_axis=["temp", "pressure"]),
        )
        result = PlotlyRenderer.format_config_details(config)
        assert "universal" in result
        assert "time" in result
        assert "temp" in result

    def test_regression_config(self):
        from app.models.schemas import VisualizationConfig, AxisConfig, RegressionConfig
        config = VisualizationConfig(
            id="t2", title="Test", viz_type="regression",
            axis=AxisConfig(x_axis="x", y_axis=["target"]),
            regression=RegressionConfig(predictors=["x1", "x2"]),
        )
        result = PlotlyRenderer.format_config_details(config)
        assert "regression" in result
        assert "target" in result
        assert "x1" in result

    def test_pca_config(self):
        from app.models.schemas import VisualizationConfig, AxisConfig, PCAConfig
        config = VisualizationConfig(
            id="t3", title="Test", viz_type="pca",
            axis=AxisConfig(x_axis="x", y_axis=["a", "b", "c"]),
            pca=PCAConfig(components=3),
        )
        result = PlotlyRenderer.format_config_details(config)
        assert "pca" in result
        assert "a" in result

    def test_correlation_config(self):
        from app.models.schemas import VisualizationConfig, AxisConfig
        config = VisualizationConfig(
            id="t4", title="Test", viz_type="correlation",
            axis=AxisConfig(x_axis="", y_axis=["a", "b", "c"]),
        )
        result = PlotlyRenderer.format_config_details(config)
        assert "correlation" in result

    def test_formula_config(self):
        from app.models.schemas import VisualizationConfig, AxisConfig, FormulaConfig as FC
        config = VisualizationConfig(
            id="t5", title="Test", viz_type="formula",
            axis=AxisConfig(x_axis="x", y_axis=[]),
            formula=FC(input="result = col['a'] + 1"),
        )
        result = PlotlyRenderer.format_config_details(config)
        assert "formula" in result

    def test_truncated_y_axes(self):
        from app.models.schemas import VisualizationConfig, AxisConfig
        config = VisualizationConfig(
            id="t6", title="Test", viz_type="universal",
            axis=AxisConfig(x_axis="x", y_axis=["a", "b", "c", "d", "e"]),
        )
        result = PlotlyRenderer.format_config_details(config)
        assert "..." in result
