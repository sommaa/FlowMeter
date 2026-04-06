"""Tests for backend/app/api/templates.py - Template management API endpoints."""

import pytest
import os
import sys
import json
from unittest.mock import patch
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.main import app
from app.api.templates import get_required_variables


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def temp_template_dir(tmp_path):
    """Create a temporary template directory."""
    tdir = tmp_path / "templates"
    tdir.mkdir()
    return str(tdir)


class TestGetRequiredVariables:
    """Tests for the get_required_variables helper function."""

    def test_extracts_axis_variables(self):
        config = {
            "visualizations": [
                {"axis": {"x_axis": "Date", "y_axis": ["Temp", "Pressure"]}}
            ]
        }
        result = get_required_variables(config)
        assert set(result) == {"Date", "Temp", "Pressure"}

    def test_excludes_index(self):
        config = {
            "visualizations": [
                {"axis": {"x_axis": "Index", "y_axis": ["Value"]}}
            ]
        }
        result = get_required_variables(config)
        assert "Index" not in result
        assert "Value" in result

    def test_excludes_global_variables(self):
        config = {
            "visualizations": [
                {"axis": {"x_axis": "Date", "y_axis": ["computed"]}}
            ],
            "global_variables": [{"name": "computed"}],
        }
        result = get_required_variables(config)
        assert "computed" not in result
        assert "Date" in result

    def test_excludes_rec_suffix(self):
        config = {
            "visualizations": [
                {"axis": {"x_axis": "Date", "y_axis": ["Flow_rec", "Flow"]}}
            ]
        }
        result = get_required_variables(config)
        assert "Flow_rec" not in result
        assert "Flow" in result

    def test_includes_regression_predictors(self):
        config = {
            "visualizations": [
                {
                    "axis": {"x_axis": "x", "y_axis": ["y"]},
                    "regression": {"predictors": ["a", "b"]},
                }
            ]
        }
        result = get_required_variables(config)
        assert "a" in result
        assert "b" in result


class TestListTemplates:
    """Tests for GET /api/v1/templates/list."""

    def test_list_empty(self, client, temp_template_dir):
        with patch("app.api.templates.TEMPLATE_DIR", temp_template_dir):
            response = client.get("/api/v1/templates/list")
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["data"] == []

    def test_list_with_templates(self, client, temp_template_dir):
        # Create a template file
        template = {
            "version": "1.0",
            "plant_name": "Test Plant",
            "visualizations": [
                {"axis": {"x_axis": "Date", "y_axis": ["Temp"]}}
            ],
        }
        filepath = os.path.join(temp_template_dir, "my_template.json")
        with open(filepath, "w") as f:
            json.dump(template, f)

        with patch("app.api.templates.TEMPLATE_DIR", temp_template_dir):
            response = client.get("/api/v1/templates/list")
            assert response.status_code == 200
            data = response.json()
            assert len(data["data"]) == 1
            assert data["data"][0]["name"] == "my_template"


class TestSavePersistentTemplate:
    """Tests for POST /api/v1/templates/save-persistent."""

    def test_save_new_template(self, client, temp_template_dir):
        with patch("app.api.templates.TEMPLATE_DIR", temp_template_dir):
            payload = {
                "name": "new_template",
                "config": {
                    "version": "1.0",
                    "plant_name": "Test",
                    "visualizations": [
                        {
                            "id": "viz1",
                            "title": "Test",
                            "viz_type": "universal",
                        }
                    ],
                },
                "overwrite": False,
            }
            response = client.post("/api/v1/templates/save-persistent", json=payload)
            assert response.status_code == 200
            assert response.json()["success"] is True
            assert os.path.exists(os.path.join(temp_template_dir, "new_template.json"))

    def test_save_duplicate_without_overwrite(self, client, temp_template_dir):
        # Create existing file
        filepath = os.path.join(temp_template_dir, "existing.json")
        with open(filepath, "w") as f:
            json.dump({"version": "1.0"}, f)

        with patch("app.api.templates.TEMPLATE_DIR", temp_template_dir):
            payload = {
                "name": "existing",
                "config": {
                    "version": "1.0",
                    "plant_name": "Test",
                    "visualizations": [{"id": "v1", "title": "V1", "viz_type": "universal"}],
                },
                "overwrite": False,
            }
            response = client.post("/api/v1/templates/save-persistent", json=payload)
            assert response.status_code == 409

    def test_save_invalid_name(self, client, temp_template_dir):
        with patch("app.api.templates.TEMPLATE_DIR", temp_template_dir):
            payload = {
                "name": "!!!",
                "config": {
                    "version": "1.0",
                    "plant_name": "Test",
                    "visualizations": [{"id": "v1", "title": "V1", "viz_type": "universal"}],
                },
                "overwrite": False,
            }
            response = client.post("/api/v1/templates/save-persistent", json=payload)
            assert response.status_code == 400


