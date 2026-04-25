"""Tests for backend/app/services/ai_service.py - AI suggestion helpers."""

import pytest
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.ai_service import (
    _get_debug_level,
    _debug_log,
    ColumnMetadata,
    AIRequest,
    _classify_exception,
    _extract_retry_after_s,
    classify_and_wrap,
    AIErrorClass,
    AIProviderError,
    AIProviderTimeout,
    AIInvalidKey,
    AIRateLimited,
    AIQuotaExceeded,
    AIProviderUnavailable,
    AIInvalidOutput,
)


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


class _FakeExc(Exception):
    """Helper for simulating provider SDK exceptions by forging __module__."""

    def __init__(self, module: str, name: str, message: str = "", code=None, response=None):
        super().__init__(message)
        cls = type(name, (Exception,), {"__module__": module})
        self.__class__ = cls
        if code is not None:
            self.code = code
        if response is not None:
            self.response = response


def _make_exc(module: str, name: str, message: str = "", **attrs):
    """Create an exception instance whose type has the requested module/name."""
    cls = type(name, (Exception,), {"__module__": module})
    exc = cls(message)
    for k, v in attrs.items():
        setattr(exc, k, v)
    return exc


class TestClassifyException:
    """Tests for _classify_exception covering each provider's shapes."""

    def test_anthropic_auth_error_is_invalid_key(self):
        exc = _make_exc("anthropic._exceptions", "AuthenticationError", "bad key")
        assert _classify_exception(exc) == AIErrorClass.INVALID_KEY

    def test_anthropic_rate_limit(self):
        exc = _make_exc("anthropic._exceptions", "RateLimitError", "slow down")
        assert _classify_exception(exc) == AIErrorClass.RATE_LIMIT

    def test_anthropic_timeout(self):
        exc = _make_exc("anthropic._exceptions", "APITimeoutError", "took too long")
        assert _classify_exception(exc) == AIErrorClass.TIMEOUT

    def test_anthropic_internal_server_is_unavailable(self):
        exc = _make_exc("anthropic._exceptions", "InternalServerError", "500")
        assert _classify_exception(exc) == AIErrorClass.PROVIDER_UNAVAILABLE

    def test_openai_auth_error_is_invalid_key(self):
        exc = _make_exc("openai._exceptions", "AuthenticationError", "bad key")
        assert _classify_exception(exc) == AIErrorClass.INVALID_KEY

    def test_openai_rate_limit(self):
        exc = _make_exc("openai._exceptions", "RateLimitError", "too many")
        assert _classify_exception(exc) == AIErrorClass.RATE_LIMIT

    def test_openai_timeout(self):
        exc = _make_exc("openai._exceptions", "APITimeoutError", "deadline")
        assert _classify_exception(exc) == AIErrorClass.TIMEOUT

    def test_openai_connection_is_unavailable(self):
        exc = _make_exc("openai._exceptions", "APIConnectionError", "conn reset")
        assert _classify_exception(exc) == AIErrorClass.PROVIDER_UNAVAILABLE

    def test_google_401_is_invalid_key(self):
        exc = _make_exc("google.genai.errors", "ClientError", "unauthorized", code=401)
        assert _classify_exception(exc) == AIErrorClass.INVALID_KEY

    def test_google_429_rate_limit(self):
        exc = _make_exc("google.genai.errors", "ClientError", "too many", code=429)
        assert _classify_exception(exc) == AIErrorClass.RATE_LIMIT

    def test_google_429_quota_specific(self):
        exc = _make_exc("google.genai.errors", "ClientError", "quota exceeded", code=429)
        assert _classify_exception(exc) == AIErrorClass.QUOTA_EXCEEDED

    def test_google_500_is_unavailable(self):
        exc = _make_exc("google.genai.errors", "ServerError", "server oops", code=503)
        assert _classify_exception(exc) == AIErrorClass.PROVIDER_UNAVAILABLE

    def test_fallback_substring_invalid_key(self):
        exc = Exception("invalid api key provided")
        assert _classify_exception(exc) == AIErrorClass.INVALID_KEY

    def test_fallback_substring_rate_limit(self):
        exc = Exception("too many requests")
        assert _classify_exception(exc) == AIErrorClass.RATE_LIMIT

    def test_fallback_substring_quota(self):
        exc = Exception("quota exceeded for this month")
        assert _classify_exception(exc) == AIErrorClass.QUOTA_EXCEEDED

    def test_fallback_substring_timeout(self):
        exc = Exception("operation timed out")
        assert _classify_exception(exc) == AIErrorClass.TIMEOUT

    def test_unknown_exception_returns_unknown(self):
        exc = Exception("some random failure")
        assert _classify_exception(exc) == AIErrorClass.UNKNOWN

    def test_already_typed_passes_through(self):
        exc = AIRateLimited("hi", provider="claude")
        assert _classify_exception(exc) == AIErrorClass.RATE_LIMIT


class TestExtractRetryAfter:
    """Tests for _extract_retry_after_s."""

    def test_missing_response_returns_none(self):
        assert _extract_retry_after_s(Exception("x")) is None

    def test_plain_seconds(self):
        exc = _make_exc("openai", "RateLimitError", "x")
        exc.response = type("R", (), {"headers": {"retry-after": "30"}})()
        assert _extract_retry_after_s(exc) == 30.0

    def test_capitalized_header(self):
        exc = _make_exc("openai", "RateLimitError", "x")
        exc.response = type("R", (), {"headers": {"Retry-After": "7.5"}})()
        assert _extract_retry_after_s(exc) == 7.5

    def test_garbage_header_returns_none(self):
        exc = _make_exc("openai", "RateLimitError", "x")
        exc.response = type("R", (), {"headers": {"retry-after": "not-a-number"}})()
        assert _extract_retry_after_s(exc) is None


class TestClassifyAndWrap:
    """Tests for classify_and_wrap — produces the right typed subclass."""

    def test_passes_through_typed(self):
        e = AIRateLimited("hi", provider="claude")
        assert classify_and_wrap(e) is e

    def test_wraps_invalid_key(self):
        wrapped = classify_and_wrap(Exception("unauthorized"), provider="openai")
        assert isinstance(wrapped, AIInvalidKey)
        assert wrapped.provider == "openai"
        assert wrapped.error_class == AIErrorClass.INVALID_KEY

    def test_wraps_rate_limit_with_retry_after(self):
        exc = _make_exc("openai", "RateLimitError", "slow down")
        exc.response = type("R", (), {"headers": {"retry-after": "45"}})()
        wrapped = classify_and_wrap(exc, provider="openai")
        assert isinstance(wrapped, AIRateLimited)
        assert wrapped.retry_after_s == 45.0
        assert wrapped.retry_advised is True

    def test_wraps_timeout(self):
        wrapped = classify_and_wrap(Exception("request timed out"), provider="claude")
        assert isinstance(wrapped, AIProviderTimeout)
        assert wrapped.provider == "claude"

    def test_wraps_unknown_as_base(self):
        wrapped = classify_and_wrap(Exception("whatever"), provider="gemini")
        assert type(wrapped) is AIProviderError
        assert wrapped.error_class == AIErrorClass.UNKNOWN
