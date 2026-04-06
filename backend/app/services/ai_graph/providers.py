"""
LangChain provider factory.

Provides a unified interface to create chat models for:
- Gemini (Google)
- OpenAI
- Anthropic (Claude)
"""

from typing import Optional, Literal

from langchain_core.language_models import BaseChatModel


# Supported AI provider identifiers.
# Each provider has different capabilities, pricing, and model options.
ProviderType = Literal["gemini", "openai", "claude"]


# ============= Provider Factory =============

def get_chat_model(
    provider: ProviderType,
    api_key: str,
    model: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 4096
) -> BaseChatModel:
    """Create a LangChain chat model for the specified AI provider.

    Factory function that instantiates the appropriate LangChain chat model
    class based on the provider. Handles provider-specific configuration
    differences internally.

    Default models by provider:
        - gemini: gemini-3-flash
        - openai: gpt-5-2
        - claude: claude-sonnet-4-6-20260217

    Args:
        provider: AI provider identifier ("gemini", "openai", or "claude").
        api_key: API key for authenticating with the provider.
        model: Specific model name to use. If None, uses the provider's
            default model.
        temperature: Sampling temperature for generation (0.0-1.0).
            Lower values produce more deterministic output.
        max_tokens: Maximum tokens in the generated response.

    Returns:
        Configured BaseChatModel instance ready for invocation.

    Raises:
        ValueError: If the provider is not one of the supported types.

    Example:
        >>> model = get_chat_model("openai", api_key="sk-...", temperature=0.5)
        >>> response = model.invoke([HumanMessage(content="Hello")])
    """
    if provider == "gemini":
        return _create_gemini_model(api_key, model, temperature, max_tokens)
    elif provider == "openai":
        return _create_openai_model(api_key, model, temperature, max_tokens)
    elif provider == "claude":
        return _create_claude_model(api_key, model, temperature, max_tokens)
    else:
        raise ValueError(f"Unsupported provider: {provider}. Use 'gemini', 'openai', or 'claude'")


def _create_gemini_model(
    api_key: str,
    model: Optional[str],
    temperature: float,
    max_tokens: int
) -> BaseChatModel:
    """Create a Google Gemini chat model instance.

    Handles Gemini-specific configuration including the system message
    conversion quirk where system messages must be converted to human
    messages for proper handling.

    Args:
        api_key: Google AI API key.
        model: Model name or None for default (gemini-2.0-flash).
        temperature: Sampling temperature.
        max_tokens: Maximum output tokens.

    Returns:
        Configured ChatGoogleGenerativeAI instance.
    """
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=model or "gemini-3-flash",
        google_api_key=api_key,
        temperature=temperature,
        max_output_tokens=max_tokens,
        convert_system_message_to_human=True,  # Gemini quirk
    )


def _create_openai_model(
    api_key: str,
    model: Optional[str],
    temperature: float,
    max_tokens: int
) -> BaseChatModel:
    """Create an OpenAI chat model instance.

    Args:
        api_key: OpenAI API key.
        model: Model name or None for default (gpt-4o).
        temperature: Sampling temperature.
        max_tokens: Maximum output tokens.

    Returns:
        Configured ChatOpenAI instance.
    """
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=model or "gpt-5-2",
        api_key=api_key,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def _create_claude_model(
    api_key: str,
    model: Optional[str],
    temperature: float,
    max_tokens: int
) -> BaseChatModel:
    """Create an Anthropic Claude chat model instance.

    Args:
        api_key: Anthropic API key.
        model: Model name or None for default (claude-sonnet-4-20250514).
        temperature: Sampling temperature.
        max_tokens: Maximum output tokens.

    Returns:
        Configured ChatAnthropic instance.
    """
    from langchain_anthropic import ChatAnthropic

    return ChatAnthropic(
        model=model or "claude-sonnet-4-6",
        api_key=api_key,
        temperature=temperature,
        max_tokens=max_tokens,
    )


# ============= Structured Output =============

