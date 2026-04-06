"""Tests for backend/app/services/visualization/plotting.py helper functions."""

import pytest
import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.visualization.plotting import _parse_bounds


class TestParseBounds:
    """Tests for _parse_bounds helper function."""

    def test_none_input(self):
        assert _parse_bounds(None) is None

    def test_empty_string(self):
        assert _parse_bounds("") is None

    def test_single_value(self):
        result = _parse_bounds("1.5")
        assert result == [1.5]

    def test_multiple_values(self):
        result = _parse_bounds("0.0, 1.0, 2.0")
        assert result == [0.0, 1.0, 2.0]

    def test_inf(self):
        result = _parse_bounds("inf")
        assert result == [np.inf]

    def test_plus_inf(self):
        result = _parse_bounds("+inf")
        assert result == [np.inf]

    def test_minus_inf(self):
        result = _parse_bounds("-inf")
        assert result == [-np.inf]

    def test_mixed_bounds(self):
        result = _parse_bounds("-inf, 0, inf")
        assert result[0] == -np.inf
        assert result[1] == 0.0
        assert result[2] == np.inf

    def test_whitespace_handling(self):
        result = _parse_bounds("  1.0 ,  2.0 ,  3.0  ")
        assert result == [1.0, 2.0, 3.0]
