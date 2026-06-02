"""
Typed error model for the AI suggestion pipeline.

Centralizes exception types and the enum used end-to-end (backend classifier
→ API response → frontend UX copy). Lives inside `ai_graph` so both the
graph nodes (which raise) and the service layer (which classifies) can
import without circular dependency on `ai_service`.
"""

import asyncio
from enum import Enum
from typing import Optional


class AIErrorClass(str, Enum):
    """Stable identifier for AI failure modes. Mirrored on the frontend."""

    INVALID_KEY = "invalid_key"
    RATE_LIMIT = "rate_limit"
    QUOTA_EXCEEDED = "quota_exceeded"
    TIMEOUT = "timeout"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    INVALID_OUTPUT = "invalid_output"
    UNKNOWN = "unknown"


# HTTP status code mapping used by the API layer. Keep close to the enum
# so adding a new class forces an explicit status choice.
ERROR_CLASS_TO_HTTP: dict[AIErrorClass, int] = {
    AIErrorClass.INVALID_KEY: 401,
    AIErrorClass.RATE_LIMIT: 429,
    AIErrorClass.QUOTA_EXCEEDED: 429,
    AIErrorClass.TIMEOUT: 504,
    AIErrorClass.PROVIDER_UNAVAILABLE: 502,
    AIErrorClass.INVALID_OUTPUT: 422,
    AIErrorClass.UNKNOWN: 500,
}


class AIProviderError(Exception):
    """Base for typed AI-provider failures.

    Subclasses set `error_class` as a class attribute so callers can branch
    on type OR on the enum without duplicate truth.
    """

    error_class: AIErrorClass = AIErrorClass.UNKNOWN

    def __init__(
        self,
        message: str,
        provider: Optional[str] = None,
        retry_after_s: Optional[float] = None,
        retry_advised: bool = False,
    ):
        super().__init__(message)
        self.message = message
        self.provider = provider
        self.retry_after_s = retry_after_s
        self.retry_advised = retry_advised


class AIProviderTimeout(AIProviderError):
    error_class = AIErrorClass.TIMEOUT

    def __init__(
        self,
        provider: str,
        elapsed_s: float,
        message: Optional[str] = None,
    ):
        super().__init__(
            message or f"{provider} call timed out after {elapsed_s:.1f}s",
            provider=provider,
            retry_advised=True,
        )
        self.elapsed_s = elapsed_s


class AIInvalidKey(AIProviderError):
    error_class = AIErrorClass.INVALID_KEY


class AIRateLimited(AIProviderError):
    error_class = AIErrorClass.RATE_LIMIT

    def __init__(
        self,
        message: str,
        provider: Optional[str] = None,
        retry_after_s: Optional[float] = None,
    ):
        super().__init__(
            message,
            provider=provider,
            retry_after_s=retry_after_s,
            retry_advised=True,
        )


class AIQuotaExceeded(AIProviderError):
    error_class = AIErrorClass.QUOTA_EXCEEDED


class AIProviderUnavailable(AIProviderError):
    error_class = AIErrorClass.PROVIDER_UNAVAILABLE

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("retry_advised", True)
        super().__init__(*args, **kwargs)


class AIInvalidOutput(AIProviderError):
    """Schema validation retries exhausted — the model couldn't produce valid output."""

    error_class = AIErrorClass.INVALID_OUTPUT


# ============= Classifier =============
#
# Heuristics for converting raw provider SDK exceptions (anthropic, openai,
# google.genai) into the typed `AIProviderError` subclasses above. Lives here
# (not in ai_service) so both the LangGraph node layer and the service layer
# can call it — graph.py needs to classify *inside* the agent loop's broad
# exception catch to avoid a retry storm on quota/rate-limit errors.


def _extract_retry_after_s(exc: BaseException) -> Optional[float]:
    """Pull a Retry-After hint out of a provider exception's response, if any.

    Anthropic/OpenAI surface the raw HTTP response on `.response`; headers may
    be a mapping-like object. Missing/malformed → None.
    """
    response = getattr(exc, "response", None)
    if response is None:
        return None
    headers = getattr(response, "headers", None)
    if headers is None:
        return None
    getter = getattr(headers, "get", None)
    if not callable(getter):
        return None
    retry_after = getter("retry-after") or getter("Retry-After")
    if not retry_after:
        return None
    try:
        return float(retry_after)
    except (ValueError, TypeError):
        return None


