"""Tests for backend/app/models/schemas.py - Pydantic models."""

import pytest
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.models.schemas import (
    VisualizationType,
    PlotType,
    SeriesRenderType,
    AxisConfig,
    StyleConfig,
    RegressionConfig,
    VisualizationConfig,
    APIResponse,
    SaveModelRequest,
    PlotDataRequest,
    ReconciliationConfig,
    ReconciliationRequest,
    TemplateConfig,
    CleaningConfig,
    FilterRule,
    GlobalVariable,
    DatasetInfo,
    DataStatistics,
    PlotDataSeries,
    ExportSettings,
    Threshold,
    FFTConfig,
    RootCauseConfig,
    SavedModelInfo,
)


class TestEnums:
    """Test enum values and string matching."""

    def test_visualization_type_values(self):
        assert VisualizationType.UNIVERSAL == "universal"
        assert VisualizationType.REGRESSION == "regression"
        assert VisualizationType.FFT == "fft"
        assert VisualizationType.ROOT_CAUSE == "root_cause"

    def test_plot_type_values(self):
        assert PlotType.LINE == "Line"
        assert PlotType.SCATTER == "Scatter"
        assert PlotType.LINE_SCATTER == "Line + Scatter"

    def test_series_render_type(self):
        assert SeriesRenderType.DATA == "data"
        assert SeriesRenderType.REGRESSION == "regression"
        assert SeriesRenderType.CI_LOWER == "ci_lower"


class TestAxisConfig:
    """Test AxisConfig defaults and validation."""

    def test_defaults(self):
        config = AxisConfig()
        assert config.x_axis == "Index"
        assert config.y_axis == []
        assert config.x_axis_scale == "linear"
        assert config.y_axis_scale == "linear"
        assert config.enable_x_axis_range is False

    def test_custom_values(self):
        config = AxisConfig(x_axis="Date", y_axis=["Temp", "Pressure"])
        assert config.x_axis == "Date"
        assert config.y_axis == ["Temp", "Pressure"]


class TestVisualizationConfig:
    """Test VisualizationConfig model."""

    def test_minimal_config(self):
        config = VisualizationConfig(id="v1")
        assert config.id == "v1"
        assert config.title == "Untitled Visualization"
        assert config.viz_type == VisualizationType.UNIVERSAL

    def test_full_config(self):
        config = VisualizationConfig(
            id="v1",
            title="Temperature Trend",
            viz_type=VisualizationType.REGRESSION,
            axis=AxisConfig(x_axis="Date", y_axis=["Temp"]),
            regression=RegressionConfig(model_type="linear", predictors=["x"]),
        )
        assert config.title == "Temperature Trend"
        assert config.viz_type == VisualizationType.REGRESSION
        assert config.regression.model_type == "linear"

    def test_viz_type_from_string(self):
        config = VisualizationConfig(id="v1", viz_type="regression")
        assert config.viz_type == VisualizationType.REGRESSION


class TestRegressionConfig:
    """Test RegressionConfig model."""

    def test_defaults(self):
        config = RegressionConfig()
        assert config.added is False
        assert config.degree == 1
        assert config.model_type == "linear"
        assert config.show_confidence_interval is True
        assert config.remove_outliers is False

    def test_custom_formula(self):
        config = RegressionConfig(
            model_type="custom",
            custom_formula="a * x + b",
            custom_params="a,b",
            custom_initial_guesses="1.0,0.0",
        )
        assert config.custom_formula == "a * x + b"
        assert config.custom_params == "a,b"


class TestAPIResponse:
    """Test APIResponse model."""

    def test_success_response(self):
        resp = APIResponse(success=True, data={"key": "value"})
        assert resp.success is True
        assert resp.data == {"key": "value"}

    def test_error_response(self):
        resp = APIResponse(success=False, message="Something went wrong")
        assert resp.success is False
        assert resp.message == "Something went wrong"
        assert resp.data is None


class TestFilterRule:
    """Test FilterRule model."""

    def test_basic(self):
        rule = FilterRule(column="temp", operator=">", value="100")
        assert rule.column == "temp"
        assert rule.action == "remove"  # default

    def test_keep_action(self):
        rule = FilterRule(column="status", operator="contains", value="ok", action="keep")
        assert rule.action == "keep"


class TestGlobalVariable:
    """Test GlobalVariable model."""

    def test_basic(self):
        gv = GlobalVariable(name="efficiency", formula="output / input * 100")
        assert gv.name == "efficiency"
        assert gv.description == ""


class TestCleaningConfig:
    """Test CleaningConfig model."""

    def test_defaults(self):
        config = CleaningConfig()
        assert config.header_row == 0
        assert config.nan_strategy == "none"
        assert config.replacements == []
        assert config.filters == []

    def test_with_filters(self):
        config = CleaningConfig(
            filters=[FilterRule(column="x", operator=">", value="100")]
        )
        assert len(config.filters) == 1


class TestTemplateConfig:
    """Test TemplateConfig model."""

    def test_defaults(self):
        config = TemplateConfig()
        assert config.version == "1.0"
        assert config.plant_name == "Production_Plant"
        assert config.visualizations == []
        assert config.global_variables == []

    def test_with_visualizations(self):
        viz = VisualizationConfig(id="v1", title="Test")
        config = TemplateConfig(visualizations=[viz])
        assert len(config.visualizations) == 1


class TestExportSettings:
    """Test ExportSettings model."""

    def test_defaults(self):
        settings = ExportSettings()
        assert settings.author_name == "System User"
        assert settings.primary_color == "#FFD400"
        assert settings.secondary_color == "#005EB8"
