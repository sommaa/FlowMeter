"""Tests for the KPI / Summary visualization handler."""

import os
import sys
from unittest.mock import patch

import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.models.schemas import (
    KPIConfig,
    KPIMetric,
    VisualizationConfig,
    VisualizationType,
)
from app.services.visualization.kpi import generate_kpi_data
from app.services.visualization.validation import validate_config


def _df():
    idx = pd.date_range("2024-01-01", periods=5, freq="h")
    return pd.DataFrame(
        {"power": [10.0, 20.0, 30.0, 40.0, 50.0], "fuel": [1.0, 2.0, 3.0, 4.0, 5.0]},
        index=idx,
    )


def _cfg(metrics, columns_per_row=3):
    return VisualizationConfig(
        id="kpi-test",
        title="KPI Test",
        viz_type=VisualizationType.KPI,
        kpi=KPIConfig(metrics=metrics, columns_per_row=columns_per_row),
    )


class TestBuiltinOps:
    @pytest.mark.parametrize(
        "operation,expected",
        [
            ("sum", 150.0),
            ("avg", 30.0),
            ("min", 10.0),
            ("max", 50.0),
            ("median", 30.0),
            ("count", 5.0),
            ("first", 10.0),
            ("last", 50.0),
        ],
    )
    def test_each_operation(self, operation, expected):
        cfg = _cfg([KPIMetric(id="m1", label="L", operation=operation, column="power")])
        result = generate_kpi_data(_df(), cfg)
        assert result.kpi is not None
        assert result.kpi.values[0].error is None
        assert result.kpi.values[0].value == pytest.approx(expected)

    def test_std(self):
        cfg = _cfg([KPIMetric(id="m1", label="Std", operation="std", column="power")])
        result = generate_kpi_data(_df(), cfg)
        assert result.kpi.values[0].error is None
        # ddof=1 stdev of 10..50 step 10
        assert result.kpi.values[0].value == pytest.approx(15.811388, rel=1e-4)


class TestFormulaOp:
    def test_formula_uses_filtered_dataframe(self):
        cfg = _cfg([KPIMetric(
            id="m1", label="Eff", operation="formula",
            formula="col['power'].sum() / col['fuel'].sum()",
        )])
        result = generate_kpi_data(_df(), cfg)
        assert result.kpi.values[0].error is None
        assert result.kpi.values[0].value == pytest.approx(150.0 / 15.0)

    def test_formula_can_use_numpy(self):
        cfg = _cfg([KPIMetric(
            id="m1", label="LogMax", operation="formula",
            formula="float(np.log10(col['power'].max()))",
        )])
        result = generate_kpi_data(_df(), cfg)
        assert result.kpi.values[0].value == pytest.approx(1.69897, rel=1e-4)

    def test_formula_unsafe_call_fails_per_metric(self):
        cfg = _cfg([KPIMetric(
            id="m1", label="bad", operation="formula",
            formula="__import__('os').listdir('/')",
        )])
        result = generate_kpi_data(_df(), cfg)
        assert result.kpi.values[0].value is None
        assert result.kpi.values[0].error is not None


class TestErrorIsolation:
    def test_missing_column_isolates_to_one_metric(self):
        cfg = _cfg([
            KPIMetric(id="ok", label="ok", operation="sum", column="power"),
            KPIMetric(id="bad", label="bad", operation="sum", column="missing"),
        ])
        result = generate_kpi_data(_df(), cfg)
        ok, bad = result.kpi.values
        assert ok.error is None and ok.value == pytest.approx(150.0)
        assert bad.error is not None and bad.value is None
        assert "missing" in bad.error

    def test_empty_metrics_returns_empty_payload(self):
        cfg = _cfg([])
        result = generate_kpi_data(_df(), cfg)
        assert result.kpi is not None
        assert result.kpi.values == []
        assert result.kpi.sample_count == 5


class TestFormatting:
    def test_decimals_and_unit_in_formatted_string(self):
        cfg = _cfg([KPIMetric(
            id="m1", label="Avg Power", operation="avg", column="power",
            unit="kW", decimals=1,
        )])
        result = generate_kpi_data(_df(), cfg)
        assert result.kpi.values[0].formatted == "30.0 kW"

    def test_thousands_separator(self):
        df = pd.DataFrame({"x": [1_234_567.0]})
        cfg = _cfg([KPIMetric(id="m1", label="Big", operation="sum", column="x", decimals=0)])
        result = generate_kpi_data(df, cfg)
        assert "1,234,567" in result.kpi.values[0].formatted


class TestSampleCount:
    def test_sample_count_reflects_filtered_rows(self):
        df = _df()
        # Simulate the filtering already done by VisualizationService:
        df_filtered = df.iloc[:3]
        cfg = _cfg([KPIMetric(id="m1", label="Sum", operation="sum", column="power")])
        result = generate_kpi_data(df_filtered, cfg)
        assert result.kpi.sample_count == 3
        assert result.kpi.values[0].value == pytest.approx(60.0)


class TestValidation:
    def test_validate_kpi_requires_at_least_one_metric(self):
        cfg = _cfg([])
        out = validate_config(cfg)
        assert out["valid"] is False
        assert any("at least one metric" in e for e in out["errors"])

    def test_validate_kpi_formula_requires_formula(self):
        cfg = _cfg([KPIMetric(id="m1", label="x", operation="formula")])
        out = validate_config(cfg)
        assert out["valid"] is False
        assert any("formula expression is required" in e for e in out["errors"])

    def test_validate_kpi_non_formula_requires_column(self):
        cfg = _cfg([KPIMetric(id="m1", label="x", operation="sum")])
        out = validate_config(cfg)
        assert out["valid"] is False
        assert any("column is required" in e for e in out["errors"])

    def test_validate_kpi_happy_path(self):
        cfg = _cfg([KPIMetric(id="m1", label="x", operation="sum", column="power")])
        out = validate_config(cfg)
        assert out["valid"] is True


class TestColumnsPerRowClamp:
    def test_clamps_high_value(self):
        cfg = _cfg([KPIMetric(id="m1", label="x", operation="sum", column="power")], columns_per_row=99)
        result = generate_kpi_data(_df(), cfg)
        assert result.kpi.columns_per_row == 6

    def test_clamps_low_value(self):
        cfg = _cfg([KPIMetric(id="m1", label="x", operation="sum", column="power")], columns_per_row=0)
        result = generate_kpi_data(_df(), cfg)
        assert result.kpi.columns_per_row == 1
