"""Tests for backend/app/services/ai_graph/formula_generator.py."""

import pytest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.ai_graph.formula_generator import (
    ColumnInfo,
    FormulaGenerateRequest,
    _build_user_prompt,
    FORMULA_SYSTEM_PROMPT,
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
