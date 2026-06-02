"""
LangChain provider factory.

Provides a unified interface to create chat models for:
- Gemini (Google)
- OpenAI
- Anthropic (Claude)

Also exposes ``fetch_provider_models`` for live model-listing against each
provider's API. Failures return an empty list plus an error string — there
is no static fallback catalog.
"""

import logging
from typing import Optional, Literal, get_args

import httpx
from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)


# Supported AI provider identifiers.
# Each provider has different capabilities, pricing, and model options.
ProviderType = Literal["gemini", "openai", "claude"]

# Runtime tuple for membership checks at API/service boundaries. Derived
# from ``ProviderType`` so adding a provider only requires editing the
# Literal above — the constant updates automatically.
SUPPORTED_PROVIDERS: tuple[str, ...] = get_args(ProviderType)

# Reasoning effort levels supported across providers.
EffortType = Literal["low", "medium", "high"]

# Anthropic: map effort to extended thinking budget_tokens
_ANTHROPIC_EFFORT_BUDGET = {
    "low": 2048,
    "medium": 8192,
    "high": 32768,
}

# OpenAI accepts the same effort strings ("low"/"medium"/"high") as its
# ``reasoning_effort`` API parameter, so they pass through directly. The
# headroom map below sizes the output cap separately — reasoning tokens
# are still drawn from ``max_tokens``.

# Approximate ceiling on reasoning-token spend per effort level. With a
# non-trivial prompt plus tool-call context, reasoning can exhaust tens of
# thousands of tokens before the model emits message content — if the cap
# is too tight, the response contains only an internal reasoning block and
# no usable JSON.
_OPENAI_REASONING_HEADROOM = {
    "low": 4096,
    "medium": 16384,
    "high": 32768,
}

# Hard ceiling on the ``max_tokens`` parameter sent to any provider. Bounds
# worst-case cost when reasoning headroom + Anthropic thinking budget +
# large column lists push the per-request token cap into runaway territory.
# Headroom maps above are added on top of the caller's ``max_tokens``; this
# clamp is the final guardrail before the value reaches the SDK.
_GLOBAL_MAX_TOKENS = 16384


def _clamp_max_tokens(kwargs: dict, key: str) -> None:
    """Clamp ``kwargs[key]`` to :data:`_GLOBAL_MAX_TOKENS` in place.

    All three provider factories apply the same final guardrail after
    their effort-specific headroom math; this helper centralizes the
    clamp so the cap can be changed in one place and the call sites stay
    readable.
    """
    kwargs[key] = min(kwargs[key], _GLOBAL_MAX_TOKENS)


# Google: map effort to thinking budget
_GEMINI_EFFORT_BUDGET = {
    "low": 2048,
    "medium": 8192,
    "high": 32768,
}

# Gemini 3.x ("thinking") models charge thinking tokens against
# ``max_output_tokens``. Without explicit headroom the model spends most
# of the cap on its internal thinking phase and emits a TRUNCATED message
# — we've seen 70-second iter calls return only ~500 bytes of partial
# JSON. The headroom map mirrors the OpenAI reasoning-tier headroom: a
# medium-tier baseline whenever tools are bound (the agent loop always
# binds tools, and the prompt+tool-schema overhead inflates thinking
# spend) and an effort-proportional extra when ``effort`` is set.
_GEMINI_REASONING_HEADROOM = {
    "low": 4096,
    "medium": 16384,
    "high": 32768,
}

# Temperature for schema-constrained suggestion generation. Low values reduce
# churn in the validation/correction retry loop; higher variety is not useful
# when the output must match a Pydantic schema.
_SUGGESTION_TEMPERATURE = 0.2

# Per-call timeout (seconds) wrapping `ainvoke`. The default leaves room for
# one LangChain-level transient-error retry (max_retries=1 ≈ 60s per attempt).
# Reasoning and tool-bound paths use the longer ``_REASONING_TIMEOUT_S``.
_AINVOKE_TIMEOUT_S = 90.0
# Reasoning-tier requests amortize wall time over an internal thinking
# phase before the message is produced; the tool-bound path additionally
# carries the system prompt, tool schemas, and dataset metadata in every
# turn. Both can legitimately exceed the default budget, so they share a
# longer cap.
_REASONING_TIMEOUT_S = 180.0