def _classify_by_exception_class(exc: BaseException) -> Optional["AIErrorClass"]:
    """Match a provider exception against known SDK class hierarchies.

    Class-first matching is the resilient layer: provider message strings
    drift between SDK versions and can be localized, but the exception
    class hierarchy is stable surface. Each provider branch catches
    ``ImportError`` only so an absent SDK is skipped silently — but a real
    ``AttributeError`` (e.g. an SDK class renamed in a future release) is
    *not* caught and surfaces as a regression instead of a silent
    "unknown" classification.

    Returns the matched class or ``None`` if no provider SDK class matches.
    """
    # OpenAI: openai.AuthenticationError, openai.RateLimitError, etc.
    try:
        import openai  # type: ignore

        if isinstance(exc, openai.AuthenticationError):
            return AIErrorClass.INVALID_KEY
        if isinstance(exc, openai.PermissionDeniedError):
            return AIErrorClass.INVALID_KEY
        if isinstance(exc, openai.RateLimitError):
            return AIErrorClass.RATE_LIMIT
        if isinstance(exc, openai.APITimeoutError):
            return AIErrorClass.TIMEOUT
        if isinstance(exc, openai.APIConnectionError):
            return AIErrorClass.PROVIDER_UNAVAILABLE
        if isinstance(exc, openai.InternalServerError):
            return AIErrorClass.PROVIDER_UNAVAILABLE
    except ImportError:
        pass  # SDK not installed; see docstring.

    # Anthropic mirror.
    try:
        import anthropic  # type: ignore

        if isinstance(exc, anthropic.AuthenticationError):
            return AIErrorClass.INVALID_KEY
        if isinstance(exc, anthropic.PermissionDeniedError):
            return AIErrorClass.INVALID_KEY
        if isinstance(exc, anthropic.RateLimitError):
            return AIErrorClass.RATE_LIMIT
        if isinstance(exc, anthropic.APITimeoutError):
            return AIErrorClass.TIMEOUT
        if isinstance(exc, anthropic.APIConnectionError):
            return AIErrorClass.PROVIDER_UNAVAILABLE
        if isinstance(exc, anthropic.InternalServerError):
            return AIErrorClass.PROVIDER_UNAVAILABLE
    except ImportError:
        pass  # SDK not installed; see docstring.

    # Google generative AI: google.api_core.exceptions covers most surface.
    try:
        from google.api_core import exceptions as gexc  # type: ignore

        if isinstance(exc, gexc.ResourceExhausted):
            # 429 with quota semantics on Google Cloud.
            msg_lower = str(exc).lower()
            if "quota" in msg_lower:
                return AIErrorClass.QUOTA_EXCEEDED
            return AIErrorClass.RATE_LIMIT
        if isinstance(exc, (gexc.Unauthenticated, gexc.PermissionDenied)):
            return AIErrorClass.INVALID_KEY
        if isinstance(exc, gexc.DeadlineExceeded):
            return AIErrorClass.TIMEOUT
        if isinstance(exc, gexc.ServiceUnavailable):
            return AIErrorClass.PROVIDER_UNAVAILABLE
        if isinstance(exc, gexc.InternalServerError):
            return AIErrorClass.PROVIDER_UNAVAILABLE
    except ImportError:
        pass  # SDK not installed; see docstring.

    # httpx timeout exceptions can leak through when an SDK doesn't
    # re-wrap them. Match the whole TimeoutException family.
    try:
        import httpx  # type: ignore

        if isinstance(exc, httpx.TimeoutException):
            return AIErrorClass.TIMEOUT
        if isinstance(exc, httpx.ConnectError):
            return AIErrorClass.PROVIDER_UNAVAILABLE
    except ImportError:
        pass  # SDK not installed; see docstring.

    # Standard library timeout (also caught by asyncio.wait_for). On Python
    # 3.11+ ``asyncio.TimeoutError`` is an alias for the builtin ``TimeoutError``,
    # so a single isinstance check covers both — listing both stays correct on
    # older runtimes without paying any cost on newer ones.
    if isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
        return AIErrorClass.TIMEOUT

    return None


