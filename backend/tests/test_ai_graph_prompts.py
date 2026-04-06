"""Tests for backend/app/services/ai_graph/prompts.py."""

import pytest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.ai_graph.prompts import get_system_prompt


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