def ainvoke_timeout_s(
    provider: ProviderType,
    effort: Optional[EffortType],
    tools_bound: bool = False,
) -> float:
    """Return the wall-clock timeout for a single `ainvoke` call.

    Two paths get the longer reasoning budget:

    1. ``effort`` is medium/high — every provider's reasoning path adds
       wall-clock time for the thinking phase before the message lands
       (Anthropic extended thinking, OpenAI ``reasoning_effort``, Gemini
       thinking budget).
    2. ``tools_bound=True`` — the agent-loop path binds the dataset-
       inspection tools, which inflates each request with the tool
       schemas + dataset metadata on top of the system prompt. The first
       turn in particular can take well over the default budget even
       when no explicit reasoning effort is requested.

    Other paths (metadata-only ``generate``, correction calls) keep the
    default — they make a single ``ainvoke`` against a much smaller prompt.
    """
    if effort in ("medium", "high"):
        return _REASONING_TIMEOUT_S
    if tools_bound:
        return _REASONING_TIMEOUT_S
    return _AINVOKE_TIMEOUT_S


# ============= Provider Factory =============

def get_chat_model(
    provider: ProviderType,
    api_key: str,
    model: str,
    effort: Optional[EffortType] = None,
    max_tokens: int = 4096,
    tools_bound: bool = False,
) -> BaseChatModel:
    """Create a LangChain chat model for the specified AI provider.

    Factory function that instantiates the appropriate LangChain chat model
    class based on the provider. Handles provider-specific configuration
    differences internally.

    Args:
        provider: AI provider identifier ("gemini", "openai", or "claude").
        api_key: API key for authenticating with the provider.
        model: Model name to use (e.g. "gpt-4o", "claude-sonnet-4-6").
        effort: Reasoning effort level. Maps to provider-specific thinking
            features (Anthropic extended thinking, OpenAI reasoning_effort,
            Gemini thinking budget). None means no extra reasoning.
        max_tokens: Maximum tokens in the generated response.
        tools_bound: When True, the caller intends to bind function tools
            to the returned model. Allocates the same per-call reasoning
            headroom that ``ainvoke_timeout_s(tools_bound=True)`` reserves
            for wall-clock — without it, an OpenAI reasoning-tier model
            with bound tools can still burn its message budget on the
            thinking phase. The clamp at ``_GLOBAL_MAX_TOKENS`` still
            bounds total spend.

    Returns:
        Configured BaseChatModel instance ready for invocation.

    Raises:
        ValueError: If the provider is not one of the supported types,
            or if model is not provided.

    Example:
        >>> model = get_chat_model("openai", api_key="sk-...", model="gpt-4o", effort="high")
        >>> response = model.invoke([HumanMessage(content="Hello")])
    """
    if not model:
        raise ValueError("A model must be selected. Fetch available models from the provider first.")
    if provider == "gemini":
        return _create_gemini_model(api_key, model, effort, max_tokens, tools_bound)
    elif provider == "openai":
        return _create_openai_model(api_key, model, effort, max_tokens, tools_bound)
    elif provider == "claude":
        return _create_claude_model(api_key, model, effort, max_tokens, tools_bound)
    else:
        raise ValueError(f"Unsupported provider: {provider}. Use 'gemini', 'openai', or 'claude'")


def _create_gemini_model(
    api_key: str,
    model: str,
    effort: Optional[EffortType],
    max_tokens: int,
    tools_bound: bool = False,
) -> BaseChatModel:
    """Create a Google Gemini chat model instance.

    Args:
        api_key: Google AI API key.
        model: Model name.
        effort: Reasoning effort level or None. Sets the explicit
            ``thinking_budget`` and adds reasoning headroom to the output cap.
        max_tokens: Maximum output tokens (before headroom).
        tools_bound: When True, applies the medium-tier reasoning headroom
            unconditionally — Gemini 3.x thinking models charge thinking
            tokens against ``max_output_tokens`` and the tool-bound path
            adds the dataset metadata + tool schemas to every turn. Without
            this, the model truncates its final-answer message mid-emission.

    Returns:
        Configured ChatGoogleGenerativeAI instance.
    """
    from langchain_google_genai import ChatGoogleGenerativeAI

    kwargs: dict = dict(
        model=model,
        google_api_key=api_key,
        temperature=_SUGGESTION_TEMPERATURE,
        max_output_tokens=max_tokens,
        convert_system_message_to_human=True,
        max_retries=1,
    )

    if effort:
        # ``thinking_budget`` is the top-level integer field on the wrapper;
        # nesting it inside another kwarg gets silently shunted into
        # ``model_kwargs`` and never reaches the API.
        kwargs["thinking_budget"] = _GEMINI_EFFORT_BUDGET[effort]
        # Reserve enough output room for the message to land after thinking.
        kwargs["max_output_tokens"] = max_tokens + _GEMINI_REASONING_HEADROOM[effort]
    elif tools_bound:
        # No explicit effort but tools are bound — Gemini 3.x thinks by
        # default and the tool-bound prompt is bigger. Apply medium-tier
        # headroom so the agent's final emission isn't truncated.
        kwargs["max_output_tokens"] = max_tokens + _GEMINI_REASONING_HEADROOM["medium"]

    # Final cost guardrail regardless of the headroom math above.
    _clamp_max_tokens(kwargs, "max_output_tokens")

    return ChatGoogleGenerativeAI(**kwargs)


