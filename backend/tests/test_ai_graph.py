"""Tests for backend/app/services/ai_graph/graph.py helper functions."""

import asyncio
import pytest
import os
import sys
import json
from unittest.mock import patch, AsyncMock, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.ai_graph.graph import (
    initialize_state,
    _parse_json_response,
    _parse_suggestion,
    route_after_schema,
    route_after_columns,
    route_after_correct,
    route_after_retry,
    DebugLevel,
    get_debug_level,
    AIDebugLogger,
    create_suggestion_graph,
    generate_suggestions_node,
    correct_suggestions_node,
)
from app.services.ai_graph.errors import (
    AIProviderTimeout,
    AIProviderError,
    AIRateLimited,
)


class TestInitializeState:
    """Tests for initialize_state."""

    def test_basic_state(self):
        columns = [
            {"name": "temp", "data_type": "numeric"},
            {"name": "time", "data_type": "datetime"},
            {"name": "cat", "data_type": "categorical"},
        ]
        state = initialize_state(
            columns=columns,
            guidance_text="Analyze temperature",
            api_key="test-key",
            provider="openai",
        )
        assert state["guidance_text"] == "Analyze temperature"
        assert state["provider"] == "openai"
        assert state["valid_column_names"] == {"temp", "time", "cat"}
        assert state["numeric_columns"] == {"temp"}
        assert state["datetime_columns"] == {"time"}
        assert state["categorical_columns"] == {"cat"}
        assert state["retry_count"] == 0
        assert state["current_stage"] == "generate"

    def test_default_viz_types(self):
        state = initialize_state(
            columns=[],
            guidance_text="",
            api_key="key",
            provider="openai",
        )
        assert "universal" in state["available_viz_types"]
        assert "formula" in state["available_viz_types"]
        assert "pca" in state["available_viz_types"]

    def test_custom_viz_types(self):
        state = initialize_state(
            columns=[],
            guidance_text="",
            api_key="key",
            provider="openai",
            available_viz_types=["line", "bar"],
        )
        assert state["available_viz_types"] == ["line", "bar"]

    def test_max_suggestions(self):
        state = initialize_state(
            columns=[],
            guidance_text="",
            api_key="key",
            provider="openai",
            max_suggestions=10,
        )
        assert state["max_suggestions"] == 10


class TestParseJsonResponse:
    """Tests for _parse_json_response."""

    def test_direct_json_array(self):
        content = json.dumps([{"title": "Test", "viz_type": "line"}])
        result = _parse_json_response(content)
        assert len(result) == 1
        assert result[0]["title"] == "Test"

    def test_json_with_suggestions_key(self):
        content = json.dumps({"suggestions": [{"title": "A"}, {"title": "B"}]})
        result = _parse_json_response(content)
        assert len(result) == 2

    def test_single_dict(self):
        content = json.dumps({"title": "Single"})
        result = _parse_json_response(content)
        assert len(result) == 1
        assert result[0]["title"] == "Single"

    def test_markdown_code_block(self):
        content = '```json\n[{"title": "MD"}]\n```'
        result = _parse_json_response(content)
        assert len(result) == 1
        assert result[0]["title"] == "MD"

    def test_json_in_prose(self):
        content = 'Here are suggestions: [{"title": "Prose"}] That is all.'
        result = _parse_json_response(content)
        assert len(result) == 1
        assert result[0]["title"] == "Prose"

    def test_invalid_json(self):
        content = "This is not JSON at all"
        result = _parse_json_response(content)
        assert result == []

    def test_empty_string(self):
        result = _parse_json_response("")
        assert result == []


