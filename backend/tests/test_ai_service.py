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
    AIVisualizationService,
)
from app.services.ai_graph.schemas import VisualizationSuggestion


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
    """Tests for debug logging.

    The shared ``debug_log`` writes through the ``logging`` module rather
    than ``print()``, so we capture log records via ``caplog`` instead of
    ``capsys``. This keeps the request-ID prefix filter and configured
    handlers in effect — the old ``print()`` path bypassed both.
    """

    def test_logs_when_level_sufficient(self, caplog):
        import logging as _logging
        with patch.dict(os.environ, {"AI_DEBUG_LEVEL": "2"}):
            with caplog.at_level(_logging.INFO, logger="app.services.ai_graph._debug"):
                _debug_log("test message", min_level=1)
            assert any("[AI-DEBUG] test message" in r.message for r in caplog.records)

    def test_no_log_when_level_insufficient(self, caplog):
        import logging as _logging
        with patch.dict(os.environ, {"AI_DEBUG_LEVEL": "0"}):
            with caplog.at_level(_logging.INFO, logger="app.services.ai_graph._debug"):
                _debug_log("test message", min_level=1)
            assert not any("test message" in r.message for r in caplog.records)


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


class TestSuggestionToConfig:
    """Conversion of VisualizationSuggestion into the frontend's
    VisualizationConfig — focuses on the new secondary-axis and
    reference-line plumbing added on top of the AI schema.
    """

    @staticmethod
    def _make_suggestion(**overrides):
        defaults = dict(
            title="Temperature and Pressure Trends",
            description="Tracks reactor conditions over the run window",
            viz_type="universal",
            x_axis="time",
            y_axes=["temperature", "pressure"],
            confidence=0.9,
            reasoning=(
                "Temperature and pressure share a timeline but live on "
                "different scales; routing pressure to the right axis keeps "
                "both readable."
            ),
        )
        defaults.update(overrides)
        return VisualizationSuggestion(**defaults)

    def test_default_routes_all_series_to_left(self):
        svc = AIVisualizationService()
        s = self._make_suggestion()
        cfg = svc.suggestion_to_config(s)
        assert cfg.series_configs["temperature"].y_axis_id == "left"
        assert cfg.series_configs["pressure"].y_axis_id == "left"
        assert cfg.axis.enable_y2_axis_range is False
        assert cfg.limits.thresholds == []

    def test_secondary_axis_assignment_routes_to_right(self):
        svc = AIVisualizationService()
        s = self._make_suggestion(
            y2_label="Pressure (bar)",
            additional_config={
                "series_axis_assignments": {"pressure": "right"},
            },
        )
        cfg = svc.suggestion_to_config(s)
        assert cfg.series_configs["temperature"].y_axis_id == "left"
        assert cfg.series_configs["pressure"].y_axis_id == "right"
        # Dual-axis plotly layout flips on, label flows through.
        assert cfg.axis.enable_y2_axis_range is True
        assert cfg.axis.y2_label == "Pressure (bar)"

    def test_secondary_axis_without_y2_label_falls_back_to_default(self):
        svc = AIVisualizationService()
        s = self._make_suggestion(
            additional_config={
                "series_axis_assignments": {"pressure": "right"},
            },
        )
        cfg = svc.suggestion_to_config(s)
        assert cfg.axis.enable_y2_axis_range is True
        # AI chose to skip y2_label; conversion uses the human-friendly default
        # rather than emitting an empty string into the chart layout.
        assert cfg.axis.y2_label == "Secondary Axis"

    def test_reference_lines_become_thresholds(self):
        svc = AIVisualizationService()
        s = self._make_suggestion(
            additional_config={
                "reference_lines": [
                    {"label": "Upper Spec (450°C)", "value": 450.0, "axis": "left"},
                    {"label": "Target 95%", "value": 95.0, "axis": "right"},
                ],
            },
        )
        cfg = svc.suggestion_to_config(s)
        assert len(cfg.limits.thresholds) == 2
        # Each Threshold gets a fresh UUID id; the label/value/axis flow
        # through unchanged.
        labels = [t.label for t in cfg.limits.thresholds]
        assert labels == ["Upper Spec (450°C)", "Target 95%"]
        values = [t.value for t in cfg.limits.thresholds]
        assert values == [450.0, 95.0]
        sides = [t.y_axis_id for t in cfg.limits.thresholds]
        assert sides == ["left", "right"]
        # Each id is non-empty and unique.
        ids = [t.id for t in cfg.limits.thresholds]
        assert all(ids) and len(set(ids)) == 2

    def test_combined_secondary_axis_and_reference_lines(self):
        svc = AIVisualizationService()
        s = self._make_suggestion(
            y2_label="Pressure (bar)",
            additional_config={
                "series_axis_assignments": {"pressure": "right"},
                "reference_lines": [
                    {"label": "Max Pressure", "value": 12.5, "axis": "right"},
                ],
            },
        )
        cfg = svc.suggestion_to_config(s)
        assert cfg.series_configs["pressure"].y_axis_id == "right"
        assert cfg.axis.enable_y2_axis_range is True
        assert cfg.axis.y2_label == "Pressure (bar)"
        assert len(cfg.limits.thresholds) == 1
        assert cfg.limits.thresholds[0].y_axis_id == "right"


