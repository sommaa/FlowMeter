"""Tests for backend/app/api/ai.py - AI API endpoints."""

import pytest
import os
import sys
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


class TestListProviders:
    """Tests for GET /api/v1/ai/providers."""

    def test_list_providers(self, client):
        mock_service = MagicMock()
        mock_service.get_available_providers.return_value = [
            {"id": "openai", "name": "OpenAI", "models": ["gpt-4"]},
        ]
        with patch("app.api.ai.get_ai_service", return_value=mock_service):
            response = client.get("/api/v1/ai/providers")
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert len(data["data"]) >= 1


class TestSuggestVisualizationsValidation:
    """Tests for POST /api/v1/ai/suggest validation."""

    def test_suggest_dataset_not_found(self, client):
        payload = {
            "dataset_id": "nonexistent",
            "provider": "openai",
            "api_key": "sk-test",
            "model": "gpt-4o",
            "column_descriptions": {},
            "guidance_text": "analyze this",
        }
        response = client.post("/api/v1/ai/suggest", json=payload)
        assert response.status_code == 404

    def test_suggest_invalid_provider(self, client):
        mock_data_service = MagicMock()
        mock_meta = MagicMock()
        mock_meta.column_names = ["x"]
        mock_meta.numeric_columns = ["x"]
        mock_meta.datetime_columns = []
        mock_data_service.get_metadata.return_value = mock_meta

        with patch("app.api.ai.get_data_service", return_value=mock_data_service):
            payload = {
                "dataset_id": "ds1",
                "provider": "invalid_provider",
                "api_key": "sk-test",
                "model": "gpt-4o",
                "column_descriptions": {"x": "variable"},
                "guidance_text": "analyze this",
            }
            response = client.post("/api/v1/ai/suggest", json=payload)
            assert response.status_code == 400
            assert "Invalid provider" in response.json()["detail"]

    def test_suggest_empty_api_key(self, client):
        mock_data_service = MagicMock()
        mock_meta = MagicMock()
        mock_meta.column_names = ["x"]
        mock_data_service.get_metadata.return_value = mock_meta

        with patch("app.api.ai.get_data_service", return_value=mock_data_service):
            payload = {
                "dataset_id": "ds1",
                "provider": "openai",
                "api_key": "",
                "model": "gpt-4o",
                "column_descriptions": {"x": "var"},
                "guidance_text": "test",
            }
            response = client.post("/api/v1/ai/suggest", json=payload)
            assert response.status_code == 400
            assert "API key" in response.json()["detail"]


class TestSuggestLengthCaps:
    """Tests for Pydantic length caps on SuggestRequest."""

    def test_guidance_length_rejected(self, client):
        payload = {
            "dataset_id": "ds1",
            "provider": "openai",
            "api_key": "sk-test",
            "model": "gpt-4o",
            "column_descriptions": {"x": "var"},
            "guidance_text": "A" * 3000,
        }
        response = client.post("/api/v1/ai/suggest", json=payload)
        assert response.status_code == 422
        body = response.json()
        assert any("guidance_text" in str(e.get("loc", "")) for e in body["detail"])

    def test_column_description_value_length_rejected(self, client):
        payload = {
            "dataset_id": "ds1",
            "provider": "openai",
            "api_key": "sk-test",
            "model": "gpt-4o",
            "column_descriptions": {"x": "A" * 600},
            "guidance_text": "analyze",
        }
        response = client.post("/api/v1/ai/suggest", json=payload)
        assert response.status_code == 422

    def test_too_many_columns_rejected(self, client):
        payload = {
            "dataset_id": "ds1",
            "provider": "openai",
            "api_key": "sk-test",
            "model": "gpt-4o",
            "column_descriptions": {f"c{i}": "v" for i in range(250)},
            "guidance_text": "analyze",
        }
        response = client.post("/api/v1/ai/suggest", json=payload)
        assert response.status_code == 422


class TestGenerateFormulaValidation:
    """Tests for POST /api/v1/ai/generate-formula validation."""

    def test_invalid_provider(self, client):
        payload = {
            "provider": "invalid",
            "api_key": "key",
            "model": "gpt-4o",
            "columns": [{"name": "x", "description": "var", "data_type": "numeric"}],
            "description": "compute something",
        }
        response = client.post("/api/v1/ai/generate-formula", json=payload)
        assert response.status_code == 400

    def test_empty_description(self, client):
        payload = {
            "provider": "openai",
            "api_key": "key",
            "model": "gpt-4o",
            "columns": [{"name": "x", "description": "var", "data_type": "numeric"}],
            "description": "",
        }
        response = client.post("/api/v1/ai/generate-formula", json=payload)
        assert response.status_code == 400

    def test_no_columns(self, client):
        payload = {
            "provider": "openai",
            "api_key": "key",
            "model": "gpt-4o",
            "columns": [],
            "description": "compute something",
        }
        response = client.post("/api/v1/ai/generate-formula", json=payload)
        assert response.status_code == 400


class TestApplySuggestions:
    """Tests for POST /api/v1/ai/apply-suggestions."""

    def test_apply_empty_suggestions(self, client):
        mock_service = MagicMock()
        with patch("app.api.ai.get_ai_service", return_value=mock_service):
            payload = {"suggestions": []}
            response = client.post("/api/v1/ai/apply-suggestions", json=payload)
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["data"]["converted_count"] == 0


