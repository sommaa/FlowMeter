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
