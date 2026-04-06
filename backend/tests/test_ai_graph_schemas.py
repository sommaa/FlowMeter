"""Tests for backend/app/services/ai_graph/schemas.py."""
import pytest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from pydantic import ValidationError as PydanticValidationError

from app.services.ai_graph.schemas import (
    ValidationError,
    ValidationResult,
    FormulaConfig,
    AdditionalConfig,
    VisualizationSuggestion,
    SuggestionList,
    ColumnMetadata,
)


# ============= Helper =============

def _make_suggestion(**kwargs):
    """Build a VisualizationSuggestion with sensible defaults.

    All default values satisfy every validator so tests can override
    only the field(s) under test without triggering unrelated errors.
    """
    defaults = dict(
        title="Temperature vs Time Analysis",
        description="Shows temperature trends over the measurement period",
        viz_type="universal",
        x_axis="time",
        y_axes=["temperature"],
        confidence=0.85,
        reasoning=(
            "This visualization reveals temporal patterns in the temperature "
            "data that may indicate process drift."
        ),
    )
    defaults.update(kwargs)
    return VisualizationSuggestion(**defaults)


# ============= ValidationError (schema model) =============

class TestSchemaValidationError:
    """Tests for the ValidationError Pydantic model."""

    def test_basic_creation(self):
        err = ValidationError(field="x_axis", error="Column not found")
        assert err.field == "x_axis"
        assert err.error == "Column not found"
        assert err.suggestion == ""

    def test_creation_with_suggestion(self):
        err = ValidationError(
            field="y_axes", error="Missing columns", suggestion="Add at least one y column"
        )
        assert err.suggestion == "Add at least one y column"

    def test_empty_suggestion_default(self):
        err = ValidationError(field="viz_type", error="Invalid type")
        assert err.suggestion == ""


# ============= ValidationResult =============

class TestValidationResult:
    """Tests for ValidationResult aggregation model."""

    def test_default_is_valid(self):
        result = ValidationResult()
        assert result.is_valid is True
        assert result.errors == []

    def test_add_error_sets_is_valid_false(self):
        result = ValidationResult()
        result.add_error("x_axis", "Column not found", "Did you mean 'temp'?")
        assert result.is_valid is False
        assert len(result.errors) == 1
        assert result.errors[0].field == "x_axis"
        assert result.errors[0].error == "Column not found"
        assert result.errors[0].suggestion == "Did you mean 'temp'?"

    def test_add_error_without_suggestion(self):
        result = ValidationResult()
        result.add_error("y_axes", "Empty list")
        assert result.is_valid is False
        assert result.errors[0].suggestion == ""

    def test_multiple_errors_accumulate(self):
        result = ValidationResult()
        result.add_error("x_axis", "Not found")
        result.add_error("y_axes", "Too few columns")
        result.add_error("viz_type", "Invalid type")
        assert result.is_valid is False
        assert len(result.errors) == 3
        fields = [e.field for e in result.errors]
        assert fields == ["x_axis", "y_axes", "viz_type"]

    def test_is_valid_stays_false_after_multiple_errors(self):
        result = ValidationResult()
        result.add_error("a", "err1")
        result.add_error("b", "err2")
        # is_valid should remain False throughout
        assert result.is_valid is False


# ============= FormulaConfig =============

