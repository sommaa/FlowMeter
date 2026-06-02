"""Streaming invoke + transient-retry helpers for the AI workflow.

Extracted from ``graph.py`` so the workflow module stays focused on
state-machine nodes. Public helpers (``_ainvoke_streaming``,
``_call_model``, ``_build_messages``, ``_log_cache_usage``) and the
transient-retry constants are re-exported from ``graph`` for backward
compatibility with existing imports.
"""

import asyncio
import logging
import time
from typing import Any, Optional

from .errors import AIProviderError, AIProviderTimeout, classify_and_wrap
from ..ai_metrics import extract_usage

logger = logging.getLogger(__name__)


async def _ainvoke_streaming(model, messages, *, idle_timeout_s: float):
    """Invoke a chat model with a *progress-aware* timeout.

    Wraps ``model.astream`` and waits up to ``idle_timeout_s`` for each
    successive chunk. As long as the model keeps producing output —
    streamed text, reasoning blocks, tool-call deltas — the call
    continues. Only a true stall (no chunk for ``idle_timeout_s``)
    raises ``asyncio.TimeoutError``.

    The previous implementation wrapped ``ainvoke`` in a single
    ``asyncio.wait_for`` with a fixed wall-clock cap. That meant a
    long-but-still-progressing response was killed mid-stream simply
    because total wall time exceeded the cap. The streaming variant
    distinguishes "model is working" from "model has stalled," which
    matches what the user actually wants from the timeout.

    Returns the final accumulated message (chunks concatenated). The
    accumulated form carries the full ``tool_calls`` list, complete
    ``content``, and ``usage_metadata`` — the same surface the caller
    saw with ``ainvoke``.

    Raises ``asyncio.TimeoutError`` if no chunk arrives within
    ``idle_timeout_s``. The caller is expected to translate that into
    ``AIProviderTimeout`` with appropriate context.

    Resource cleanup: the underlying async iterator is closed in a
    ``finally`` block on every exit path — normal completion, timeout,
    or :class:`asyncio.CancelledError` (raised on client disconnect).
    Without this, a cancelled request leaves the upstream HTTP stream
    open and the provider keeps emitting (and billing for) tokens until
    its own timeout fires.
    """
    final = None
    stream = model.astream(messages).__aiter__()
    try:
        while True:
            try:
                chunk = await asyncio.wait_for(
                    stream.__anext__(), timeout=idle_timeout_s
                )
            except StopAsyncIteration:
                break
            final = chunk if final is None else final + chunk
    finally:
        aclose = getattr(stream, "aclose", None)
        if callable(aclose):
            try:
                await aclose()
            except Exception:
                # Cleanup is best-effort — never mask the original exception
                # (CancelledError, TimeoutError, …) with a teardown failure.
                pass
    if final is None:
        # The provider returned no chunks at all. Treat as an empty/invalid
        # output rather than letting the caller dereference None.
        raise RuntimeError("model.astream returned no chunks")
    return final


# Bounds for the in-flight transient-error retry. ``_TRANSIENT_BACKOFF_CAP_S``
# clamps how long we're willing to wait between attempts even if the provider
# sent a generous ``retry-after`` header — a malicious or buggy header
# shouldn't be able to park the request indefinitely.
_TRANSIENT_RETRY_MAX_ATTEMPTS = 2  # one extra attempt after the first failure
_TRANSIENT_BACKOFF_CAP_S = 10.0
_TRANSIENT_BACKOFF_BASE_S = 2.0