def _openai_supports_reasoning_effort(model: str) -> bool:
    """Return True if ``model`` accepts the ``reasoning_effort`` API parameter.

    Only OpenAI reasoning-tier models accept this kwarg; sending it to a
    standard chat model returns ``400 Unrecognized request argument supplied:
    reasoning_effort``. Pattern-matching by name family (``o1``/``o3``/``o4``
    prefix or any ``gpt-5`` variant) is the documented convention.
    """
    m = (model or "").lower()
    return (
        m.startswith("o1")
        or m.startswith("o3")
        or m.startswith("o4")
        or m.startswith("gpt-5")
    )


def _create_openai_model(
    api_key: str,
    model: str,
    effort: Optional[EffortType],
    max_tokens: int,
    tools_bound: bool = False,
) -> BaseChatModel:
    """Create an OpenAI chat model instance.

    Args:
        api_key: OpenAI API key.
        model: Model name.
        effort: Reasoning effort level or None. Applied via the
            ``reasoning_effort`` kwarg for reasoning-tier models; silently
            ignored for standard chat models that would reject the kwarg.
        max_tokens: Maximum output tokens.

    Returns:
        Configured ChatOpenAI instance.
    """
    from langchain_openai import ChatOpenAI

    # ``reasoning_effort`` is a top-level Pydantic field on ChatOpenAI;
    # passing it via ``model_kwargs`` triggers a wrapper warning and may
    # not be forwarded reliably across versions. Pass it directly when the
    # model accepts it.
    kwargs: dict = dict(
        model=model,
        api_key=api_key,
        temperature=_SUGGESTION_TEMPERATURE,
        max_tokens=max_tokens,
        max_retries=1,
    )
    if effort and _openai_supports_reasoning_effort(model):
        kwargs["reasoning_effort"] = effort
        # Reasoning-tier models with bound function tools require the
        # Responses API; the legacy Chat Completions endpoint rejects the
        # combination. The Responses API is the recommended path for
        # reasoning models in any case.
        kwargs["use_responses_api"] = True
        # Reasoning tokens are drawn from ``max_tokens``. With the default
        # cap, the model can exhaust the budget on the thinking phase and
        # return only an internal reasoning block with no message content,
        # leaving the JSON parser nothing to work with. Add headroom so the
        # message has room to land.
        kwargs["max_tokens"] = max_tokens + _OPENAI_REASONING_HEADROOM[effort]
    elif tools_bound and _openai_supports_reasoning_effort(model):
        # Reasoning-tier models default to "medium" effort even without an
        # explicit ``reasoning_effort`` kwarg, and the tool-bound path adds
        # the dataset metadata + tool schemas to every turn. Reserve the
        # same medium-tier headroom so the message content has room to
        # land on the unbound forced-final call too. The Responses API is
        # required for the bound case.
        kwargs["use_responses_api"] = True
        kwargs["max_tokens"] = max_tokens + _OPENAI_REASONING_HEADROOM["medium"]

    # Final cost guardrail regardless of how the effort headroom math
    # turned out above.
    _clamp_max_tokens(kwargs, "max_tokens")

    return ChatOpenAI(**kwargs)


def _create_claude_model(
    api_key: str,
    model: str,
    effort: Optional[EffortType],
    max_tokens: int,
    tools_bound: bool = False,
) -> BaseChatModel:
    """Create an Anthropic Claude chat model instance.

    Args:
        api_key: Anthropic API key.
        model: Model name.
        effort: Reasoning effort level or None. Enables extended thinking
            with a budget proportional to the effort level.
        max_tokens: Maximum output tokens.

    Returns:
        Configured ChatAnthropic instance.
    """
    from langchain_anthropic import ChatAnthropic

    # ``temperature`` is deliberately omitted. Newer Anthropic models reject
    # it (the API returns ``temperature is deprecated for this model``), and
    # the extended-thinking path already pins temperature internally — so the
    # parameter brings no upside and breaks the correction call against
    # newer model versions.
    kwargs: dict = dict(
        model=model,
        api_key=api_key,
        max_tokens=max_tokens,
        max_retries=1,
    )

    if effort:
        budget = _ANTHROPIC_EFFORT_BUDGET[effort]
        # Adaptive thinking + ``output_config.effort`` is the current shape.
        # The older ``{"type": "enabled", "budget_tokens": N}`` form is
        # rejected by recent model versions.
        kwargs["thinking"] = {"type": "adaptive"}
        kwargs["model_kwargs"] = {"output_config": {"effort": effort}}
        # max_tokens must accommodate both thinking and output.
        kwargs["max_tokens"] = max_tokens + budget

    # Final cost guardrail, after the thinking-budget bump.
    _clamp_max_tokens(kwargs, "max_tokens")

    return ChatAnthropic(**kwargs)


