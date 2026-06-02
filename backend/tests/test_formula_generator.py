"""Tests for backend/app/services/ai_graph/formula_generator.py."""

import pytest
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.ai_graph.formula_generator import (
    ColumnInfo,
    FormulaGenerateRequest,
    _build_user_prompt,
    FORMULA_SYSTEM_PROMPT,
    generate_formula,
)
from app.services.ai_graph.errors import (
    AIErrorClass,
    AIProviderError,
    AIRateLimited,
)


class TestColumnInfo:
    """Tests for ColumnInfo model."""

    def test_minimal_creation(self):
        col = ColumnInfo(name="temperature")
        assert col.name == "temperature"
        assert col.description == ""
        assert col.data_type == "numeric"
        assert col.stats is None

    def test_full_creation(self):
        col = ColumnInfo(
            name="pressure",
            description="Inlet pressure",
            data_type="numeric",
            stats={"min": 0.0, "max": 100.0, "mean": 50.0, "std": 10.0},
        )
        assert col.name == "pressure"
        assert col.description == "Inlet pressure"
        assert col.stats["mean"] == 50.0


class TestFormulaGenerateRequest:
    """Tests for FormulaGenerateRequest model."""

    def test_valid_request(self):
        cols = [ColumnInfo(name="x"), ColumnInfo(name="y")]
        req = FormulaGenerateRequest(
            columns=cols,
            description="Calculate the ratio of x to y",
        )
        assert len(req.columns) == 2
        assert req.description == "Calculate the ratio of x to y"


class TestBuildUserPrompt:
    """Tests for _build_user_prompt."""

    def test_basic_prompt(self):
        cols = [
            ColumnInfo(name="temperature", data_type="numeric"),
            ColumnInfo(name="pressure", data_type="numeric"),
        ]
        prompt = _build_user_prompt(cols, "Calculate efficiency")
        assert "temperature" in prompt
        assert "pressure" in prompt
        assert "Calculate efficiency" in prompt
        assert "Available Columns" in prompt

    def test_prompt_with_description(self):
        cols = [
            ColumnInfo(name="temp", description="Reactor temperature", data_type="numeric"),
        ]
        prompt = _build_user_prompt(cols, "Normalize temp")
        assert "Reactor temperature" in prompt

    def test_prompt_with_stats(self):
        cols = [
            ColumnInfo(
                name="flow",
                data_type="numeric",
                stats={"min": 0.0, "max": 100.0, "mean": 50.5},
            ),
        ]
        prompt = _build_user_prompt(cols, "Scale flow")
        assert "Stats:" in prompt
        assert "50.50" in prompt  # formatted as .2f

    def test_prompt_includes_col_syntax_instructions(self):
        cols = [ColumnInfo(name="x")]
        prompt = _build_user_prompt(cols, "Double x")
        assert "col['ColumnName']" in prompt
        assert "result" in prompt

    def test_empty_columns_list(self):
        prompt = _build_user_prompt([], "Do something")
        assert "Available Columns" in prompt
        assert "Do something" in prompt


class TestFormulaSystemPrompt:
    """Tests for the FORMULA_SYSTEM_PROMPT constant."""

    def test_prompt_is_string(self):
        assert isinstance(FORMULA_SYSTEM_PROMPT, str)

    def test_prompt_not_empty(self):
        assert len(FORMULA_SYSTEM_PROMPT) > 200

    def test_prompt_mentions_col_syntax(self):
        assert "col['ColumnName']" in FORMULA_SYSTEM_PROMPT

    def test_prompt_mentions_result_assignment(self):
        assert "result" in FORMULA_SYSTEM_PROMPT

    def test_prompt_mentions_numpy(self):
        assert "np" in FORMULA_SYSTEM_PROMPT

    def test_prompt_safety_rules(self):
        assert "eval" in FORMULA_SYSTEM_PROMPT.lower() or "import" in FORMULA_SYSTEM_PROMPT.lower()


class TestGenerateFormula:
    """Tests for the ``generate_formula`` orchestration.

    These patch ``_call_model`` (the shared reliability wrapper the formula
    path now routes through) so they exercise the generate→validate→return
    flow and the typed-error contract without hitting a real provider.
    """

    _COLS = [ColumnInfo(name="x")]

    @pytest.mark.asyncio
    async def test_single_shot_returns_validated_formula(self):
        """Happy path: content from the model is parsed, validated, returned."""
        fake_response = MagicMock()
        fake_response.content = "result = col['x'] * 2"

        with patch(
            "app.services.ai_graph.formula_generator.get_chat_model",
            return_value=MagicMock(),
        ), patch(
            "app.services.ai_graph.formula_generator._call_model",
            new=AsyncMock(return_value=fake_response),
        ) as mock_call:
            out = await generate_formula(
                provider_name="openai",
                api_key="sk-test",
                columns=self._COLS,
                description="double x",
            )

        assert "result" in out
        assert "col['x']" in out
        # The formula path must go through the shared _call_model wrapper, not
        # a raw ainvoke, so it inherits the streaming-timeout / retry policy.
        mock_call.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_provider_error_propagates_as_typed(self):
        """A typed AIProviderError must NOT be collapsed into a generic
        ValueError — otherwise /ai/generate-formula returns 400 instead of the
        documented 429/401/504/… mapping."""
        with patch(
            "app.services.ai_graph.formula_generator.get_chat_model",
            return_value=MagicMock(),
        ), patch(
            "app.services.ai_graph.formula_generator._call_model",
            new=AsyncMock(side_effect=AIRateLimited("slow down", provider="openai")),
        ):
            with pytest.raises(AIProviderError) as exc_info:
                await generate_formula(
                    provider_name="openai",
                    api_key="sk-test",
                    columns=self._COLS,
                    description="double x",
                )

        assert isinstance(exc_info.value, AIRateLimited)
        assert exc_info.value.error_class == AIErrorClass.RATE_LIMIT
        assert not isinstance(exc_info.value, ValueError)

    @pytest.mark.asyncio
    async def test_raw_exception_is_classified_not_swallowed(self):
        """A raw provider/SDK exception is classified into a typed error (here
        the 'unauthorized' substring → invalid_key) rather than a bare 400."""
        with patch(
            "app.services.ai_graph.formula_generator.get_chat_model",
            return_value=MagicMock(),
        ), patch(
            "app.services.ai_graph.formula_generator._call_model",
            new=AsyncMock(side_effect=RuntimeError("unauthorized: bad key")),
        ):
            with pytest.raises(AIProviderError) as exc_info:
                await generate_formula(
                    provider_name="openai",
                    api_key="sk-test",
                    columns=self._COLS,
                    description="double x",
                )

        assert exc_info.value.error_class == AIErrorClass.INVALID_KEY
        assert not isinstance(exc_info.value, ValueError)