async def _call_model(
    model,
    messages,
    *,
    provider: str,
    api_key: Optional[str],
    idle_timeout_s: float,
) -> Any:
    """Invoke a chat model with the standard reliability policy.

    Combines four behaviors so call sites in the graph don't repeat them:

    1. Progress-aware streaming via :func:`_ainvoke_streaming`.
    2. ``asyncio.TimeoutError`` → :class:`AIProviderTimeout` with elapsed
       wall time. Not retried — a timeout means the model itself stalled,
       and another attempt is likely to stall the same way.
    3. Other exceptions are classified via :func:`classify_and_wrap`
       (with API-key redaction). Any literal occurrence of ``api_key`` in
       the resulting message is replaced with ``[REDACTED]``.
    4. **Transient** typed errors (``retry_advised=True`` — currently
       ``rate_limit`` and ``provider_unavailable``) get one retry with
       exponential backoff. ``retry_after_s`` from the provider response
       is honored when present, clamped to :data:`_TRANSIENT_BACKOFF_CAP_S`.
       Auth/quota/invalid-output errors do NOT retry — they're permanent
       within the request window.

    Why a wrapper instead of bumping the SDK's internal retry count: the
    SDK retries are opaque and uniform across error types. We want
    visibility (log lines per attempt), error-class-aware policy
    (don't retry auth failures), and to keep the *tool-call history*
    in ``messages`` intact when an agent-loop iteration's call fails —
    losing 30+ seconds of multi-turn context to a single 503 is a poor
    experience the SDK can't fix without seeing our state.
    """
    last_typed_exc: Optional[AIProviderError] = None
    last_cause: Optional[BaseException] = None
    for attempt in range(1, _TRANSIENT_RETRY_MAX_ATTEMPTS + 1):
        _call_start = time.monotonic()
        try:
            return await _ainvoke_streaming(
                model, messages, idle_timeout_s=idle_timeout_s
            )
        except asyncio.TimeoutError as te:
            # Idle-stall timeout. Don't retry: the model stopped emitting
            # chunks, another attempt is likely to repeat the stall.
            elapsed = time.monotonic() - _call_start
            raise AIProviderTimeout(
                provider=provider, elapsed_s=elapsed
            ) from te
        except AIProviderError as exc:
            # Already-typed (e.g. raised by a tool helper). Honor its
            # retry hint just like a freshly classified one.
            typed = exc
            last_cause = exc
        except Exception as exc:
            typed = classify_and_wrap(
                exc, provider=provider, api_key=api_key
            )
            last_cause = exc

        last_typed_exc = typed
        if not typed.retry_advised or attempt >= _TRANSIENT_RETRY_MAX_ATTEMPTS:
            # Either the error isn't transient or we've used our budget.
            # Propagate as typed so the API layer maps to the right status.
            raise typed from last_cause

        # Respect the provider's retry-after hint when supplied; otherwise
        # exponential backoff from the base. Always clamp to the cap so a
        # malicious header can't stall the request indefinitely.
        backoff_s = min(
            typed.retry_after_s
            if typed.retry_after_s and typed.retry_after_s > 0
            else _TRANSIENT_BACKOFF_BASE_S * (2 ** (attempt - 1)),
            _TRANSIENT_BACKOFF_CAP_S,
        )
        logger.warning(
            "Provider returned transient '%s' (attempt %d/%d); "
            "retrying in %.1fs",
            typed.error_class.value,
            attempt,
            _TRANSIENT_RETRY_MAX_ATTEMPTS,
            backoff_s,
        )
        await asyncio.sleep(backoff_s)
    # Unreachable: the loop either returns a response or raises above.
    # Guard anyway for readability — if a future edit slips, we don't
    # silently fall through with ``None``.
    assert last_typed_exc is not None
    raise last_typed_exc from last_cause


def _build_messages(system_prompt: str, user_prompt: str, provider: str) -> list[dict]:
    """Build the LLM message array with provider-specific optimizations.

    For Claude, wraps the system prompt in a content block with
    ``cache_control: {"type": "ephemeral"}`` so Anthropic caches the
    system prompt for ~5 minutes. The system prompt is ~3-4k tokens and
    identical across requests, so cache hits reduce input-token cost by
    roughly 90%. Other providers get plain string content.
    """
    if provider == "claude":
        system_content = [
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ]
    else:
        system_content = system_prompt
    return [
        {"role": "system", "content": system_content},
        {"role": "user", "content": user_prompt},
    ]


def _log_cache_usage(response, provider: str) -> dict:
    """Extract normalized token usage from a chat response and log cache hits.

    Returns a dict with ``input_tokens``, ``output_tokens``, ``cache_read_tokens``,
    ``cache_creation_tokens`` (zeros for missing fields) so the caller can
    feed it into the AIMetrics ring. Claude prompt-cache counters are still
    logged at INFO when non-zero for human-readable debugging.
    """
    usage = extract_usage(response, provider)
    if provider == "claude" and (usage["cache_read_tokens"] or usage["cache_creation_tokens"]):
        logger.info(
            "Anthropic prompt cache: created=%s, read=%s",
            usage["cache_creation_tokens"],
            usage["cache_read_tokens"],
        )
    return usage
