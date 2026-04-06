"""Tests for backend/app/services/export_helpers/utils.py."""

import pytest
import os
import sys
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.export_helpers.utils import (
    hex_to_rgb, lighten_color, get_contrast_color, filter_dataframe_by_date
)


class TestHexToRgb:
    """Tests for hex to RGB conversion."""

    def test_hex_6_digit(self):
        assert hex_to_rgb("#ff0000") == "255,0,0"

    def test_hex_3_digit(self):
        assert hex_to_rgb("#f00") == "255,0,0"

    def test_rgb_string(self):
        assert hex_to_rgb("rgb(255, 128, 0)") == "255,128,0"

    def test_rgba_string(self):
        assert hex_to_rgb("rgba(255, 128, 0, 0.5)") == "255,128,0"

    def test_empty_string(self):
        assert hex_to_rgb("") == "0,0,0"

    def test_none(self):
        assert hex_to_rgb(None) == "0,0,0"

    def test_invalid(self):
        assert hex_to_rgb("invalid") == "0,0,0"

    def test_white(self):
        assert hex_to_rgb("#ffffff") == "255,255,255"

    def test_black(self):
        assert hex_to_rgb("#000000") == "0,0,0"


class TestLightenColor:
    """Tests for color lightening."""

    def test_lighten_red(self):
        result = lighten_color("#ff0000", 0.5)
        assert result.startswith("#")
        # Should be lighter than pure red
        r = int(result[1:3], 16)
        assert r == 255  # Red stays 255
        g = int(result[3:5], 16)
        assert g > 0  # Green increased

    def test_lighten_black(self):
        result = lighten_color("#000000", 0.5)
        # Should be gray
        r = int(result[1:3], 16)
        assert r == 127 or r == 128  # Approximately half of 255

    def test_no_change(self):
        result = lighten_color("#ff0000", 0.0)
        assert result == "#ff0000"

    def test_invalid_returns_hex(self):
        # "invalid_color" gets parsed by hex_to_rgb as "0,0,0" (fallback)
        # Then lighten from black gives a gray
        result = lighten_color("invalid_color")
        assert result.startswith("#")


class TestGetContrastColor:
    """Tests for contrast color calculation."""

    def test_white_background(self):
        assert get_contrast_color("#ffffff") == "#000000"  # Black text

    def test_black_background(self):
        assert get_contrast_color("#000000") == "#ffffff"  # White text

    def test_yellow_background(self):
        # Yellow is bright, should get black text
        assert get_contrast_color("#ffff00") == "#000000"

    def test_dark_blue_background(self):
        assert get_contrast_color("#000080") == "#ffffff"


class TestFilterDataframeByDate:
    """Tests for date range filtering."""

    def test_no_date_range_returns_original(self):
        df = pd.DataFrame({"a": [1, 2, 3]})
        result = filter_dataframe_by_date(df, None)
        pd.testing.assert_frame_equal(result, df)

    def test_empty_date_range_returns_original(self):
        df = pd.DataFrame({"a": [1, 2, 3]})
        result = filter_dataframe_by_date(df, {})
        pd.testing.assert_frame_equal(result, df)

    def test_filters_datetime_index(self):
        dates = pd.date_range("2023-01-01", periods=5, freq="D")
        df = pd.DataFrame({"value": [1, 2, 3, 4, 5]}, index=dates)
        date_range = {"start": "2023-01-02", "end": "2023-01-04"}
        result = filter_dataframe_by_date(df, date_range)
        assert len(result) == 3

    def test_filters_datetime_column(self):
        df = pd.DataFrame({
            "date": pd.to_datetime(["2023-01-01", "2023-01-02", "2023-01-03", "2023-01-04"]),
            "value": [1, 2, 3, 4],
        })
        date_range = {"start": "2023-01-02", "end": "2023-01-03"}
        result = filter_dataframe_by_date(df, date_range)
        assert len(result) == 2

    def test_no_date_columns_returns_original(self):
        df = pd.DataFrame({"x": [1, 2, 3], "y": [4, 5, 6]})
        date_range = {"start": "2023-01-01", "end": "2023-12-31"}
        result = filter_dataframe_by_date(df, date_range)
        assert len(result) == 3
