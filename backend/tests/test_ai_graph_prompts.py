"""Tests for backend/app/services/ai_graph/prompts.py."""

import hashlib
import pytest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.ai_graph.prompts import (
    get_system_prompt,
    get_user_prompt,
    get_correction_prompt,
)


class TestGetSystemPrompt:
    """Tests for the system prompt generation."""

    def test_returns_string(self):
        prompt = get_system_prompt()
        assert isinstance(prompt, str)

    def test_contains_key_instructions(self):
        prompt = get_system_prompt()
        assert "visualization" in prompt.lower()
        assert "data" in prompt.lower()

    def test_not_empty(self):
        prompt = get_system_prompt()
        assert len(prompt) > 100

    def test_reasoning_max_chars_is_threaded_into_template(self):
        """The Jinja template substitutes both `reasoning_max_chars` and the
        derived word-count range — verify both render rather than appear as
        unsubstituted placeholders."""
        prompt = get_system_prompt(reasoning_max_chars=800)
        assert "Length: 20-800 characters" in prompt
        # 800 // 6 = 133, 800 // 5 = 160 — the parenthetical range
        assert "133-160 words" in prompt


class TestPromptRenderingByteIdentical:
    """Snapshot: the Jinja-backed prompt builders must produce byte-identical
    output to the pre-refactor f-string builders for a fixed input. Hashes
    captured against the f-string version and frozen here. If any of these
    fail after a template edit, decide whether the change is intentional and
    update the hash — otherwise treat as a bug."""

    _SAMPLE_COLUMNS = [
        {"name": "Time", "data_type": "datetime", "description": "wall-clock", "unit": "s"},
        {"name": "Power", "data_type": "numeric", "description": "reactor power", "unit": "MW", "role": "target"},
        {"name": "Temp", "data_type": "numeric"},
    ]

    @staticmethod
    def _sha(text: str) -> str:
        return hashlib.sha256(text.encode()).hexdigest()[:16]

    def test_system_prompt_byte_identical(self):
        # Privacy ON (default). Re-pinned after adding the "Output Shape"
        # section near the top of the system prompt with a complete JSON
        # object example. Added in response to a production failure where
        # Gemini 3.1 emitted `["Title1","Title2","Title3"]` (bare strings)
        # instead of suggestion objects — the prompt previously only
        # described field NAMES without anchoring a concrete shape, and the
        # model shape-degraded after a long tool-use context.
        out = get_system_prompt(reasoning_max_chars=800)
        assert len(out) == 14293
        assert self._sha(out) == "6a30f2ddf212577e"

    def test_system_prompt_byte_identical_with_dataset_access(self):
        # Privacy OFF: the block expands and adds the tool-use protocol +
        # the full tool list. Pinned so future drift in the tool-use
        # instructions is loud. The protocol got an explicit "you MUST
        # inspect the data before producing suggestions" preamble after we
        # observed Claude skipping all tools and going straight to JSON.
        # Most recent additions: anti-patterns block calling out duplicate
        # schema()/null_counts() calls, head+sample overlap, describe on
        # datetime, and groupby_agg on a timestamp column — pinned after
        # observing Gemini Flash burn through 6 tool calls in iter 1
        # repeating these mistakes. Updated again with the "Output Shape"
        # JSON example anchor (see test above). Re-pinned after adding the
        # one-shot `overview()` tool (recommended first call) to the tool
        # list and the tool-use protocol. Re-pinned again after adding the
        # `test_formula()` verification tool and the protocol step requiring
        # every formula suggestion to be tested before emission.
        out = get_system_prompt(reasoning_max_chars=800, dataset_access=True)
        assert len(out) == 19296
        assert self._sha(out) == "ab806892b5a5c833"

    def test_user_prompt_byte_identical(self):
        # Re-pinned after restructuring the field list into a "Required
        # Fields" section and appending a final "Output Shape" reminder
        # with a complete `[{...}]` example as the LAST thing in the user
        # prompt. The final reminder is structural — it makes the target
        # shape the freshest item in context before the model starts
        # making tool calls or emitting suggestions.
        out = get_user_prompt(
            columns=self._SAMPLE_COLUMNS,
            guidance_text="analyze power vs temperature with brackets {x} and quotes",
            available_viz_types=["universal", "regression"],
            existing_visualizations=["Power Over Time"],
            max_suggestions=3,
        )
        assert len(out) == 3769
        assert self._sha(out) == "6e13e7b38cee1d69"

    def test_correction_prompt_byte_identical(self):
        out = get_correction_prompt(
            original_suggestion={"title": "Bad", "viz_type": "pca", "y_axes": ["x"]},
            errors=["needs 3+ numeric columns"],
            valid_columns=["Time", "Power", "Temp"],
        )
        assert len(out) == 910
        assert self._sha(out) == "affa4bb61400b7bc"


class TestStrictUndefined:
    """Jinja env uses StrictUndefined — confirm the wrappers always supply
    every key the templates require (regression: forgetting to thread a
    template variable used to silently render as `None` under f-strings)."""

    def test_user_prompt_no_existing_visualizations(self):
        # Empty existing list is a real path; should render cleanly.
        out = get_user_prompt(
            columns=[{"name": "x", "data_type": "numeric"}],
            guidance_text="g",
            available_viz_types=["universal"],
            existing_visualizations=[],
            max_suggestions=1,
        )
        assert "## Already Created" not in out
        assert "Timeline Columns (datetime)" in out

    def test_user_prompt_no_datetime_columns(self):
        out = get_user_prompt(
            columns=[{"name": "x", "data_type": "numeric"}],
            guidance_text="g",
            available_viz_types=["universal"],
            existing_visualizations=[],
            max_suggestions=1,
        )
        assert "None — choose a numeric x_axis where needed." in out
