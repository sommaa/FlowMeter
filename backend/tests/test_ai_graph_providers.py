"""Tests for backend/app/services/ai_graph/providers.py."""

import pytest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.ai_graph.providers import get_chat_model


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
