"""Tests for backend/app/api/visualizations.py - Visualization API endpoints."""

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


class TestPlotData:
    """Tests for POST /api/v1/visualizations/plot-data."""

    def test_plot_data_dataset_not_found(self, client):
        payload = {
            "dataset_id": "nonexistent",
            "config": {
                "id": "v1",
                "title": "Test",
                "viz_type": "universal",
                "axis": {"x_axis": "x", "y_axis": ["y"]},
            },
        }
        response = client.post("/api/v1/visualizations/plot-data", json=payload)
        assert response.status_code == 404

    def test_plot_data_invalid_body(self, client):
        response = client.post("/api/v1/visualizations/plot-data", json={})
        assert response.status_code == 422

    def test_plot_data_success(self, client):
        mock_data_service = MagicMock()
        mock_data_service.get_metadata.return_value = {"id": "ds1"}

        mock_plot_response = MagicMock()
        mock_plot_response.title = "Test"
        mock_plot_response.series = []
        mock_plot_response.x_label = "x"
        mock_plot_response.y_label = "y"

        mock_viz_service = MagicMock()
        mock_viz_service.generate_plot_data.return_value = {
            "title": "Test",
            "series": [],
            "x_label": "x",
            "y_label": "y",
        }

        with patch("app.api.visualizations.get_data_service", return_value=mock_data_service), \
             patch("app.api.visualizations.get_visualization_service", return_value=mock_viz_service):
            payload = {
                "dataset_id": "ds1",
                "config": {
                    "id": "v1",
                    "title": "Test",
                    "viz_type": "universal",
                    "axis": {"x_axis": "x", "y_axis": ["y"]},
                },
            }
            response = client.post("/api/v1/visualizations/plot-data", json=payload)
            assert response.status_code == 200


class TestPredictRegression:
    """Tests for POST /api/v1/visualizations/predict."""

    def test_predict_dataset_not_found(self, client):
        payload = {
            "dataset_id": "nonexistent",
            "config": {
                "id": "v1",
                "title": "Test",
                "viz_type": "regression",
                "axis": {"y_axis": ["y"]},
                "regression": {"predictors": ["x"], "model_type": "linear"},
            },
            "inputs": {"x": 1.0},
        }
        response = client.post("/api/v1/visualizations/predict", json=payload)
        assert response.status_code == 404


class TestVisualizationTypes:
    """Tests for GET /api/v1/visualizations/types."""

    def test_get_types(self, client):
        response = client.get("/api/v1/visualizations/types")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert isinstance(data["data"], list)
        assert len(data["data"]) > 0
        # Check structure
        first = data["data"][0]
        assert "id" in first
        assert "name" in first
        assert "description" in first


class TestColorPalette:
    """Tests for GET /api/v1/visualizations/colors."""

    def test_get_colors(self, client):
        response = client.get("/api/v1/visualizations/colors")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert isinstance(data["data"], list)
        assert len(data["data"]) == 20
        # All should be hex color strings
        for color in data["data"]:
            assert color.startswith("#")
