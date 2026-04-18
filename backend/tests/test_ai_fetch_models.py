"""Tests for dynamic model fetching from provider APIs."""

import pytest
import os
import sys
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.ai_graph.providers import (
    _fetch_openai_models,
    _fetch_anthropic_models,
    _fetch_gemini_models,
    fetch_provider_models,
)
from app.main import app


# ============= Mock HTTP helpers =============

def _mock_response(json_data: dict, status_code: int = 200):
    """Create a mock httpx.Response."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data
    resp.raise_for_status = MagicMock()
    if status_code >= 400:
        resp.raise_for_status.side_effect = Exception(f"HTTP {status_code}")
    return resp


# ============= OpenAI =============

class TestFetchOpenAIModels:

    SAMPLE_RESPONSE = {
        "data": [
            {"id": "gpt-4o", "owned_by": "openai"},
            {"id": "gpt-4o-mini", "owned_by": "openai"},
            {"id": "o3-mini", "owned_by": "openai"},
            {"id": "gpt-5", "owned_by": "openai"},
            # These should be excluded:
            {"id": "text-embedding-3-large", "owned_by": "openai"},
            {"id": "text-embedding-ada-002", "owned_by": "openai"},
            {"id": "dall-e-3", "owned_by": "openai"},
            {"id": "whisper-1", "owned_by": "openai"},
            {"id": "tts-1", "owned_by": "openai"},
            {"id": "tts-1-hd", "owned_by": "openai"},
            {"id": "davinci-002", "owned_by": "openai"},
            {"id": "babbage-002", "owned_by": "openai"},
            {"id": "ft:gpt-4o:my-org:custom:abc123", "owned_by": "user"},
            {"id": "text-moderation-latest", "owned_by": "openai"},
            {"id": "omni-moderation-latest", "owned_by": "openai"},
        ]
    }

    @pytest.mark.asyncio
    async def test_filters_non_chat_models(self):
        mock_resp = _mock_response(self.SAMPLE_RESPONSE)
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch("app.services.ai_graph.providers.httpx.AsyncClient", return_value=mock_client):
            models = await _fetch_openai_models("sk-test")

        model_ids = [m["id"] for m in models]
        # Chat models should be included
        assert "gpt-4o" in model_ids
        assert "gpt-4o-mini" in model_ids
        assert "o3-mini" in model_ids
        assert "gpt-5" in model_ids
        # Non-chat models should be excluded
        assert "text-embedding-3-large" not in model_ids
        assert "text-embedding-ada-002" not in model_ids
        assert "dall-e-3" not in model_ids
        assert "whisper-1" not in model_ids
        assert "tts-1" not in model_ids
        assert "tts-1-hd" not in model_ids
        assert "davinci-002" not in model_ids
        assert "babbage-002" not in model_ids
        assert "text-moderation-latest" not in model_ids
        assert "omni-moderation-latest" not in model_ids
        # Fine-tuned should be excluded
        assert not any("ft:" in mid for mid in model_ids)

    @pytest.mark.asyncio
    async def test_new_model_family_passes_through(self):
        """A hypothetical new model family should not be filtered out."""
        data = {
            "data": [
                {"id": "reasoning-pro-v2", "owned_by": "openai"},
                {"id": "nova-7b", "owned_by": "openai"},
            ]
        }
        mock_resp = _mock_response(data)
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch("app.services.ai_graph.providers.httpx.AsyncClient", return_value=mock_client):
            models = await _fetch_openai_models("sk-test")

        model_ids = [m["id"] for m in models]
        assert "reasoning-pro-v2" in model_ids
        assert "nova-7b" in model_ids

    @pytest.mark.asyncio
    async def test_models_are_sorted(self):
        data = {
            "data": [
                {"id": "gpt-5", "owned_by": "openai"},
                {"id": "gpt-4o", "owned_by": "openai"},
                {"id": "gpt-4o-mini", "owned_by": "openai"},
            ]
        }
        mock_resp = _mock_response(data)
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch("app.services.ai_graph.providers.httpx.AsyncClient", return_value=mock_client):
            models = await _fetch_openai_models("sk-test")

        ids = [m["id"] for m in models]
        assert ids == sorted(ids)

    @pytest.mark.asyncio
    async def test_sends_correct_auth_header(self):
        mock_resp = _mock_response({"data": []})
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch("app.services.ai_graph.providers.httpx.AsyncClient", return_value=mock_client):
            await _fetch_openai_models("sk-my-key")

        call_kwargs = mock_client.get.call_args
        assert call_kwargs.kwargs["headers"]["Authorization"] == "Bearer sk-my-key"


# ============= Anthropic =============

class TestFetchAnthropicModels:

    SAMPLE_RESPONSE = {
        "data": [
            {
                "id": "claude-sonnet-4-6-20260217",
                "display_name": "Claude Sonnet 4.6",
                "max_input_tokens": 200000,
                "max_tokens": 8192,
                "type": "model",
            },
            {
                "id": "claude-opus-4-6-20260217",
                "display_name": "Claude Opus 4.6",
                "max_input_tokens": 200000,
                "max_tokens": 8192,
                "type": "model",
            },
            {
                "id": "claude-haiku-4-5-20251001",
                "display_name": "Claude Haiku 4.5",
                "max_input_tokens": 200000,
                "max_tokens": 8192,
                "type": "model",
            },
        ],
        "has_more": False,
    }

    @pytest.mark.asyncio
    async def test_parses_models(self):
        mock_resp = _mock_response(self.SAMPLE_RESPONSE)
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch("app.services.ai_graph.providers.httpx.AsyncClient", return_value=mock_client):
            models = await _fetch_anthropic_models("sk-ant-test")

        assert len(models) == 3
        assert models[0]["id"] == "claude-sonnet-4-6-20260217"
        assert models[0]["name"] == "Claude Sonnet 4.6"
        assert "200000" in models[0]["description"]

    @pytest.mark.asyncio
    async def test_sends_correct_headers(self):
        mock_resp = _mock_response({"data": []})
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch("app.services.ai_graph.providers.httpx.AsyncClient", return_value=mock_client):
            await _fetch_anthropic_models("sk-ant-key")

        call_kwargs = mock_client.get.call_args
        headers = call_kwargs.kwargs["headers"]
        assert headers["x-api-key"] == "sk-ant-key"
        assert headers["anthropic-version"] == "2023-06-01"


# ============= Gemini =============

class TestFetchGeminiModels:

    SAMPLE_RESPONSE = {
        "models": [
            {
                "name": "models/gemini-2.0-flash",
                "displayName": "Gemini 2.0 Flash",
                "description": "Fast and versatile model",
                "supportedGenerationMethods": ["generateContent", "countTokens"],
            },
            {
                "name": "models/gemini-2.5-pro",
                "displayName": "Gemini 2.5 Pro",
                "description": "Advanced reasoning model",
                "supportedGenerationMethods": ["generateContent", "countTokens"],
            },
            {
                "name": "models/text-embedding-004",
                "displayName": "Text Embedding 004",
                "description": "Embedding model",
                "supportedGenerationMethods": ["embedContent"],
            },
            {
                "name": "models/aqa",
                "displayName": "Model for AQA",
                "description": "Attributed Question Answering",
                "supportedGenerationMethods": ["generateAnswer"],
            },
        ],
    }

    @pytest.mark.asyncio
    async def test_filters_to_generateContent_only(self):
        mock_resp = _mock_response(self.SAMPLE_RESPONSE)
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch("app.services.ai_graph.providers.httpx.AsyncClient", return_value=mock_client):
            models = await _fetch_gemini_models("gemini-key")

        model_ids = [m["id"] for m in models]
        assert "gemini-2.0-flash" in model_ids
        assert "gemini-2.5-pro" in model_ids
        # Embedding and AQA models should be excluded
        assert "text-embedding-004" not in model_ids
        assert "aqa" not in model_ids

    @pytest.mark.asyncio
    async def test_strips_models_prefix(self):
        mock_resp = _mock_response(self.SAMPLE_RESPONSE)
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch("app.services.ai_graph.providers.httpx.AsyncClient", return_value=mock_client):
            models = await _fetch_gemini_models("gemini-key")

        for m in models:
            assert not m["id"].startswith("models/")

    @pytest.mark.asyncio
    async def test_uses_display_name(self):
        mock_resp = _mock_response(self.SAMPLE_RESPONSE)
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch("app.services.ai_graph.providers.httpx.AsyncClient", return_value=mock_client):
            models = await _fetch_gemini_models("gemini-key")

        flash = next(m for m in models if m["id"] == "gemini-2.0-flash")
        assert flash["name"] == "Gemini 2.0 Flash"

    @pytest.mark.asyncio
    async def test_passes_api_key_as_query_param(self):
        mock_resp = _mock_response({"models": []})
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch("app.services.ai_graph.providers.httpx.AsyncClient", return_value=mock_client):
            await _fetch_gemini_models("my-gemini-key")

        call_kwargs = mock_client.get.call_args
        assert call_kwargs.kwargs["params"]["key"] == "my-gemini-key"

    @pytest.mark.asyncio
    async def test_handles_pagination(self):
        page1 = {
            "models": [
                {
                    "name": "models/gemini-2.0-flash",
                    "displayName": "Gemini 2.0 Flash",
                    "description": "Fast",
                    "supportedGenerationMethods": ["generateContent"],
                }
            ],
            "nextPageToken": "page2token",
        }
        page2 = {
            "models": [
                {
                    "name": "models/gemini-2.5-pro",
                    "displayName": "Gemini 2.5 Pro",
                    "description": "Pro",
                    "supportedGenerationMethods": ["generateContent"],
                }
            ],
        }
        resp1 = _mock_response(page1)
        resp2 = _mock_response(page2)

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=[resp1, resp2])

        with patch("app.services.ai_graph.providers.httpx.AsyncClient", return_value=mock_client):
            models = await _fetch_gemini_models("key")

        assert len(models) == 2
        assert mock_client.get.call_count == 2


# ============= fetch_provider_models (dispatcher) =============

class TestFetchProviderModels:

    @pytest.mark.asyncio
    async def test_returns_empty_on_error(self):
        """On API failure, returns empty list with error message."""
        with patch("app.services.ai_graph.providers._fetch_openai_models", side_effect=Exception("connection refused")):
            models, error = await fetch_provider_models("openai", "sk-test")

        assert error is not None
        assert "connection refused" in error
        assert models == []

    @pytest.mark.asyncio
    async def test_success_returns_no_error(self):
        live = [{"id": "gpt-5", "name": "gpt-5", "description": "new"}]
        with patch("app.services.ai_graph.providers._fetch_openai_models", return_value=live):
            models, error = await fetch_provider_models("openai", "sk-test")

        assert error is None
        assert models == live

    @pytest.mark.asyncio
    async def test_unknown_provider_returns_empty_with_error(self):
        models, error = await fetch_provider_models("unknown", "key")
        assert models == []
        assert error is not None


# ============= API endpoint =============

@pytest.fixture
def client():
    return TestClient(app)


class TestFetchModelsEndpoint:

    def test_invalid_provider(self, client):
        resp = client.post("/api/v1/ai/providers/invalid/models", json={"api_key": "test"})
        assert resp.status_code == 400

    def test_empty_api_key(self, client):
        resp = client.post("/api/v1/ai/providers/openai/models", json={"api_key": ""})
        assert resp.status_code == 400

    def test_missing_api_key(self, client):
        resp = client.post("/api/v1/ai/providers/openai/models", json={})
        assert resp.status_code == 422

    def test_success_with_mock(self, client):
        live = [{"id": "gpt-5", "name": "gpt-5", "description": "new"}]
        with patch("app.api.ai.fetch_provider_models", return_value=(live, None)):
            resp = client.post("/api/v1/ai/providers/openai/models", json={"api_key": "sk-test"})

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["data"]["fetched"] is True
        assert data["data"]["error"] is None
        assert len(data["data"]["models"]) == 1
        assert data["data"]["models"][0]["id"] == "gpt-5"

    def test_error_returns_empty_models(self, client):
        with patch("app.api.ai.fetch_provider_models", return_value=([], "timeout")):
            resp = client.post("/api/v1/ai/providers/openai/models", json={"api_key": "sk-test"})

        assert resp.status_code == 200
        data = resp.json()
        assert data["data"]["fetched"] is False
        assert data["data"]["error"] == "timeout"
        assert len(data["data"]["models"]) == 0
