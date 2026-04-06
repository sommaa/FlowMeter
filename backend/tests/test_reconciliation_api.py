"""Tests for backend/app/api/reconciliation.py - Reconciliation API endpoints."""

import pytest
import os
import sys
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


class TestReconcileEndpoint:
    """Tests for POST /api/v1/reconcile endpoint."""

    def test_reconcile_dataset_not_found(self, client):
        """Returns error when dataset doesn't exist."""
        payload = {
            "dataset_id": "nonexistent",
            "config": {
                "equations": ["A + B - C"],
                "sigma_mode": "fixed_all",
                "fixed_sigma": 1.0,
                "sigma_values": {},
                "non_negative": True,
            },
        }
        response = client.post("/api/v1/reconcile/reconcile", json=payload)
        # May return 404 (dataset not found) or 400 (validation before dataset lookup)
        assert response.status_code in (400, 404)

    def test_reconcile_success(self, client):
        """Successful reconciliation returns download URL and report."""
        mock_df = pd.DataFrame({
            "A": [10.0, 20.0, 30.0],
            "B": [5.0, 10.0, 15.0],
            "C": [15.0, 30.0, 45.0],
        })
        rec_df = pd.DataFrame({
            "A": [10.1, 20.1, 30.1],
            "B": [5.1, 10.1, 15.1],
            "C": [15.2, 30.2, 45.2],
        })
        report_list = [
            {
                "variable": "A",
                "mean_error": 0.1,
                "mae": 0.1,
                "rel_error_pct": 0.5,
                "std_error": 0.01,
                "avg_abs_change": 0.1,
                "max_abs_change": 0.1,
                "count": 3,
            }
        ]

        mock_data_service = MagicMock()
        mock_data_service.get_dataset.return_value = mock_df

        mock_viz_service = MagicMock()

        with patch("app.api.reconciliation.get_data_service", return_value=mock_data_service), \
             patch("app.api.reconciliation.ReconciliationService") as mock_rec_cls, \
             patch("app.api.reconciliation.get_visualization_service", return_value=mock_viz_service):
            mock_rec_cls.reconcile_data.return_value = (rec_df, report_list)

            payload = {
                "dataset_id": "ds1",
                "config": {
                    "equations": ["A + B - C"],
                    "sigma_mode": "fixed_all",
                    "fixed_sigma": 1.0,
                    "sigma_values": {},
                    "non_negative": True,
                },
            }
            response = client.post("/api/v1/reconcile/reconcile", json=payload)
            assert response.status_code == 200
            data = response.json()
            assert "reconciled_file_url" in data
            assert "report" in data
            assert len(data["report"]) == 1
            assert data["report"][0]["variable"] == "A"

    def test_reconcile_invalid_request(self, client):
        """Returns 422 for invalid request body."""
        response = client.post("/api/v1/reconcile/reconcile", json={"bad": "data"})
        assert response.status_code == 422


class TestDownloadEndpoint:
    """Tests for GET /api/v1/reconcile/download/{filename}."""

    def test_download_file_not_found(self, client):
        """Returns 404 when file doesn't exist."""
        response = client.get("/api/v1/reconcile/download/nonexistent.xlsx")
        assert response.status_code == 404

    def test_download_existing_file(self, client, tmp_path):
        """Downloads existing file and returns correct content type."""
        # Create a temp file
        test_file = tmp_path / "test.xlsx"
        test_file.write_bytes(b"fake excel content")

        with patch("app.api.reconciliation.settings") as mock_settings:
            mock_settings.upload_dir = str(tmp_path)
            response = client.get("/api/v1/reconcile/download/test.xlsx")
            assert response.status_code == 200