class TestSanitizeUserTextTruncation:
    """``_sanitize_user_text`` hard-truncates after sanitization so any
    future transform that could grow the string cannot exceed the
    boundary cap. Catches a Unicode-normalization-style bypass."""

    def test_truncation_after_cap(self):
        from app.services.ai_service import (
            _sanitize_user_text,
            _MAX_GUIDANCE_CHARS,
            _MAX_DESCRIPTION_CHARS,
        )

        long_text = "A" * (_MAX_GUIDANCE_CHARS + 500)
        result = _sanitize_user_text(long_text, max_chars=_MAX_GUIDANCE_CHARS)
        assert len(result) == _MAX_GUIDANCE_CHARS

        long_desc = "B" * (_MAX_DESCRIPTION_CHARS + 100)
        result = _sanitize_user_text(long_desc, max_chars=_MAX_DESCRIPTION_CHARS)
        assert len(result) == _MAX_DESCRIPTION_CHARS

    def test_under_cap_passes_through(self):
        from app.services.ai_service import _sanitize_user_text
        text = "normal description"
        assert _sanitize_user_text(text, max_chars=2000) == text

    def test_control_chars_stripped_before_truncation(self):
        from app.services.ai_service import _sanitize_user_text
        # Control chars get removed first, then the result is capped.
        text = "\x00\x01\x02" + "A" * 100
        result = _sanitize_user_text(text, max_chars=50)
        assert "\x00" not in result and "\x01" not in result
        assert len(result) == 50


