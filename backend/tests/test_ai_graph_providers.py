"""Tests for backend/app/services/ai_graph/providers.py."""

import pytest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.ai_graph.providers import (
    get_chat_model,
    _openai_supports_reasoning_effort,
    ainvoke_timeout_s,
)


class TestGetChatModel:
    """Tests for the provider factory."""

    def test_invalid_provider_raises(self):
        with pytest.raises(ValueError):
            get_chat_model("invalid_provider", api_key="test", model="some-model")

    def test_missing_model_raises(self):
        with pytest.raises(ValueError, match="model must be selected"):
            get_chat_model("openai", api_key="sk-fake", model="")

    def test_gemini_model_creation(self):
        # This may fail if langchain-google-genai not installed, skip gracefully
        try:
            model = get_chat_model("gemini", api_key="fake-key", model="gemini-2.0-flash")
            assert model is not None
        except ImportError:
            pytest.skip("langchain-google-genai not installed")

    def test_openai_model_creation(self):
        try:
            model = get_chat_model("openai", api_key="sk-fake", model="gpt-4o")
            assert model is not None
        except ImportError:
            pytest.skip("langchain-openai not installed")


class TestGeminiToolsBoundHeadroom:
    """``tools_bound=True`` must add output-token headroom on Gemini.

    Production failure (req-233a41a4ea95): Gemini 3.x charges thinking
    tokens against ``max_output_tokens``. The tool-bound iter 6 spent ~70s
    thinking and dumped a 507-byte partial JSON because no headroom was
    reserved. ``_create_gemini_model`` previously accepted ``tools_bound``
    but ignored it — only the OpenAI path applied headroom.
    """

    def test_gemini_tools_bound_inflates_max_output_tokens(self, monkeypatch):
        # Capture the kwargs passed to the underlying ChatGoogleGenerativeAI
        # wrapper so we can assert on the effective max_output_tokens.
        captured: dict = {}

        class _FakeChatGoogle:
            def __init__(self, **kw):
                captured.update(kw)

        try:
            import langchain_google_genai as _lgg
        except ImportError:
            pytest.skip("langchain-google-genai not installed")
        monkeypatch.setattr(_lgg, "ChatGoogleGenerativeAI", _FakeChatGoogle)

        # Without tools_bound: baseline cap.
        get_chat_model("gemini", api_key="fake", model="gemini-3-pro")
        baseline = captured["max_output_tokens"]

        captured.clear()
        # With tools_bound: medium-tier headroom added on top of baseline.
        get_chat_model("gemini", api_key="fake", model="gemini-3-pro", tools_bound=True)
        with_tools = captured["max_output_tokens"]

        assert with_tools > baseline, (
            f"tools_bound=True should inflate max_output_tokens "
            f"(was {baseline}, got {with_tools})"
        )

    def test_gemini_effort_inflates_max_output_tokens(self, monkeypatch):
        captured: dict = {}

        class _FakeChatGoogle:
            def __init__(self, **kw):
                captured.update(kw)

        try:
            import langchain_google_genai as _lgg
        except ImportError:
            pytest.skip("langchain-google-genai not installed")
        monkeypatch.setattr(_lgg, "ChatGoogleGenerativeAI", _FakeChatGoogle)

        get_chat_model("gemini", api_key="fake", model="gemini-3-pro")
        baseline = captured["max_output_tokens"]

        captured.clear()
        get_chat_model(
            "gemini", api_key="fake", model="gemini-3-pro", effort="high"
        )
        with_effort = captured["max_output_tokens"]
        # ``thinking_budget`` is set as a separate kwarg.
        assert "thinking_budget" in captured
        assert with_effort > baseline


class TestOpenAISupportsReasoningEffort:
    """Gate the ``reasoning_effort`` API kwarg by model family.

    The wrong gating used to send ``reasoning_effort`` for every OpenAI
    request when effort was set. Non-reasoning models (gpt-4o, gpt-4-turbo,
    legacy GPTs) return a 400 ``Unrecognized request argument supplied:
    reasoning_effort`` — visible against gpt-4o in production logs.
    """

    @pytest.mark.parametrize("model", [
        # o-series reasoning models — every variant accepts the kwarg.
        "o1", "o1-mini", "o1-preview",
        "o3", "o3-mini", "o3-pro",
        "o4-mini",
        # GPT-5 family is reasoning-tier across all variants.
        "gpt-5", "gpt-5-mini", "gpt-5-codex",
        # Case-insensitive — the chooser may surface mixed-case names.
        "O1", "GPT-5",
    ])
    def test_supported_models(self, model):
        assert _openai_supports_reasoning_effort(model) is True

    @pytest.mark.parametrize("model", [
        # Standard chat models — kwarg returns 400.
        "gpt-4o", "gpt-4o-mini",
        "gpt-4-turbo", "gpt-4",
        "gpt-3.5-turbo",
        # Empty/None defaults to False (defensive — model is required).
        "", None,
    ])
    def test_unsupported_models(self, model):
        assert _openai_supports_reasoning_effort(model) is False


class TestAinvokeTimeout:
    """Reasoning models on every provider need the longer budget — gpt-5 +
    high effort + 8 tool-call rounds can exceed 90s on the final synthesis
    call, hitting the wait_for cap and surfacing as ``AIProviderTimeout``.

    Tool-bound calls also need the longer budget regardless of effort: the
    agent-loop's first request carries the tool schemas + dataset metadata
    on top of the system prompt, and Gemini 3 has been observed to take
    >90s on this even at ``effort=None``.
    """

    @pytest.mark.parametrize("provider", ["openai", "claude", "gemini"])
    def test_no_effort_uses_default(self, provider):
        assert ainvoke_timeout_s(provider, None) == 90.0

    @pytest.mark.parametrize("provider", ["openai", "claude", "gemini"])
    def test_low_effort_uses_default(self, provider):
        # Low effort doesn't burn the same reasoning time; default cap is fine.
        assert ainvoke_timeout_s(provider, "low") == 90.0

    @pytest.mark.parametrize("provider,effort", [
        ("openai", "medium"), ("openai", "high"),
        ("claude", "medium"), ("claude", "high"),
        ("gemini", "medium"), ("gemini", "high"),
    ])
    def test_reasoning_effort_extends_timeout(self, provider, effort):
        # Generalized from the Claude-only carve-out — gpt-5 and Gemini's
        # thinking_budget paths take just as long.
        assert ainvoke_timeout_s(provider, effort) == 180.0

    @pytest.mark.parametrize("provider", ["openai", "claude", "gemini"])
    def test_tools_bound_extends_timeout_even_without_effort(self, provider):
        # The agent-loop path: tools are bound and the first request has
        # the full tool schemas + dataset metadata. Default 90s isn't
        # enough — we observed Gemini 3 timing out here at effort=None.
        assert ainvoke_timeout_s(provider, None, tools_bound=True) == 180.0
        assert ainvoke_timeout_s(provider, "low", tools_bound=True) == 180.0

    @pytest.mark.parametrize("provider", ["openai", "claude", "gemini"])
    def test_tools_bound_with_effort_still_long(self, provider):
        # Both signals → still 180s (not double-counted; this is a ceiling).
        assert ainvoke_timeout_s(provider, "high", tools_bound=True) == 180.0
