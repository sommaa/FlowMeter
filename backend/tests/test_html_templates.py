"""Tests for backend/app/services/export_helpers/html_templates.py."""

import pytest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.export_helpers.html_templates import REPORT_TEMPLATE


class TestReportTemplate:
    """Tests for the report HTML template."""

    def test_template_is_string(self):
        assert isinstance(REPORT_TEMPLATE, str)

    def test_template_not_empty(self):
        assert len(REPORT_TEMPLATE) > 100

    def test_template_contains_jinja_variables(self):
        assert "{{ plant_name }}" in REPORT_TEMPLATE or "{{plant_name}}" in REPORT_TEMPLATE

    def test_template_contains_html_structure(self):
        assert "<html" in REPORT_TEMPLATE.lower() or "<!doctype" in REPORT_TEMPLATE.lower()

    def test_template_has_plot_section(self):
        # Template should have a loop for plots
        assert "plots" in REPORT_TEMPLATE
