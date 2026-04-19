"""
LangChain provider factory.

Provides a unified interface to create chat models for:
- Gemini (Google)
- OpenAI
- Anthropic (Claude)

Supports dynamic model fetching from provider APIs when an API key is
available, with fallback to a hardcoded catalog.
"""

import logging
from typing import Optional, Literal

import httpx
from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)


# Supported AI provider identifiers.
# Each provider has different capabilities, pricing, and model options.
ProviderType = Literal["gemini", "openai", "claude"]

# Reasoning effort levels supported across providers.
EffortType = Literal["low", "medium", "high"]

# Anthropic: map effort to extended thinking budget_tokens
_ANTHROPIC_EFFORT_BUDGET = {
    "low": 2048,
    "medium": 8192,
    "high": 32768,
}

# OpenAI: map effort to reasoning_effort parameter (o-series models)
_OPENAI_EFFORT_MAP = {
    "low": "low",
    "medium": "medium",
    "high": "high",
}

# Google: map effort to thinking budget
_GEMINI_EFFORT_BUDGET = {
    "low": 2048,
    "medium": 8192,
    "high": 32768,
}

# Temperature for schema-constrained suggestion generation. Low values reduce
# churn in the validation/correction retry loop; higher variety is not useful
# when the output must match a Pydantic schema.
_SUGGESTION_TEMPERATURE = 0.2


# ============= Provider Factory =============

def get_chat_model(
    provider: ProviderType,
    api_key: str,
    model: str,
    effort: Optional[EffortType] = None,
    max_tokens: int = 4096
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
        return _create_gemini_model(api_key, model, effort, max_tokens)
    elif provider == "openai":
        return _create_openai_model(api_key, model, effort, max_tokens)
    elif provider == "claude":
        return _create_claude_model(api_key, model, effort, max_tokens)
    else:
        raise ValueError(f"Unsupported provider: {provider}. Use 'gemini', 'openai', or 'claude'")


def _create_gemini_model(
    api_key: str,
    model: str,
    effort: Optional[EffortType],
    max_tokens: int
) -> BaseChatModel:
    """Create a Google Gemini chat model instance.

    Args:
        api_key: Google AI API key.
        model: Model name (e.g. "gemini-2.0-flash").
        effort: Reasoning effort level or None.
        max_tokens: Maximum output tokens.

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
    )

    if effort:
        budget = _GEMINI_EFFORT_BUDGET[effort]
        kwargs["thinking"] = {"thinking_budget": budget}

    return ChatGoogleGenerativeAI(**kwargs)


def _create_openai_model(
    api_key: str,
    model: str,
    effort: Optional[EffortType],
    max_tokens: int
) -> BaseChatModel:
    """Create an OpenAI chat model instance.

    Args:
        api_key: OpenAI API key.
        model: Model name (e.g. "gpt-4o").
        effort: Reasoning effort level or None. Applied via reasoning_effort
            model kwarg for o-series models; ignored for GPT models.
        max_tokens: Maximum output tokens.

    Returns:
        Configured ChatOpenAI instance.
    """
    from langchain_openai import ChatOpenAI

    model_kwargs: dict = {}
    if effort:
        model_kwargs["reasoning_effort"] = _OPENAI_EFFORT_MAP[effort]

    return ChatOpenAI(
        model=model,
        api_key=api_key,
        temperature=_SUGGESTION_TEMPERATURE,
        max_tokens=max_tokens,
        model_kwargs=model_kwargs if model_kwargs else {},
    )


def _create_claude_model(
    api_key: str,
    model: str,
    effort: Optional[EffortType],
    max_tokens: int
) -> BaseChatModel:
    """Create an Anthropic Claude chat model instance.

    Args:
        api_key: Anthropic API key.
        model: Model name (e.g. "claude-sonnet-4-6").
        effort: Reasoning effort level or None. Enables extended thinking
            with a budget proportional to the effort level.
        max_tokens: Maximum output tokens.

    Returns:
        Configured ChatAnthropic instance.
    """
    from langchain_anthropic import ChatAnthropic

    kwargs: dict = dict(
        model=model,
        api_key=api_key,
        temperature=_SUGGESTION_TEMPERATURE,
        max_tokens=max_tokens,
    )

    if effort:
        budget = _ANTHROPIC_EFFORT_BUDGET[effort]
        # Claude 4+ uses adaptive thinking + output_config.effort; the older
        # {"type": "enabled", "budget_tokens": N} shape is rejected on these models.
        kwargs["thinking"] = {"type": "adaptive"}
        kwargs["model_kwargs"] = {"output_config": {"effort": effort}}
        # max_tokens must accommodate both thinking and output
        kwargs["max_tokens"] = max_tokens + budget
        # Anthropic rejects any temperature other than 1 when extended thinking is on.
        kwargs["temperature"] = 1

    return ChatAnthropic(**kwargs)


# ============= Structured Output =============

def get_structured_model(
    provider: ProviderType,
    api_key: str,
    output_schema: type,
    model: str,
    effort: Optional[EffortType] = None,
) -> BaseChatModel:
    """Create a chat model configured for structured JSON output.

    Wraps the base chat model with LangChain's ``with_structured_output``
    to ensure responses conform to a Pydantic schema.

    Args:
        provider: AI provider identifier.
        api_key: API key for authentication.
        output_schema: Pydantic model class defining the expected output
            structure.
        model: Model name to use.
        effort: Reasoning effort level or None.

    Returns:
        Chat model configured to produce structured output.
    """
    base_model = get_chat_model(
        provider=provider,
        api_key=api_key,
        model=model,
        effort=effort,
    )
    return base_model.with_structured_output(output_schema)




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
    async with httpx.AsyncClient() as client:
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
    async with httpx.AsyncClient() as client:
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

    async with httpx.AsyncClient() as client:
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