class TestFormulaConfig:
    """Tests for FormulaConfig and its input validator."""

    def test_valid_formula_with_assignment(self):
        fc = FormulaConfig(input="result = col['A'] + col['B']")
        assert "col['A']" in fc.input
        assert "+" in fc.input

    def test_valid_formula_with_parentheses(self):
        fc = FormulaConfig(input="result = (col['A'])")
        assert fc.input == "result = (col['A'])"

    def test_valid_formula_with_multiplication(self):
        fc = FormulaConfig(input="result = col['temp'] * 1.8")
        assert "*" in fc.input

    def test_valid_formula_with_division(self):
        fc = FormulaConfig(input="result = col['flow'] / col['area']")
        assert "/" in fc.input

    def test_valid_formula_with_subtraction(self):
        fc = FormulaConfig(input="result = col['A'] - col['B']")
        assert "-" in fc.input

    def test_empty_formula_allowed(self):
        fc = FormulaConfig(input="")
        assert fc.input == ""

    def test_default_empty_string(self):
        fc = FormulaConfig()
        assert fc.input == ""

    def test_no_operator_raises_value_error(self):
        with pytest.raises(PydanticValidationError, match="operator"):
            FormulaConfig(input="justaplainword")

    def test_no_operator_alphanumeric_raises(self):
        with pytest.raises(PydanticValidationError, match="operator"):
            FormulaConfig(input="col temp value")


# ============= AdditionalConfig =============

class TestAdditionalConfig:
    """Tests for AdditionalConfig defaults and bounds."""

    def test_defaults(self):
        ac = AdditionalConfig()
        assert ac.add_regression is False
        assert ac.regression_degree == 1
        assert ac.pca_components == 2
        assert ac.show_confidence_interval is False
        assert ac.formula is None

    def test_regression_degree_lower_bound(self):
        ac = AdditionalConfig(regression_degree=1)
        assert ac.regression_degree == 1

    def test_regression_degree_upper_bound(self):
        ac = AdditionalConfig(regression_degree=5)
        assert ac.regression_degree == 5

    def test_regression_degree_below_min_raises(self):
        with pytest.raises(PydanticValidationError):
            AdditionalConfig(regression_degree=0)

    def test_regression_degree_above_max_raises(self):
        with pytest.raises(PydanticValidationError):
            AdditionalConfig(regression_degree=6)

    def test_pca_components_lower_bound(self):
        ac = AdditionalConfig(pca_components=2)
        assert ac.pca_components == 2

    def test_pca_components_upper_bound(self):
        ac = AdditionalConfig(pca_components=10)
        assert ac.pca_components == 10

    def test_pca_components_below_min_raises(self):
        with pytest.raises(PydanticValidationError):
            AdditionalConfig(pca_components=1)

    def test_pca_components_above_max_raises(self):
        with pytest.raises(PydanticValidationError):
            AdditionalConfig(pca_components=11)

    def test_boolean_fields_explicit(self):
        ac = AdditionalConfig(add_regression=True, show_confidence_interval=True)
        assert ac.add_regression is True
        assert ac.show_confidence_interval is True


class TestAdditionalConfigNormalizeFormula:
    """Tests for AdditionalConfig.normalize_formula validator."""

    def test_none_stays_none(self):
        ac = AdditionalConfig(formula=None)
        assert ac.formula is None

    def test_string_wraps_to_formula_config(self):
        ac = AdditionalConfig(formula="result = col['A'] * 2")
        assert isinstance(ac.formula, FormulaConfig)
        assert ac.formula.input == "result = col['A'] * 2"

    def test_dict_with_input_key(self):
        ac = AdditionalConfig(formula={"input": "result = 1 + 2"})
        assert isinstance(ac.formula, FormulaConfig)
        assert ac.formula.input == "result = 1 + 2"

    def test_dict_with_formula_key(self):
        ac = AdditionalConfig(formula={"formula": "result = 1 + 2"})
        assert isinstance(ac.formula, FormulaConfig)
        assert ac.formula.input == "result = 1 + 2"

    def test_empty_dict_becomes_none(self):
        ac = AdditionalConfig(formula={})
        assert ac.formula is None

    def test_formula_config_instance_passthrough(self):
        fc = FormulaConfig(input="result = col['X'] - col['Y']")
        ac = AdditionalConfig(formula=fc)
        assert ac.formula is fc
        assert ac.formula.input == "result = col['X'] - col['Y']"


# ============= VisualizationSuggestion - Basic =============

