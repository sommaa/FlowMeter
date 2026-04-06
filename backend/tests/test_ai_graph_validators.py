"""Tests for app/services/ai_graph/validators.py - validation functions."""

import pytest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.ai_graph.schemas import (
    VisualizationSuggestion,
    AdditionalConfig,
    FormulaConfig,
    ColumnMetadata,
)
from app.services.ai_graph.validators import (
    validate_columns_exist,
    validate_column_types,
    validate_viz_type_requirements,
    validate_professional_output,
    validate_suggestion_complete,
    get_column_suggestions,
)


# ============= Helper =============

def _make_suggestion(**kwargs):
    """Build a VisualizationSuggestion with sensible defaults."""
    defaults = dict(
        title="Temperature Over Time",
        description="Shows temperature trend across the measurement period",
        viz_type="universal",
        x_axis="Time",
        y_axes=["Temp"],
        confidence=0.9,
        reasoning="This visualization reveals the thermal behavior of the system over the observation window.",
    )
    defaults.update(kwargs)
    return VisualizationSuggestion(**defaults)


VALID_COLUMNS = {"Time", "Temp", "Pressure", "Flow", "Humidity"}


# ============= validate_columns_exist =============

class TestValidateColumnsExist:

    def test_all_columns_valid(self):
        s = _make_suggestion(x_axis="Time", y_axes=["Temp", "Pressure"])
        result = validate_columns_exist(s, VALID_COLUMNS)
        assert result.is_valid is True
        assert result.errors == []

    def test_invalid_x_axis(self):
        s = _make_suggestion(x_axis="NonExistent", y_axes=["Temp"])
        result = validate_columns_exist(s, VALID_COLUMNS)
        assert result.is_valid is False
        assert any("x_axis" in e.field for e in result.errors)

    def test_invalid_y_axis(self):
        s = _make_suggestion(x_axis="Time", y_axes=["Temp", "BadCol"])
        result = validate_columns_exist(s, VALID_COLUMNS)
        assert result.is_valid is False
        assert any("y_axes" in e.field for e in result.errors)

    def test_fuzzy_match_suggestion(self):
        s = _make_suggestion(x_axis="Tme", y_axes=["Temp"])
        result = validate_columns_exist(s, VALID_COLUMNS)
        assert result.is_valid is False
        # Should suggest "Time"
        assert any("Time" in e.suggestion for e in result.errors)

    def test_correlation_allows_empty_x_axis(self):
        s = _make_suggestion(
            viz_type="correlation",
            x_axis="",
            y_axes=["Temp", "Pressure", "Flow"],
        )
        result = validate_columns_exist(s, VALID_COLUMNS)
        assert result.is_valid is True

    def test_formula_skips_y_axes_validation(self):
        s = _make_suggestion(
            viz_type="formula",
            x_axis="Time",
            y_axes=[],
            additional_config=AdditionalConfig(
                formula=FormulaConfig(input="result = col['A'] + 1")
            ),
        )
        result = validate_columns_exist(s, VALID_COLUMNS)
        assert result.is_valid is True

    def test_result_columns_allowed_in_y_axes(self):
        """Columns starting with 'result' are treated as computed."""
        s = _make_suggestion(x_axis="Time", y_axes=["result1", "resultFoo"])
        result = validate_columns_exist(s, VALID_COLUMNS)
        assert result.is_valid is True


# ============= validate_column_types =============

