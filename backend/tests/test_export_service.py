"""Tests for backend/app/services/export_service.py."""

import pytest
import os
import sys
import pandas as pd
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.export_service import DashboardExporter
from app.models.schemas import VisualizationConfig, ExportSettings


class TestDashboardExporter:
    """Tests for the DashboardExporter class."""

    def test_instantiation(self):
        exporter = DashboardExporter()
        assert exporter is not None

    def test_generate_report_empty_visualizations(self):
        """Report generation with empty viz list should still produce HTML."""
        exporter = DashboardExporter()
        df = pd.DataFrame({"x": [1, 2, 3], "y": [4, 5, 6]})
        html = exporter.generate_html_report(
            df=df,
            visualizations=[],
            plant_name="Test Plant",
            comments="Test",
        )
        assert "<html" in html.lower() or "<!doctype" in html.lower() or "Test Plant" in html

    def test_generate_report_with_settings(self):
        """Report generation uses custom export settings."""
        exporter = DashboardExporter()
        df = pd.DataFrame({"x": [1, 2, 3], "y": [4, 5, 6]})
        settings = ExportSettings(
            author_name="Test Author",
            primary_color="#FF0000",
        )
        html = exporter.generate_html_report(
            df=df,
            visualizations=[],
            plant_name="Custom Plant",
            settings=settings,
        )
        assert "Custom Plant" in html or "Test Author" in html