class TestVisualizationSuggestion:
    """Tests for VisualizationSuggestion creation and field validators."""

    def test_valid_minimal_creation(self):
        s = VisualizationSuggestion(
            title="Temperature vs Time Analysis",
            description="Shows temperature trends over the measurement period",
            viz_type="universal",
            x_axis="time",
            y_axes=["temperature"],
            confidence=0.85,
            reasoning=(
                "This visualization reveals temporal patterns in the "
                "temperature data that may indicate process drift."
            ),
        )
        assert s.title == "Temperature vs Time Analysis"
        assert s.viz_type == "universal"
        assert s.x_axis == "time"
        assert s.y_axes == ["temperature"]
        assert s.confidence == 0.85
        assert s.plot_type == "line"  # default
        assert s.legend_labels == []
        assert s.x_label == ""
        assert s.y_label == ""

    def test_valid_with_all_optional_fields(self):
        s = _make_suggestion(
            legend_labels=["Temp (C)"],
            x_label="Time (hours)",
            y_label="Temperature (C)",
            plot_type="scatter",
            additional_config=AdditionalConfig(add_regression=True),
        )
        assert s.legend_labels == ["Temp (C)"]
        assert s.x_label == "Time (hours)"
        assert s.y_label == "Temperature (C)"
        assert s.plot_type == "scatter"
        assert s.additional_config.add_regression is True

    # --- Title validation ---

    def test_title_too_short_raises(self):
        with pytest.raises(PydanticValidationError):
            _make_suggestion(title="Hi")

    def test_title_at_minimum_length(self):
        s = _make_suggestion(title="ABCDE")  # exactly 5 chars
        assert s.title == "ABCDE"

    def test_title_too_long_raises(self):
        with pytest.raises(PydanticValidationError):
            _make_suggestion(title="A" * 101)

    def test_title_at_maximum_length(self):
        long_title = "A" * 100
        s = _make_suggestion(title=long_title)
        assert len(s.title) == 100

    def test_title_with_ai_raises(self):
        with pytest.raises(PydanticValidationError, match="ai"):
            _make_suggestion(title="AI Generated Temperature Chart")

    def test_title_with_ai_case_insensitive(self):
        with pytest.raises(PydanticValidationError, match="ai"):
            _make_suggestion(title="An AI-driven analysis of data")

    def test_title_with_suggested_raises(self):
        with pytest.raises(PydanticValidationError, match="suggested"):
            _make_suggestion(title="Suggested Temperature Analysis")

    def test_title_with_generated_raises(self):
        with pytest.raises(PydanticValidationError, match="generated"):
            _make_suggestion(title="Generated Chart of Pressure Data")

    def test_title_with_recommend_raises(self):
        with pytest.raises(PydanticValidationError, match="recommend"):
            _make_suggestion(title="Recommended Visualization for Flow")

    # --- Description validation ---

    def test_description_too_short_raises(self):
        with pytest.raises(PydanticValidationError):
            _make_suggestion(description="Short")

    def test_description_at_minimum_length(self):
        s = _make_suggestion(description="A" * 10)
        assert len(s.description) == 10

    def test_description_too_long_raises(self):
        with pytest.raises(PydanticValidationError):
            _make_suggestion(description="A" * 301)

    # --- Reasoning validation ---

    def test_reasoning_with_i_think_raises(self):
        with pytest.raises(PydanticValidationError, match="i think"):
            _make_suggestion(
                reasoning="I think this visualization shows temperature trends across the measurement period."
            )

    def test_reasoning_with_i_suggest_raises(self):
        with pytest.raises(PydanticValidationError, match="i suggest"):
            _make_suggestion(
                reasoning="I suggest looking at this visualization to understand temperature trends over time."
            )

    def test_reasoning_with_i_recommend_raises(self):
        with pytest.raises(PydanticValidationError, match="i recommend"):
            _make_suggestion(
                reasoning="I recommend this chart for understanding the thermal behavior of the system over time."
            )

    def test_reasoning_with_the_ai_raises(self):
        with pytest.raises(PydanticValidationError, match="the ai"):
            _make_suggestion(
                reasoning="The AI detected a correlation between temperature and pressure across the full dataset."
            )

    def test_reasoning_with_my_analysis_raises(self):
        with pytest.raises(PydanticValidationError, match="my analysis"):
            _make_suggestion(
                reasoning="Based on my analysis of the dataset, the temperature shows a clear upward trend over time."
            )

    def test_reasoning_with_i_believe_raises(self):
        with pytest.raises(PydanticValidationError, match="i believe"):
            _make_suggestion(
                reasoning="I believe this chart effectively shows the correlation between the two process variables."
            )

    def test_reasoning_with_in_my_opinion_raises(self):
        with pytest.raises(PydanticValidationError, match="in my opinion"):
            _make_suggestion(
                reasoning="In my opinion this visualization provides a comprehensive overview of the process performance."
            )

    def test_reasoning_too_short_raises(self):
        with pytest.raises(PydanticValidationError):
            _make_suggestion(reasoning="Too short text.")

    def test_reasoning_too_long_raises(self):
        with pytest.raises(PydanticValidationError):
            _make_suggestion(reasoning="A" * 801)

    # --- Confidence validation ---

    def test_confidence_below_zero_raises(self):
        with pytest.raises(PydanticValidationError):
            _make_suggestion(confidence=-0.1)

    def test_confidence_above_one_raises(self):
        with pytest.raises(PydanticValidationError):
            _make_suggestion(confidence=1.5)

    def test_confidence_at_zero(self):
        s = _make_suggestion(confidence=0.0)
        assert s.confidence == 0.0

    def test_confidence_at_one(self):
        s = _make_suggestion(confidence=1.0)
        assert s.confidence == 1.0

    # --- plot_type normalization ---

    def test_normalize_plot_type_empty_to_line(self):
        s = _make_suggestion(plot_type="")
        assert s.plot_type == "line"

    def test_normalize_plot_type_none_to_line(self):
        s = _make_suggestion(plot_type=None)
        assert s.plot_type == "line"

    def test_plot_type_scatter(self):
        s = _make_suggestion(plot_type="scatter")
        assert s.plot_type == "scatter"

    def test_plot_type_step(self):
        s = _make_suggestion(plot_type="step")
        assert s.plot_type == "step"

    def test_plot_type_bar(self):
        s = _make_suggestion(plot_type="bar")
        assert s.plot_type == "bar"

    def test_plot_type_line_scatter(self):
        s = _make_suggestion(plot_type="line+scatter")
        assert s.plot_type == "line+scatter"

    def test_plot_type_invalid_raises(self):
        with pytest.raises(PydanticValidationError):
            _make_suggestion(plot_type="invalid_type")