class TestParseSuggestion:
    """Tests for _parse_suggestion."""

    def test_valid_suggestion(self):
        raw = {
            "title": "Temperature vs Time Analysis",
            "description": "Shows temperature trends over measurement period",
            "viz_type": "universal",
            "x_axis": "time",
            "y_axes": ["temperature"],
            "confidence": 0.85,
            "reasoning": "This visualization reveals temporal patterns in the temperature data that may indicate drift.",
        }
        suggestion = _parse_suggestion(raw)
        assert suggestion.title == "Temperature vs Time Analysis"
        assert suggestion.viz_type == "universal"

    def test_formula_as_string(self):
        raw = {
            "title": "Efficiency Calculation Plot",
            "description": "Computes and displays operational efficiency over time",
            "viz_type": "formula",
            "x_axis": "time",
            "y_axes": [],
            "confidence": 0.8,
            "reasoning": "Computing efficiency from output and input columns provides a derived metric for process optimization.",
            "additional_config": {
                "formula": "result = col['output'] / col['input']"
            },
        }
        suggestion = _parse_suggestion(raw)
        assert suggestion.additional_config.formula is not None
        assert "col['output']" in suggestion.additional_config.formula.input

    def test_formula_as_dict(self):
        raw = {
            "title": "Custom Formula Output",
            "description": "Shows results of custom formula computation",
            "viz_type": "formula",
            "x_axis": "time",
            "y_axes": [],
            "confidence": 0.7,
            "reasoning": "The custom formula provides a derived metric that combines multiple process variables into a single indicator.",
            "additional_config": {
                "formula": {"input": "result = col['a'] + col['b']"}
            },
        }
        suggestion = _parse_suggestion(raw)
        assert suggestion.additional_config.formula.input == "result = col['a'] + col['b']"

    def test_optional_fields(self):
        raw = {
            "title": "Temperature vs Time Analysis",
            "description": "Shows temperature trends over measurement period",
            "viz_type": "universal",
            "x_axis": "time",
            "y_axes": ["temp"],
            "confidence": 0.9,
            "reasoning": "This visualization reveals temporal patterns in the temperature data with custom axis labels.",
            "x_label": "Time (hours)",
            "y_label": "Temperature (C)",
            "plot_type": "scatter",
        }
        suggestion = _parse_suggestion(raw)
        assert suggestion.x_label == "Time (hours)"
        assert suggestion.plot_type == "scatter"


class TestRouterFunctions:
    """Tests for routing functions."""

    def test_route_after_schema_validate_columns(self):
        state = {"current_stage": "validate_columns"}
        assert route_after_schema(state) == "validate_columns"

    def test_route_after_schema_correct(self):
        state = {"current_stage": "correct"}
        assert route_after_schema(state) == "correct"

    def test_route_after_schema_retry(self):
        state = {"current_stage": "retry"}
        assert route_after_schema(state) == "retry"

    def test_route_after_schema_done(self):
        state = {"current_stage": "done"}
        assert route_after_schema(state) == "end"

    def test_route_after_columns_formulas(self):
        state = {"current_stage": "validate_formulas"}
        assert route_after_columns(state) == "validate_formulas"

    def test_route_after_columns_correct(self):
        state = {"current_stage": "correct"}
        assert route_after_columns(state) == "correct"

    def test_route_after_columns_done(self):
        state = {"current_stage": "done"}
        assert route_after_columns(state) == "end"

    def test_route_after_correct_validate(self):
        state = {"current_stage": "validate_columns"}
        assert route_after_correct(state) == "validate_columns"

    def test_route_after_correct_done(self):
        state = {"current_stage": "done"}
        assert route_after_correct(state) == "end"

    def test_route_after_retry_generate(self):
        state = {"current_stage": "generate"}
        assert route_after_retry(state) == "generate"

    def test_route_after_retry_done(self):
        state = {"current_stage": "done"}
        assert route_after_retry(state) == "end"


class TestDebugLevel:
    """Tests for DebugLevel and related."""

    def test_debug_levels(self):
        assert DebugLevel.OFF == 0
        assert DebugLevel.SUMMARY == 1
        assert DebugLevel.STANDARD == 2
        assert DebugLevel.VERBOSE == 3
        assert DebugLevel.TRACE == 4

    def test_get_debug_level_default(self):
        # Clean env to ensure default
        old = os.environ.pop("AI_DEBUG_LEVEL", None)
        try:
            assert get_debug_level() == 0
        finally:
            if old is not None:
                os.environ["AI_DEBUG_LEVEL"] = old

    def test_get_debug_level_set(self):
        old = os.environ.get("AI_DEBUG_LEVEL")
        os.environ["AI_DEBUG_LEVEL"] = "3"
        try:
            assert get_debug_level() == 3
        finally:
            if old is not None:
                os.environ["AI_DEBUG_LEVEL"] = old
            else:
                del os.environ["AI_DEBUG_LEVEL"]

    def test_get_debug_level_invalid(self):
        old = os.environ.get("AI_DEBUG_LEVEL")
        os.environ["AI_DEBUG_LEVEL"] = "not_a_number"
        try:
            assert get_debug_level() == 0
        finally:
            if old is not None:
                os.environ["AI_DEBUG_LEVEL"] = old
            else:
                del os.environ["AI_DEBUG_LEVEL"]


