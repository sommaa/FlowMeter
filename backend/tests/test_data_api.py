"""Tests for backend/app/api/data.py - Data API endpoints."""

import pytest
import os
import sys
import io
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


class TestUploadFile:
    """Tests for POST /api/v1/data/upload."""

    def test_upload_invalid_extension(self, client):
        file_content = b"some content"
        response = client.post(
            "/api/v1/data/upload",
            files={"file": ("test.txt", io.BytesIO(file_content), "text/plain")},
        )
        assert response.status_code == 400
        assert "not allowed" in response.json()["detail"]

    def test_upload_csv_success(self, client):
        csv_content = b"x,y,z\n1,2,3\n4,5,6\n"
        response = client.post(
            "/api/v1/data/upload",
            files={"file": ("data.csv", io.BytesIO(csv_content), "text/csv")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "rows" in data["message"]

    def test_upload_parquet_success(self, client):
        import pandas as pd

        df = pd.DataFrame({"x": [1, 4], "y": [2, 5], "z": [3, 6]})
        buffer = io.BytesIO()
        df.to_parquet(buffer)
        response = client.post(
            "/api/v1/data/upload",
            files={
                "file": (
                    "data.parquet",
                    io.BytesIO(buffer.getvalue()),
                    "application/octet-stream",
                )
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "rows" in data["message"]

    def test_upload_with_cleaning_config(self, client):
        csv_content = b"x,y\n1,2\n3,4\n"
        config = '{"header_row": 0, "nan_strategy": "none"}'
        response = client.post(
            "/api/v1/data/upload",
            files={"file": ("data.csv", io.BytesIO(csv_content), "text/csv")},
            data={"cleaning_config": config},
        )
        assert response.status_code == 200


class TestListDatasets:
    """Tests for GET /api/v1/data/datasets."""

    def test_list_datasets(self, client):
        response = client.get("/api/v1/data/datasets")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert isinstance(data["data"], list)


class TestGetDatasetInfo:
    """Tests for GET /api/v1/data/datasets/{id}."""

    def test_get_nonexistent(self, client):
        response = client.get("/api/v1/data/datasets/nonexistent")
        assert response.status_code == 404

    def test_get_existing(self, client):
        # Upload a dataset first
        csv_content = b"a,b\n1,2\n3,4\n"
        upload_resp = client.post(
            "/api/v1/data/upload",
            files={"file": ("test.csv", io.BytesIO(csv_content), "text/csv")},
        )
        dataset_id = upload_resp.json()["data"]["id"]

        response = client.get(f"/api/v1/data/datasets/{dataset_id}")
        assert response.status_code == 200
        assert response.json()["data"]["id"] == dataset_id


class TestDeleteDataset:
    """Tests for DELETE /api/v1/data/datasets/{id}."""

    def test_delete_nonexistent(self, client):
        response = client.delete("/api/v1/data/datasets/nonexistent")
        assert response.status_code == 404

    def test_delete_existing(self, client):
        csv_content = b"a,b\n1,2\n"
        upload_resp = client.post(
            "/api/v1/data/upload",
            files={"file": ("test.csv", io.BytesIO(csv_content), "text/csv")},
        )
        dataset_id = upload_resp.json()["data"]["id"]

        response = client.delete(f"/api/v1/data/datasets/{dataset_id}")
        assert response.status_code == 200
        assert response.json()["success"] is True


class TestGetStatistics:
    """Tests for GET /api/v1/data/datasets/{id}/statistics."""

    def test_statistics_not_found(self, client):
        response = client.get("/api/v1/data/datasets/nonexistent/statistics")
        assert response.status_code == 404

    def test_statistics_success(self, client):
        csv_content = b"x,y\n1,10\n2,20\n3,30\n"
        upload_resp = client.post(
            "/api/v1/data/upload",
            files={"file": ("test.csv", io.BytesIO(csv_content), "text/csv")},
        )
        dataset_id = upload_resp.json()["data"]["id"]

        response = client.get(f"/api/v1/data/datasets/{dataset_id}/statistics")
        assert response.status_code == 200
        stats = response.json()["data"]
        assert len(stats) > 0


class TestGetPreview:
    """Tests for GET /api/v1/data/datasets/{id}/preview."""

    def test_preview_not_found(self, client):
        response = client.get("/api/v1/data/datasets/nonexistent/preview")
        assert response.status_code == 404

    def test_preview_success(self, client):
        csv_content = b"x,y\n1,2\n3,4\n5,6\n"
        upload_resp = client.post(
            "/api/v1/data/upload",
            files={"file": ("test.csv", io.BytesIO(csv_content), "text/csv")},
        )
        dataset_id = upload_resp.json()["data"]["id"]

        response = client.get(f"/api/v1/data/datasets/{dataset_id}/preview?rows=2")
        assert response.status_code == 200
        data = response.json()["data"]
        assert "columns" in data
        assert "rows" in data
        assert len(data["rows"]) == 2