# ============= VisualizationSuggestion - viz_type requirements =============

class TestVisualizationSuggestionVizTypeRequirements:
    """Model-level validation of viz_type-specific requirements."""

    # --- universal ---

    def test_universal_requires_x_axis(self):
        with pytest.raises(PydanticValidationError, match="requires an x_axis"):
            _make_suggestion(viz_type="universal", x_axis="")

    def test_universal_requires_y_axes(self):
        with pytest.raises(PydanticValidationError, match="requires at least 1"):
            _make_suggestion(viz_type="universal", y_axes=[])

    def test_universal_valid(self):
        s = _make_suggestion(viz_type="universal", x_axis="time", y_axes=["temp"])
        assert s.viz_type == "universal"

    # --- area ---

    def test_area_requires_x_axis(self):
        with pytest.raises(PydanticValidationError, match="requires an x_axis"):
            _make_suggestion(viz_type="area", x_axis="")

    def test_area_requires_y_axes(self):
        with pytest.raises(PydanticValidationError, match="requires at least 1"):
            _make_suggestion(viz_type="area", y_axes=[])

    def test_area_valid(self):
        s = _make_suggestion(viz_type="area", x_axis="time", y_axes=["flow"])
        assert s.viz_type == "area"

    # --- hist ---

    def test_hist_requires_x_axis(self):
        with pytest.raises(PydanticValidationError, match="requires an x_axis"):
            _make_suggestion(viz_type="hist", x_axis="")

    def test_hist_valid(self):
        s = _make_suggestion(viz_type="hist", x_axis="temperature", y_axes=["count"])
        assert s.viz_type == "hist"

    # --- box ---

    def test_box_requires_x_axis(self):
        with pytest.raises(PydanticValidationError, match="requires an x_axis"):
            _make_suggestion(viz_type="box", x_axis="")

    def test_box_valid(self):
        s = _make_suggestion(viz_type="box", x_axis="group", y_axes=["value"])
        assert s.viz_type == "box"

    # --- pca ---

    def test_pca_requires_3_y_axes(self):
        with pytest.raises(PydanticValidationError, match="PCA requires at least 3"):
            _make_suggestion(viz_type="pca", y_axes=["A", "B"])

    def test_pca_with_exactly_3_y_axes(self):
        s = _make_suggestion(viz_type="pca", y_axes=["A", "B", "C"])
        assert len(s.y_axes) == 3

    def test_pca_with_many_y_axes(self):
        s = _make_suggestion(viz_type="pca", y_axes=["A", "B", "C", "D", "E"])
        assert len(s.y_axes) == 5

    # --- correlation ---

    def test_correlation_requires_3_y_axes(self):
        with pytest.raises(PydanticValidationError, match="Correlation requires at least 3"):
            _make_suggestion(viz_type="correlation", x_axis="", y_axes=["A", "B"])

    def test_correlation_allows_empty_x_axis(self):
        s = _make_suggestion(viz_type="correlation", x_axis="", y_axes=["A", "B", "C"])
        assert s.x_axis == ""

    def test_correlation_with_x_axis_also_valid(self):
        s = _make_suggestion(viz_type="correlation", x_axis="time", y_axes=["A", "B", "C"])
        assert s.x_axis == "time"

    # --- regression ---

    def test_regression_requires_y_axes(self):
        with pytest.raises(PydanticValidationError, match="Regression requires at least 1"):
            _make_suggestion(viz_type="regression", y_axes=[])

    def test_regression_with_one_y_axis(self):
        s = _make_suggestion(viz_type="regression", y_axes=["pressure"])
        assert s.viz_type == "regression"

    # --- fft ---

    def test_fft_requires_y_axes(self):
        with pytest.raises(PydanticValidationError, match="FFT requires at least 1"):
            _make_suggestion(viz_type="fft", y_axes=[])

    def test_fft_valid(self):
        s = _make_suggestion(viz_type="fft", x_axis="time", y_axes=["signal"])
        assert s.viz_type == "fft"

    # --- root_cause ---

    def test_root_cause_requires_3_y_axes(self):
        with pytest.raises(PydanticValidationError, match="Root Cause"):
            _make_suggestion(viz_type="root_cause", x_axis="", y_axes=["A", "B"])

    def test_root_cause_allows_empty_x_axis(self):
        s = _make_suggestion(viz_type="root_cause", x_axis="", y_axes=["A", "B", "C"])
        assert s.x_axis == ""

    # --- formula ---

    def test_formula_requires_formula_config(self):
        with pytest.raises(PydanticValidationError, match="formula"):
            _make_suggestion(
                viz_type="formula",
                y_axes=[],
                additional_config=AdditionalConfig(),
            )

    def test_formula_with_empty_formula_input_raises(self):
        with pytest.raises(PydanticValidationError, match="formula"):
            _make_suggestion(
                viz_type="formula",
                y_axes=[],
                additional_config=AdditionalConfig(
                    formula=FormulaConfig(input="")
                ),
            )

    def test_formula_with_valid_config(self):
        s = _make_suggestion(
            viz_type="formula",
            y_axes=[],
            additional_config=AdditionalConfig(
                formula=FormulaConfig(input="result = col['A'] + col['B']")
            ),
        )
        assert s.viz_type == "formula"
        assert s.additional_config.formula.input == "result = col['A'] + col['B']"

    def test_formula_allows_empty_y_axes(self):
        """Formula type generates its own data, so y_axes can be empty."""
        s = _make_suggestion(
            viz_type="formula",
            y_axes=[],
            additional_config=AdditionalConfig(
                formula=FormulaConfig(input="result = col['A'] * 2")
            ),
        )
        assert s.y_axes == []


