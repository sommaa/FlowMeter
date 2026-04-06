"""Tests for backend/app/api/export.py - Export API endpoint."""

import pytest
import os
import sys
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


class TestExportDashboard:
    """Tests for POST /api/v1/export/dashboard."""

    def test_export_dataset_not_found(self, client):
        payload = {
            "dataset_id": "nonexistent",
            "visualizations": [],
            "plant_name": "Test Plant",
        }
        response = client.post("/api/v1/export/dashboard", json=payload)
        assert response.status_code == 404

    def test_export_invalid_request(self, client):
        response = client.post("/api/v1/export/dashboard", json={})
        assert response.status_code == 422

    def test_export_success(self, client):
        mock_df = pd.DataFrame({"x": [1, 2, 3], "y": [4, 5, 6]})
        mock_data_service = MagicMock()
        mock_data_service.get_dataset.return_value = mock_df

        with patch("app.api.export.get_data_service", return_value=mock_data_service), \
             patch("app.api.export.exporter") as mock_exporter:
            mock_exporter.generate_html_report.return_value = "<html><body>Report</body></html>"

            payload = {
                "dataset_id": "ds1",
                "visualizations": [],
                "plant_name": "Test Plant",
                "comments": "Test comment",
            }
            response = client.post("/api/v1/export/dashboard", json=payload)
            assert response.status_code == 200
            assert "html" in response.headers.get("content-type", "").lower()