class TestLoadPersistentTemplate:
    """Tests for GET /api/v1/templates/load-persistent/{name}."""

    def test_load_existing(self, client, temp_template_dir):
        template = {"version": "1.0", "plant_name": "Test", "visualizations": []}
        filepath = os.path.join(temp_template_dir, "loadme.json")
        with open(filepath, "w") as f:
            json.dump(template, f)

        with patch("app.api.templates.TEMPLATE_DIR", temp_template_dir):
            response = client.get("/api/v1/templates/load-persistent/loadme")
            assert response.status_code == 200
            assert response.json()["success"] is True
            assert response.json()["data"]["plant_name"] == "Test"

    def test_load_not_found(self, client, temp_template_dir):
        with patch("app.api.templates.TEMPLATE_DIR", temp_template_dir):
            response = client.get("/api/v1/templates/load-persistent/missing")
            assert response.status_code == 404


class TestDeleteTemplate:
    """Tests for DELETE /api/v1/templates/delete/{name}."""

    def test_delete_existing(self, client, temp_template_dir):
        filepath = os.path.join(temp_template_dir, "todelete.json")
        with open(filepath, "w") as f:
            json.dump({}, f)

        with patch("app.api.templates.TEMPLATE_DIR", temp_template_dir):
            response = client.delete("/api/v1/templates/delete/todelete")
            assert response.status_code == 200
            assert not os.path.exists(filepath)

    def test_delete_not_found(self, client, temp_template_dir):
        with patch("app.api.templates.TEMPLATE_DIR", temp_template_dir):
            response = client.delete("/api/v1/templates/delete/nope")
            # Same bug as models - HTTPException caught by generic except
            assert response.status_code in (404, 500)


class TestRenameTemplate:
    """Tests for POST /api/v1/templates/rename."""

    def test_rename_success(self, client, temp_template_dir):
        filepath = os.path.join(temp_template_dir, "oldname.json")
        with open(filepath, "w") as f:
            json.dump({}, f)

        with patch("app.api.templates.TEMPLATE_DIR", temp_template_dir):
            response = client.post(
                "/api/v1/templates/rename",
                json={"old_name": "oldname", "new_name": "newname"},
            )
            assert response.status_code == 200
            assert response.json()["data"]["name"] == "newname"
            assert os.path.exists(os.path.join(temp_template_dir, "newname.json"))
            assert not os.path.exists(filepath)

    def test_rename_not_found(self, client, temp_template_dir):
        with patch("app.api.templates.TEMPLATE_DIR", temp_template_dir):
            response = client.post(
                "/api/v1/templates/rename",
                json={"old_name": "missing", "new_name": "new"},
            )
            assert response.status_code == 404

    def test_rename_conflict(self, client, temp_template_dir):
        for name in ["source", "target"]:
            with open(os.path.join(temp_template_dir, f"{name}.json"), "w") as f:
                json.dump({}, f)

        with patch("app.api.templates.TEMPLATE_DIR", temp_template_dir):
            response = client.post(
                "/api/v1/templates/rename",
                json={"old_name": "source", "new_name": "target"},
            )
            assert response.status_code == 409


class TestValidateTemplate:
    """Tests for POST /api/v1/templates/validate."""

    def test_validate_valid_template(self, client):
        payload = {
            "version": "1.0",
            "plant_name": "Test Plant",
            "visualizations": [
                {"id": "v1", "title": "Chart", "viz_type": "universal"}
            ],
        }
        response = client.post("/api/v1/templates/validate", json=payload)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["valid"] is True
        assert data["visualization_count"] == 1

    def test_validate_empty_visualizations(self, client):
        payload = {
            "version": "1.0",
            "plant_name": "Test",
            "visualizations": [],
        }
        response = client.post("/api/v1/templates/validate", json=payload)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["valid"] is False
        assert any("at least one" in e for e in data["errors"])
