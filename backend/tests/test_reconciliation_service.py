"""Tests for backend/app/services/reconciliation_service.py."""

import pytest
import os
import sys
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.reconciliation_service import ReconciliationService


class TestNormalizeSpaces:
    """Tests for whitespace normalization."""

    def test_basic(self):
        assert ReconciliationService.normalize_spaces("  hello   world  ") == "hello world"

    def test_non_breaking_space(self):
        result = ReconciliationService.normalize_spaces("hello\u00A0world")
        assert result == "hello world"

    def test_non_string(self):
        assert ReconciliationService.normalize_spaces(42) == 42

    def test_empty_string(self):
        assert ReconciliationService.normalize_spaces("") == ""


class TestCanonicalName:
    """Tests for variable name canonicalization."""

    def test_basic(self):
        result = ReconciliationService.canonical_name("Flow Rate")
        assert "_" not in result or result == "Flow_Rate"

    def test_parens_replaced(self):
        result = ReconciliationService.canonical_name("F(1)")
        assert "(" not in result
        assert ")" not in result

    def test_slash_replaced(self):
        result = ReconciliationService.canonical_name("kg/h")
        assert "/" not in result

    def test_strips_underscores(self):
        result = ReconciliationService.canonical_name("__test__")
        assert not result.startswith("_")
        assert not result.endswith("_")