def get_structured_model(
    provider: ProviderType,
    api_key: str,
    output_schema: type,
    model: Optional[str] = None,
    temperature: float = 0.7
) -> BaseChatModel:
    """Create a chat model configured for structured JSON output.

    Wraps the base chat model with LangChain's ``with_structured_output``
    to ensure responses conform to a Pydantic schema. The underlying
    implementation uses the model's native JSON mode or function calling
    capabilities depending on provider support.

    Args:
        provider: AI provider identifier.
        api_key: API key for authentication.
        output_schema: Pydantic model class defining the expected output
            structure. The model will be constrained to produce valid JSON
            matching this schema.
        model: Specific model name or None for default.
        temperature: Sampling temperature for generation.

    Returns:
        Chat model configured to produce structured output that validates
        against the provided Pydantic schema.

    Example:
        >>> from pydantic import BaseModel
        >>> class Response(BaseModel):
        ...     answer: str
        ...     confidence: float
        >>> model = get_structured_model("openai", api_key, Response)
        >>> result = model.invoke([HumanMessage(content="What is 2+2?")])
        >>> result.answer
        "4"
    """
    base_model = get_chat_model(
        provider=provider,
        api_key=api_key,
        model=model,
        temperature=temperature,
    )

    # Configure structured output
    # This uses the model's native JSON mode or function calling
    return base_model.with_structured_output(output_schema)


# ============= Model Info =============

# Model catalog with metadata for each supported provider.
# Each model entry contains:
#   - id: API model identifier string
#   - name: Human-readable display name
#   - description: Brief description of model characteristics
#   - default: (optional) True if this is the default model for the provider
#
# Updated January 2026 - models are periodically refreshed as providers release updates.
MODELS = {
    "gemini": [
        {"id": "gemini-3-flash", "name": "Gemini 3 Flash", "description": "Fast, next-gen architecture", "default": True},
        {"id": "gemini-3-pro", "name": "Gemini 3 Pro", "description": "Most capable, large context"},
        {"id": "gemini-3-deep-think", "name": "Gemini 3 Deep Think", "description": "Advanced reasoning capabilities"},
        {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "description": "Previous best pro model"},
        {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", "description": "Legacy fast model"},
    ],
    "openai": [
        {"id": "gpt-5-2", "name": "GPT-5.2", "description": "Flagship, high intelligence", "default": True},
        {"id": "gpt-5-mini", "name": "GPT-5 Mini", "description": "Fast, cost-effective"},
        {"id": "gpt-5-3-codex", "name": "GPT-5.3 Codex", "description": "Optimized for coding & reasoning"},
        {"id": "o3-mini", "name": "o3 Mini", "description": "Advanced reasoning, legacy"},
        {"id": "gpt-4o", "name": "GPT-4o", "description": "Legacy multimodal model"},
    ],
    "claude": [
        {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6", "description": "Latest, state-of-the-art", "default": True},
        {"id": "claude-opus-4-6", "name": "Claude Opus 4.6", "description": "Maximum capability"},
        {"id": "claude-sonnet-4-5", "name": "Claude Sonnet 4.5", "description": "Previous generation"},
        {"id": "claude-haiku-4-5", "name": "Claude Haiku 4.5", "description": "Fast & efficient"},
    ],
}


def get_default_model(provider: ProviderType) -> str:
    """Get the default model identifier for a provider.

    Returns the model ID marked as default in the MODELS catalog,
    or the first model if none is marked as default.

    Args:
        provider: AI provider identifier.

    Returns:
        Model ID string for the default model, or empty string if
        the provider has no models configured.

    Example:
        >>> get_default_model("openai")
        "gpt-4o"
    """
    models = MODELS.get(provider, [])
    for model in models:
        if model.get("default"):
            return model["id"]
    return models[0]["id"] if models else ""


def get_available_models(provider: ProviderType) -> list[dict]:
    """Get the full list of available models for a provider with metadata.

    Returns model entries with display names and descriptions suitable
    for populating UI model selection dropdowns.

    Args:
        provider: AI provider identifier.

    Returns:
        List of model metadata dicts with keys: id, name, description,
        and optionally 'default'. Returns empty list for unknown providers.

    Example:
        >>> models = get_available_models("gemini")
        >>> models[0]
        {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", ...}
    """
    return MODELS.get(provider, [])


def get_model_ids(provider: ProviderType) -> list[str]:
    """Get the list of model ID strings for a provider.

    Convenience function that extracts just the model IDs without
    metadata, useful for validation or simple selection lists.

    Args:
        provider: AI provider identifier.

    Returns:
        List of model ID strings. Returns empty list for unknown providers.

    Example:
        >>> get_model_ids("claude")
        ["claude-sonnet-4-20250514", "claude-opus-4-20250514", ...]
    """
    return [m["id"] for m in MODELS.get(provider, [])]