class TestValidateColumnTypes:

    def _make_metadata(self, **col_types):
        """Build column metadata dict. col_types maps name -> data_type."""
        return {
            name: ColumnMetadata(name=name, description=f"{name} col", data_type=dtype)
            for name, dtype in col_types.items()
        }

    def test_regression_requires_numeric(self):
        s = _make_suggestion(
            viz_type="regression",
            x_axis="Time",
            y_axes=["Temp"],
        )
        meta = self._make_metadata(Time="categorical", Temp="numeric")
        result = validate_column_types(s, meta)
        assert result.is_valid is False
        assert any("x_axis" in e.field for e in result.errors)

    def test_regression_all_numeric_ok(self):
        s = _make_suggestion(
            viz_type="regression",
            x_axis="Time",
            y_axes=["Temp"],
        )
        meta = self._make_metadata(Time="numeric", Temp="numeric")
        result = validate_column_types(s, meta)
        assert result.is_valid is True

    def test_pca_requires_numeric_y(self):
        s = _make_suggestion(
            viz_type="pca",
            x_axis="Time",
            y_axes=["Temp", "Pressure", "Flow"],
        )
        meta = self._make_metadata(
            Time="numeric", Temp="numeric", Pressure="categorical", Flow="numeric"
        )
        result = validate_column_types(s, meta)
        assert result.is_valid is False

    def test_correlation_requires_numeric_y(self):
        s = _make_suggestion(
            viz_type="correlation",
            x_axis="",
            y_axes=["Temp", "Pressure", "Flow"],
        )
        meta = self._make_metadata(Temp="numeric", Pressure="numeric", Flow="categorical")
        result = validate_column_types(s, meta)
        assert result.is_valid is False

    def test_hist_accepts_numeric_x(self):
        s = _make_suggestion(viz_type="hist", x_axis="Temp", y_axes=["Temp"])
        meta = self._make_metadata(Temp="numeric")
        result = validate_column_types(s, meta)
        assert result.is_valid is True

    def test_hist_accepts_datetime_x(self):
        s = _make_suggestion(viz_type="hist", x_axis="Time", y_axes=["Temp"])
        meta = self._make_metadata(Time="datetime", Temp="numeric")
        result = validate_column_types(s, meta)
        assert result.is_valid is True

    def test_hist_rejects_categorical_x(self):
        s = _make_suggestion(viz_type="hist", x_axis="Category", y_axes=["Temp"])
        meta = self._make_metadata(Category="categorical", Temp="numeric")
        result = validate_column_types(s, meta)
        assert result.is_valid is False

    def test_universal_no_type_check(self):
        """Universal type doesn't enforce column types."""
        s = _make_suggestion(viz_type="universal", x_axis="Cat", y_axes=["Temp"])
        meta = self._make_metadata(Cat="categorical", Temp="numeric")
        result = validate_column_types(s, meta)
        assert result.is_valid is True

    def test_missing_metadata_passes(self):
        """Columns not in metadata are silently accepted."""
        s = _make_suggestion(viz_type="regression", x_axis="Time", y_axes=["Temp"])
        meta = {}  # no metadata at all
        result = validate_column_types(s, meta)
        assert result.is_valid is True


# ============= validate_viz_type_requirements =============

class TestValidateVizTypeRequirements:

    def test_universal_with_1_y_ok(self):
        s = _make_suggestion(viz_type="universal", y_axes=["Temp"])
        result = validate_viz_type_requirements(s)
        assert result.is_valid is True

    def test_universal_with_0_y_fails(self):
        # Cannot create this via _make_suggestion due to model validator,
        # so we test the validator function directly with a patched object.
        # We need to bypass model validation for this test.
        s = _make_suggestion(viz_type="universal", y_axes=["Temp"])
        # Manually clear y_axes after creation
        object.__setattr__(s, 'y_axes', [])
        result = validate_viz_type_requirements(s)
        assert result.is_valid is False

    def test_pca_requires_3(self):
        s = _make_suggestion(viz_type="pca", y_axes=["A", "B", "C"])
        # Manually reduce
        object.__setattr__(s, 'y_axes', ["A", "B"])
        result = validate_viz_type_requirements(s)
        assert result.is_valid is False

    def test_pca_with_3_ok(self):
        s = _make_suggestion(viz_type="pca", y_axes=["A", "B", "C"])
        result = validate_viz_type_requirements(s)
        assert result.is_valid is True

    def test_correlation_requires_3(self):
        s = _make_suggestion(
            viz_type="correlation", x_axis="", y_axes=["A", "B", "C"]
        )
        object.__setattr__(s, 'y_axes', ["A", "B"])
        result = validate_viz_type_requirements(s)
        assert result.is_valid is False

    def test_formula_requires_expression(self):
        s = _make_suggestion(
            viz_type="formula",
            y_axes=[],
            additional_config=AdditionalConfig(
                formula=FormulaConfig(input="result = col['A'] + 1")
            ),
        )
        # Clear the formula
        s.additional_config.formula.input = ""
        result = validate_viz_type_requirements(s)
        assert result.is_valid is False

    def test_formula_with_expression_ok(self):
        s = _make_suggestion(
            viz_type="formula",
            y_axes=[],
            additional_config=AdditionalConfig(
                formula=FormulaConfig(input="result = col['A'] + 1")
            ),
        )
        result = validate_viz_type_requirements(s)
        assert result.is_valid is True

    def test_universal_valid_plot_type(self):
        s = _make_suggestion(viz_type="universal", plot_type="scatter")
        result = validate_viz_type_requirements(s)
        assert result.is_valid is True


