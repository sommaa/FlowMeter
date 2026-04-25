"""
Typed error model for the AI suggestion pipeline.

Centralizes exception types and the enum used end-to-end (backend classifier
→ API response → frontend UX copy). Lives inside `ai_graph` so both the
graph nodes (which raise) and the service layer (which classifies) can
import without circular dependency on `ai_service`.
"""

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