class TestClassifyByExceptionClass:
    """Round-trip every ``AIErrorClass`` through the resilient class-based
    classifier (Plan layer 2) using real provider SDK exception shapes
    where the SDKs are installed.

    Layer 2 is the load-bearing classifier — when provider message strings
    drift across SDK versions, only the class hierarchy is stable. We
    assert each known shape lands in the right bucket.
    """

    def test_openai_authentication_error(self):
        try:
            import openai
        except ImportError:
            pytest.skip("openai SDK not installed")
        # OpenAI's AuthenticationError requires a response in newer versions;
        # build the simplest legal instance via __new__ so we don't depend
        # on a specific constructor signature.
        exc = openai.AuthenticationError.__new__(openai.AuthenticationError)
        Exception.__init__(exc, "Invalid API key")
        wrapped = classify_and_wrap(exc, provider="openai")
        assert wrapped.error_class == AIErrorClass.INVALID_KEY

    def test_openai_rate_limit_error(self):
        try:
            import openai
        except ImportError:
            pytest.skip("openai SDK not installed")
        exc = openai.RateLimitError.__new__(openai.RateLimitError)
        Exception.__init__(exc, "rate limited")
        wrapped = classify_and_wrap(exc, provider="openai")
        assert wrapped.error_class == AIErrorClass.RATE_LIMIT

    def test_openai_api_timeout(self):
        try:
            import openai
        except ImportError:
            pytest.skip("openai SDK not installed")
        exc = openai.APITimeoutError.__new__(openai.APITimeoutError)
        Exception.__init__(exc, "timed out")
        wrapped = classify_and_wrap(exc, provider="openai")
        assert wrapped.error_class == AIErrorClass.TIMEOUT

    def test_anthropic_rate_limit_error(self):
        try:
            import anthropic
        except ImportError:
            pytest.skip("anthropic SDK not installed")
        exc = anthropic.RateLimitError.__new__(anthropic.RateLimitError)
        Exception.__init__(exc, "rate limit reached")
        wrapped = classify_and_wrap(exc, provider="claude")
        assert wrapped.error_class == AIErrorClass.RATE_LIMIT

    def test_anthropic_authentication_error(self):
        try:
            import anthropic
        except ImportError:
            pytest.skip("anthropic SDK not installed")
        exc = anthropic.AuthenticationError.__new__(anthropic.AuthenticationError)
        Exception.__init__(exc, "auth failed")
        wrapped = classify_and_wrap(exc, provider="claude")
        assert wrapped.error_class == AIErrorClass.INVALID_KEY

    def test_google_resource_exhausted_with_quota(self):
        try:
            from google.api_core import exceptions as gexc
        except ImportError:
            pytest.skip("google.api_core not installed")
        exc = gexc.ResourceExhausted("quota exceeded for project")
        wrapped = classify_and_wrap(exc, provider="gemini")
        assert wrapped.error_class == AIErrorClass.QUOTA_EXCEEDED

    def test_google_unauthenticated(self):
        try:
            from google.api_core import exceptions as gexc
        except ImportError:
            pytest.skip("google.api_core not installed")
        exc = gexc.Unauthenticated("missing credentials")
        wrapped = classify_and_wrap(exc, provider="gemini")
        assert wrapped.error_class == AIErrorClass.INVALID_KEY

    def test_httpx_timeout(self):
        try:
            import httpx
        except ImportError:
            pytest.skip("httpx not installed")
        exc = httpx.TimeoutException("read timeout")
        wrapped = classify_and_wrap(exc, provider="openai")
        assert wrapped.error_class == AIErrorClass.TIMEOUT


class TestApiKeyRedactionInErrors:
    """``classify_and_wrap`` must redact the literal API key from the
    wrapped error message when the provider SDK echoes it. Belt-and-
    suspenders against leaking secrets via HTTP error responses or logs.
    """

    def test_key_redacted_when_present_in_message(self):
        api_key = "sk-supersecret1234567890"
        exc = Exception(f"Invalid API key: {api_key}")
        wrapped = classify_and_wrap(exc, provider="openai", api_key=api_key)
        assert api_key not in wrapped.message
        assert "[REDACTED]" in wrapped.message

    def test_no_redaction_when_key_missing_from_message(self):
        api_key = "sk-supersecret1234567890"
        exc = Exception("Some unrelated error")
        wrapped = classify_and_wrap(exc, provider="openai", api_key=api_key)
        assert "Some unrelated error" in wrapped.message
        assert "[REDACTED]" not in wrapped.message

    def test_short_key_does_not_overrredact(self):
        # Short keys would over-redact common substrings; the helper
        # bypasses redaction below an 8-char threshold.
        exc = Exception("error with sk-12 in message")
        wrapped = classify_and_wrap(exc, provider="openai", api_key="sk-12")
        assert "[REDACTED]" not in wrapped.message