# ============= validate_professional_output =============

class TestValidateProfessionalOutput:

    def test_good_suggestion_passes(self):
        s = _make_suggestion()
        result = validate_professional_output(s)
        assert result.is_valid is True

    def test_generic_title_fails(self):
        # "chart" is too generic but also too short (5 chars). Let's test with exact match.
        s = _make_suggestion(title="Chart Of Something Here")
        # The check is: title.lower() in generic_titles, so exact match only
        # "chart of something here".lower() is NOT in the list, so it passes.
        # We need exact single-word title. But min_length is 5, so "chart" is 5 chars.
        s = _make_suggestion(title="chart")
        result = validate_professional_output(s)
        assert result.is_valid is False

    def test_short_reasoning_fails(self):
        s = _make_suggestion()
        # Manually shorten reasoning below 30 chars (bypassing model validator)
        object.__setattr__(s, 'reasoning', "Too short to be useful.")
        result = validate_professional_output(s)
        assert result.is_valid is False

    def test_good_reasoning_passes(self):
        s = _make_suggestion()
        result = validate_professional_output(s)
        assert result.is_valid is True


# ============= validate_suggestion_complete =============

class TestValidateSuggestionComplete:

    def test_valid_suggestion_passes_all(self):
        s = _make_suggestion(x_axis="Time", y_axes=["Temp"])
        result = validate_suggestion_complete(s, VALID_COLUMNS)
        assert result.is_valid is True

    def test_invalid_column_fails(self):
        s = _make_suggestion(x_axis="Bad", y_axes=["Temp"])
        result = validate_suggestion_complete(s, VALID_COLUMNS)
        assert result.is_valid is False

    def test_with_column_metadata(self):
        s = _make_suggestion(
            viz_type="regression",
            x_axis="Time",
            y_axes=["Temp"],
        )
        meta = {
            "Time": ColumnMetadata(name="Time", description="t", data_type="numeric"),
            "Temp": ColumnMetadata(name="Temp", description="temp", data_type="numeric"),
        }
        result = validate_suggestion_complete(s, VALID_COLUMNS, column_metadata=meta)
        assert result.is_valid is True

    def test_type_mismatch_fails(self):
        s = _make_suggestion(
            viz_type="regression",
            x_axis="Time",
            y_axes=["Temp"],
        )
        meta = {
            "Time": ColumnMetadata(name="Time", description="t", data_type="categorical"),
            "Temp": ColumnMetadata(name="Temp", description="temp", data_type="numeric"),
        }
        result = validate_suggestion_complete(s, VALID_COLUMNS, column_metadata=meta)
        assert result.is_valid is False


# ============= get_column_suggestions =============

class TestGetColumnSuggestions:

    def test_close_match(self):
        suggestions = get_column_suggestions("Temprature", {"Temperature", "Pressure", "Flow"})
        assert "Temperature" in suggestions

    def test_no_match(self):
        suggestions = get_column_suggestions("XYZABC", {"Temperature", "Pressure"})
        assert suggestions == []

    def test_multiple_matches(self):
        cols = {"temp_inlet", "temp_outlet", "temp_core", "pressure"}
        suggestions = get_column_suggestions("temp", cols, n=3)
        assert len(suggestions) <= 3
        assert all("temp" in s for s in suggestions)

    def test_exact_match(self):
        suggestions = get_column_suggestions("Temp", {"Temp", "Pressure"})
        assert "Temp" in suggestions