# ============= SuggestionList =============

class TestSuggestionList:
    """Tests for the SuggestionList wrapper model."""

    def test_empty_defaults(self):
        sl = SuggestionList()
        assert sl.suggestions == []
        assert sl.validation_passed is True
        assert sl.errors == []

    def test_with_single_suggestion(self):
        s = _make_suggestion()
        sl = SuggestionList(suggestions=[s])
        assert len(sl.suggestions) == 1
        assert sl.suggestions[0].title == s.title

    def test_with_multiple_suggestions(self):
        s1 = _make_suggestion(title="Pressure Over Time Chart")
        s2 = _make_suggestion(title="Flow Rate Distribution Plot")
        sl = SuggestionList(suggestions=[s1, s2])
        assert len(sl.suggestions) == 2

    def test_with_errors(self):
        sl = SuggestionList(
            validation_passed=False,
            errors=["Title too short", "Missing x_axis"],
        )
        assert sl.validation_passed is False
        assert len(sl.errors) == 2


# ============= ColumnMetadata =============

class TestColumnMetadata:
    """Tests for the ColumnMetadata model."""

    def test_basic_creation(self):
        cm = ColumnMetadata(
            name="temperature",
            description="Reactor core temperature",
            data_type="numeric",
        )
        assert cm.name == "temperature"
        assert cm.description == "Reactor core temperature"
        assert cm.data_type == "numeric"
        assert cm.unit == ""
        assert cm.role == ""
        assert cm.stats is None

    def test_full_creation(self):
        cm = ColumnMetadata(
            name="temp",
            description="Temperature sensor reading",
            data_type="numeric",
            unit="C",
            role="target",
            stats={"min": 150.0, "max": 450.0, "mean": 300.0, "std": 50.0},
        )
        assert cm.unit == "C"
        assert cm.role == "target"
        assert cm.stats["mean"] == 300.0
        assert cm.stats["min"] == 150.0

    def test_datetime_data_type(self):
        cm = ColumnMetadata(
            name="timestamp",
            description="Measurement time",
            data_type="datetime",
            role="timestamp",
        )
        assert cm.data_type == "datetime"
        assert cm.role == "timestamp"

    def test_categorical_data_type(self):
        cm = ColumnMetadata(
            name="batch_id",
            description="Batch identifier",
            data_type="categorical",
            role="identifier",
        )
        assert cm.data_type == "categorical"
        assert cm.role == "identifier"

    def test_invalid_data_type_raises(self):
        with pytest.raises(PydanticValidationError):
            ColumnMetadata(
                name="x",
                description="test column",
                data_type="invalid_type",
            )

    def test_invalid_role_raises(self):
        with pytest.raises(PydanticValidationError):
            ColumnMetadata(
                name="x",
                description="test column",
                data_type="numeric",
                role="bad_role",
            )

    def test_feature_role(self):
        cm = ColumnMetadata(
            name="pressure",
            description="Reactor pressure",
            data_type="numeric",
            role="feature",
        )
        assert cm.role == "feature"

    def test_empty_role_allowed(self):
        cm = ColumnMetadata(
            name="col1",
            description="Some column",
            data_type="numeric",
            role="",
        )
        assert cm.role == ""

    def test_stats_none_by_default(self):
        cm = ColumnMetadata(
            name="x",
            description="test variable",
            data_type="numeric",
        )
        assert cm.stats is None

    def test_unit_with_special_characters(self):
        cm = ColumnMetadata(
            name="temp",
            description="Temperature",
            data_type="numeric",
            unit="degC",
        )
        assert cm.unit == "degC"
