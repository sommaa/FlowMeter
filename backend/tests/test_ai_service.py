"""Tests for backend/app/services/ai_service.py - AI suggestion helpers."""

import pytest
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.ai_service import _get_debug_level, _debug_log, ColumnMetadata, AIRequest


class TestDebugLevel:
    """Tests for AI debug level helpers."""

    def test_default_level(self):
        with patch.dict(os.environ, {}, clear=True):
            # Remove AI_DEBUG_LEVEL if set
            os.environ.pop("AI_DEBUG_LEVEL", None)
            assert _get_debug_level() == 0

    def test_custom_level(self):
        with patch.dict(os.environ, {"AI_DEBUG_LEVEL": "2"}):
            assert _get_debug_level() == 2

    def test_invalid_level_defaults_to_zero(self):
        with patch.dict(os.environ, {"AI_DEBUG_LEVEL": "invalid"}):
            assert _get_debug_level() == 0


class TestDebugLog:
    """Tests for debug logging."""

    def test_logs_when_level_sufficient(self, capsys):
        with patch.dict(os.environ, {"AI_DEBUG_LEVEL": "2"}):
            _debug_log("test message", min_level=1)
            captured = capsys.readouterr()
            assert "[AI-SVC] test message" in captured.out

    def test_no_log_when_level_insufficient(self, capsys):
        with patch.dict(os.environ, {"AI_DEBUG_LEVEL": "0"}):
            _debug_log("test message", min_level=1)
            captured = capsys.readouterr()
            assert captured.out == ""


class TestColumnMetadata:
    """Tests for ColumnMetadata model."""

    def test_basic(self):
        col = ColumnMetadata(
            name="Temperature",
            description="Process temperature",
            data_type="numeric",
        )
        assert col.name == "Temperature"
        assert col.unit == ""
        assert col.role == ""

    def test_with_stats(self):
        col = ColumnMetadata(
            name="Pressure",
            description="Reactor pressure",
            data_type="numeric",
            unit="bar",
            stats={"min": 0, "max": 100, "mean": 50},
        )
        assert col.stats["mean"] == 50


class TestAIRequest:
    """Tests for AIRequest model."""

    def test_basic(self):
        req = AIRequest(
            columns=[
                ColumnMetadata(name="x", description="input", data_type="numeric"),
            ],
            guidance_text="Find trends in the data",
        )
        assert len(req.columns) == 1
        assert req.guidance_text == "Find trends in the data"