# ============= Dynamic Model Fetching =============

_FETCH_TIMEOUT = 10.0

# OpenAI model prefixes that are known to NOT be chat/reasoning models.
# New chat model families (gpt-6, o5, etc.) pass through automatically.
_OPENAI_NON_CHAT_PREFIXES = (
    "text-embedding-", "dall-e-", "whisper-", "tts-",
    "davinci-", "babbage-", "curie-", "ada-",
    "text-moderation-", "omni-moderation-",
)


async def _fetch_openai_models(api_key: str) -> list[dict]:
    """Fetch available chat models from the OpenAI API.

    Uses a negative filter: excludes known non-chat model families
    (embeddings, TTS, DALL-E, whisper, legacy completions, moderation,
    fine-tuned models) so that new chat/reasoning families appear
    automatically.
    """
    async with httpx.AsyncClient(timeout=_FETCH_TIMEOUT) as client:
        resp = await client.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=_FETCH_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()

    models = []
    for m in data.get("data", []):
        mid = m["id"]
        # Exclude fine-tuned models
        if mid.startswith("ft:"):
            continue
        # Exclude known non-chat model families
        if any(mid.startswith(p) for p in _OPENAI_NON_CHAT_PREFIXES):
            continue

        models.append({
            "id": mid,
            "name": mid,
            "description": f"Owned by {m.get('owned_by', 'openai')}",
        })

    models.sort(key=lambda x: x["id"])
    return models


async def _fetch_anthropic_models(api_key: str) -> list[dict]:
    """Fetch available models from the Anthropic API.

    Uses a high limit to avoid pagination for the typical model count.
    """
    async with httpx.AsyncClient(timeout=_FETCH_TIMEOUT) as client:
        resp = await client.get(
            "https://api.anthropic.com/v1/models",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
            params={"limit": 100},
            timeout=_FETCH_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()

    models = []
    for m in data.get("data", []):
        models.append({
            "id": m["id"],
            "name": m.get("display_name", m["id"]),
            "description": f"Context: {m.get('max_input_tokens', 'N/A')} tokens",
        })

    return models


async def _fetch_gemini_models(api_key: str) -> list[dict]:
    """Fetch available generative models from the Google Gemini API.

    Only includes models that support the ``generateContent`` method.
    Paginates through all pages if needed.
    """
    all_raw: list[dict] = []
    params: dict = {"key": api_key, "pageSize": 100}

    async with httpx.AsyncClient(timeout=_FETCH_TIMEOUT) as client:
        while True:
            resp = await client.get(
                "https://generativelanguage.googleapis.com/v1beta/models",
                params=params,
                timeout=_FETCH_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            all_raw.extend(data.get("models", []))

            next_token = data.get("nextPageToken")
            if not next_token:
                break
            params["pageToken"] = next_token

    models = []
    for m in all_raw:
        methods = m.get("supportedGenerationMethods", [])
        if "generateContent" not in methods:
            continue

        model_id = m["name"].removeprefix("models/")
        models.append({
            "id": model_id,
            "name": m.get("displayName", model_id),
            "description": m.get("description", "")[:120],
        })

    return models


async def fetch_provider_models(
    provider: ProviderType, api_key: str
) -> tuple[list[dict], str | None]:
    """Fetch models dynamically from a provider's API.

    Calls the provider's model-listing endpoint using the supplied API key
    and returns a formatted list.

    Args:
        provider: AI provider identifier.
        api_key: API key for authenticating with the provider.

    Returns:
        Tuple of (models list, error message or None).
        On failure the models list is empty and error contains the reason.
    """
    fetchers = {
        "openai": _fetch_openai_models,
        "gemini": _fetch_gemini_models,
        "claude": _fetch_anthropic_models,
    }

    fetcher = fetchers.get(provider)
    if not fetcher:
        return [], f"Unknown provider: {provider}"

    try:
        models = await fetcher(api_key)
        return models, None
    except Exception as e:
        logger.warning("Failed to fetch models from %s: %s", provider, e)
        return [], str(e)

