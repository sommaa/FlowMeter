"""Tests for backend/app/main.py - Main FastAPI application."""

import pytest
import os
import sys
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


class TestHealthCheck:
    """Tests for the health check endpoint."""

    def test_health_check(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


class TestCORS:
    """Tests for CORS middleware."""

    def test_cors_headers_present(self, client):
        response = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        # CORS should allow localhost:3000
        assert response.status_code == 200


class TestProcessTimeMiddleware:
    """Tests for request timing middleware."""

    def test_process_time_header(self, client):
        response = client.get("/health")
        assert "x-process-time" in response.headers


class TestRouteRegistration:
    """Tests that API routes are properly registered."""

    def test_data_routes_exist(self, client):
        response = client.get("/api/v1/data/datasets")
        assert response.status_code == 200

    def test_visualizations_routes_exist(self, client):
        response = client.get("/api/v1/visualizations/types")
        assert response.status_code == 200

    def test_templates_routes_exist(self, client):
        response = client.get("/api/v1/templates/list")
        assert response.status_code == 200

    def test_models_routes_exist(self, client):
        response = client.get("/api/v1/models/list")
        assert response.status_code == 200