class TestSuggestTypedErrors:
    """Typed AIProviderError -> structured error response shape."""

    def _valid_payload(self):
        return {
            "dataset_id": "ds1",
            "provider": "openai",
            "api_key": "sk-test",
            "model": "gpt-4o",
            "column_descriptions": {"x": "var"},
            "guidance_text": "analyze",
        }

    def _mock_dataset(self):
        mock_data_service = MagicMock()
        mock_meta = MagicMock()
        mock_meta.column_names = ["x"]
        mock_meta.numeric_columns = ["x"]
        mock_meta.datetime_columns = []
        mock_data_service.get_metadata.return_value = mock_meta
        mock_data_service.get_statistics.return_value = []
        return mock_data_service

    def test_invalid_key_returns_401_with_error_class(self, client):
        from app.services.ai_graph import AIInvalidKey
        mock_ai = MagicMock()
        mock_ai.suggest_visualizations.side_effect = AIInvalidKey("bad key", provider="openai")

        with patch("app.api.ai.get_data_service", return_value=self._mock_dataset()), \
             patch("app.api.ai.get_ai_service", return_value=mock_ai):
            response = client.post("/api/v1/ai/suggest", json=self._valid_payload())

        assert response.status_code == 401
        detail = response.json()["detail"]
        assert detail["error_class"] == "invalid_key"
        assert detail["provider"] == "openai"

    def test_rate_limit_returns_429_with_retry_after(self, client):
        from app.services.ai_graph import AIRateLimited
        mock_ai = MagicMock()
        mock_ai.suggest_visualizations.side_effect = AIRateLimited(
            "slow down", provider="openai", retry_after_s=45.0
        )

        with patch("app.api.ai.get_data_service", return_value=self._mock_dataset()), \
             patch("app.api.ai.get_ai_service", return_value=mock_ai):
            response = client.post("/api/v1/ai/suggest", json=self._valid_payload())

        assert response.status_code == 429
        detail = response.json()["detail"]
        assert detail["error_class"] == "rate_limit"
        assert detail["retry_advised"] is True
        assert detail["retry_after_s"] == 45.0

    def test_timeout_returns_504(self, client):
        from app.services.ai_graph import AIProviderTimeout
        mock_ai = MagicMock()
        mock_ai.suggest_visualizations.side_effect = AIProviderTimeout(
            provider="claude", elapsed_s=91.2
        )

        with patch("app.api.ai.get_data_service", return_value=self._mock_dataset()), \
             patch("app.api.ai.get_ai_service", return_value=mock_ai):
            response = client.post("/api/v1/ai/suggest", json=self._valid_payload())

        assert response.status_code == 504
        detail = response.json()["detail"]
        assert detail["error_class"] == "timeout"
        assert detail["provider"] == "claude"

    def test_unknown_error_mapped_to_500(self, client):
        mock_ai = MagicMock()
        mock_ai.suggest_visualizations.side_effect = RuntimeError("mystery crash")

        with patch("app.api.ai.get_data_service", return_value=self._mock_dataset()), \
             patch("app.api.ai.get_ai_service", return_value=mock_ai):
            response = client.post("/api/v1/ai/suggest", json=self._valid_payload())

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert detail["error_class"] == "unknown"

    def test_unauthorized_string_classified_as_invalid_key(self, client):
        """Fallback path: raw Exception with 'unauthorized' substring routes to 401."""
        mock_ai = MagicMock()
        mock_ai.suggest_visualizations.side_effect = Exception("unauthorized: check your key")

        with patch("app.api.ai.get_data_service", return_value=self._mock_dataset()), \
             patch("app.api.ai.get_ai_service", return_value=mock_ai):
            response = client.post("/api/v1/ai/suggest", json=self._valid_payload())

        assert response.status_code == 401
        assert response.json()["detail"]["error_class"] == "invalid_key"


class TestMetricsEndpoint:
    """Tests for GET /api/v1/ai/metrics."""

    def test_metrics_returns_shape_when_empty(self, client):
        from app.services.ai_metrics import get_collector
        get_collector().clear()
        response = client.get("/api/v1/ai/metrics")
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["records"] == []
        agg = body["data"]["aggregates"]
        assert agg["count"] == 0
        assert agg["success_rate"] == 0.0
        assert agg["by_provider"] == {}
        assert agg["total_cost_usd"] is None

    def test_metrics_returns_aggregates(self, client, monkeypatch):
        import asyncio
        from app.services import ai_metrics
        from app.services.ai_metrics import get_collector, AIMetricsRecord
        # Pin pricing so the test doesn't drift if `ai_pricing.json` changes.
        monkeypatch.setattr(
            ai_metrics, "_pricing_cache",
            {("openai", "gpt-4o"): {"input": 0.0025, "output": 0.01}},
        )
        collector = get_collector()
        collector.clear()
        rec = AIMetricsRecord(
            timestamp=1_700_000_000.0,
            request_id="test1",
            provider="openai",
            model="gpt-4o",
            latency_ms=150.0,
            input_tokens=100,
            output_tokens=50,
            cache_read_tokens=0,
            cache_creation_tokens=0,
            retry_count=0,
            success=True,
            num_suggestions=3,
            num_ainvoke_calls=1,
        )
        asyncio.run(collector.record(rec))

        response = client.get("/api/v1/ai/metrics?limit=10")
        assert response.status_code == 200
        body = response.json()
        records = body["data"]["records"]
        assert len(records) == 1
        assert records[0]["request_id"] == "test1"
        # Cost attached for a known (provider, model) pair.
        assert records[0]["cost_usd"] is not None
        agg = body["data"]["aggregates"]
        assert agg["count"] == 1
        assert agg["success_rate"] == 1.0
        assert "openai" in agg["by_provider"]