def _classify_exception(exc: BaseException) -> "AIErrorClass":
    """Map a provider exception to a typed AIErrorClass.

    Resolution order:
        1. Already-typed ``AIProviderError`` — pass through.
        2. Class-based match against known SDK hierarchies (openai,
           anthropic, google.api_core, httpx). This is the resilient path.
        3. Name/module fallback for SDK shapes that aren't imported in the
           current environment but we can still recognize (defensive).
        4. Last-resort substring matching on the message — covers
           langchain wrapper exceptions (``ChatGoogleGenerativeAIError``)
           that don't expose a typed parent.

    Each layer is best-effort: import failures in (2) are silently skipped
    so a missing optional SDK never breaks classification of a known one.
    """
    if isinstance(exc, AIProviderError):
        return exc.error_class

    # Layer 2: SDK class hierarchy match.
    cls = _classify_by_exception_class(exc)
    if cls is not None:
        return cls

    # Layer 3: name/module fallback (covers SDKs not imported in the
    # current environment but identifiable by their class name).
    module = getattr(type(exc), "__module__", "") or ""
    name = type(exc).__name__

    if module.startswith("anthropic") or module.startswith("openai"):
        if name in ("AuthenticationError", "PermissionDeniedError"):
            return AIErrorClass.INVALID_KEY
        if name == "RateLimitError":
            return AIErrorClass.RATE_LIMIT
        if name == "APITimeoutError":
            return AIErrorClass.TIMEOUT
        if name in ("APIConnectionError", "InternalServerError"):
            return AIErrorClass.PROVIDER_UNAVAILABLE

    if (
        module.startswith("google.genai")
        or module.startswith("google.api_core")
        or "google_genai" in module
        or "google.genai" in module
    ):
        code = getattr(exc, "code", None)
        if code in (401, 403):
            return AIErrorClass.INVALID_KEY
        if code == 429:
            msg_lower = str(exc).lower()
            if "quota" in msg_lower:
                return AIErrorClass.QUOTA_EXCEEDED
            return AIErrorClass.RATE_LIMIT
        if code == 408:
            return AIErrorClass.TIMEOUT
        if isinstance(code, int) and code >= 500:
            return AIErrorClass.PROVIDER_UNAVAILABLE

    # Layer 4: last-resort substring heuristic. Covers wrapped/unknown
    # exceptions whose SDK module/name isn't recognized above (e.g.
    # ``ChatGoogleGenerativeAIError`` from langchain_google_genai).
    msg = str(exc).lower()
    if "resource_exhausted" in msg or "quota exceeded" in msg or "quota" in msg:
        return AIErrorClass.QUOTA_EXCEEDED
    if "rate limit" in msg or "too many requests" in msg or "429" in msg:
        return AIErrorClass.RATE_LIMIT
    if "api key" in msg or "authentication" in msg or "unauthorized" in msg:
        return AIErrorClass.INVALID_KEY
    if "timeout" in msg or "timed out" in msg:
        return AIErrorClass.TIMEOUT
    return AIErrorClass.UNKNOWN


def _redact_api_key(message: str, api_key: Optional[str]) -> str:
    """Replace literal API-key substrings with ``[REDACTED]``.

    Provider SDKs sometimes echo the key in error messages (e.g.
    ``"Invalid API key: sk-..."``). Strip it before the message reaches
    logs or the client. A no-op if ``api_key`` is missing/short — short
    keys would over-redact common substrings.
    """
    if not api_key or len(api_key) < 8:
        return message
    if api_key in message:
        return message.replace(api_key, "[REDACTED]")
    return message


def classify_and_wrap(
    exc: BaseException,
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
) -> AIProviderError:
    """Convert an arbitrary exception into a typed `AIProviderError`.

    Pass-through if `exc` is already typed. Otherwise classifies and returns
    the right subclass, preserving any Retry-After hint.

    When ``api_key`` is supplied, any literal occurrence of the key in the
    exception's message is redacted to ``[REDACTED]`` before being stamped
    on the typed error. This is defensive against provider SDKs that echo
    the key back in auth/permission errors.
    """
    if isinstance(exc, AIProviderError):
        return exc

    cls = _classify_exception(exc)
    retry_after = _extract_retry_after_s(exc)
    message = _redact_api_key(str(exc) or type(exc).__name__, api_key)

    if cls == AIErrorClass.TIMEOUT:
        return AIProviderTimeout(
            provider=provider or "unknown", elapsed_s=0.0, message=message
        )
    if cls == AIErrorClass.INVALID_KEY:
        return AIInvalidKey(message, provider=provider)
    if cls == AIErrorClass.RATE_LIMIT:
        return AIRateLimited(message, provider=provider, retry_after_s=retry_after)
    if cls == AIErrorClass.QUOTA_EXCEEDED:
        return AIQuotaExceeded(message, provider=provider)
    if cls == AIErrorClass.PROVIDER_UNAVAILABLE:
        return AIProviderUnavailable(message, provider=provider)
    if cls == AIErrorClass.INVALID_OUTPUT:
        return AIInvalidOutput(message, provider=provider)
    return AIProviderError(message, provider=provider)