class TestAIDebugLogger:
    """Tests for AIDebugLogger."""

    def test_logger_init(self):
        logger = AIDebugLogger()
        assert logger._phase_start_time is None
        assert logger._workflow_start_time is None

    def test_level_property_reads_env(self):
        old = os.environ.get("AI_DEBUG_LEVEL")
        os.environ["AI_DEBUG_LEVEL"] = "2"
        try:
            logger = AIDebugLogger()
            assert logger.level == 2
        finally:
            if old is not None:
                os.environ["AI_DEBUG_LEVEL"] = old
            else:
                del os.environ["AI_DEBUG_LEVEL"]


class TestCreateSuggestionGraph:
    """Tests for create_suggestion_graph."""

    def test_graph_creation(self):
        graph = create_suggestion_graph()
        assert graph is not None
        # Graph should have the expected nodes
        assert "generate" in graph.nodes
        assert "validate_schema" in graph.nodes
        assert "validate_columns" in graph.nodes
        assert "validate_formulas" in graph.nodes
        assert "correct" in graph.nodes
        assert "retry" in graph.nodes


def _base_state(**overrides):
    """Helper: a valid SuggestionGraphState for node-level tests."""
    state = initialize_state(
        columns=[{"name": "x", "data_type": "numeric"}],
        guidance_text="test",
        api_key="k",
        provider="openai",
    )
    state.update(overrides)
    return state


class TestProviderTimeout:
    """Timeouts from ainvoke must surface as typed AIProviderTimeout."""

    @pytest.mark.asyncio
    async def test_generate_timeout_becomes_typed_error(self, monkeypatch):
        # Model whose ainvoke never completes within the wait_for window.
        async def _never(*_a, **_kw):
            await asyncio.sleep(10)

        fake_model = MagicMock()
        fake_model.ainvoke = _never

        monkeypatch.setattr(
            "app.services.ai_graph.graph.get_chat_model",
            lambda **kw: fake_model,
        )
        # Squash the real 90s default to something the test can actually run.
        monkeypatch.setattr(
            "app.services.ai_graph.graph.ainvoke_timeout_s",
            lambda *_a, **_kw: 0.05,
        )

        with pytest.raises(AIProviderTimeout) as excinfo:
            await generate_suggestions_node(_base_state())

        assert excinfo.value.provider == "openai"
        assert excinfo.value.elapsed_s >= 0

    @pytest.mark.asyncio
    async def test_correct_timeout_becomes_typed_error(self, monkeypatch):
        async def _never(*_a, **_kw):
            await asyncio.sleep(10)

        fake_model = MagicMock()
        fake_model.ainvoke = _never

        monkeypatch.setattr(
            "app.services.ai_graph.graph.get_chat_model",
            lambda **kw: fake_model,
        )
        monkeypatch.setattr(
            "app.services.ai_graph.graph.ainvoke_timeout_s",
            lambda *_a, **_kw: 0.05,
        )

        state = _base_state(
            failed_suggestions=[{"raw": {"title": "x"}, "errors": ["e"]}],
            valid_column_names={"x"},
        )
        with pytest.raises(AIProviderTimeout) as excinfo:
            await correct_suggestions_node(state)
        assert excinfo.value.provider == "openai"


class TestNetworkErrorDoesNotRetry:
    """A transient network error must bubble out as AIProviderError, not
    get folded into validation_errors and re-enter the schema correction loop."""

    @pytest.mark.asyncio
    async def test_generate_reraises_typed_error_verbatim(self, monkeypatch):
        raised = AIRateLimited("rate limited", provider="openai")

        async def _boom(*_a, **_kw):
            raise raised

        fake_model = MagicMock()
        fake_model.ainvoke = _boom

        monkeypatch.setattr(
            "app.services.ai_graph.graph.get_chat_model",
            lambda **kw: fake_model,
        )

        state = _base_state(retry_count=0)
        with pytest.raises(AIRateLimited) as excinfo:
            await generate_suggestions_node(state)

        assert excinfo.value is raised
        # The state dict passed in must not have been mutated to bump retry_count
        assert state["retry_count"] == 0
