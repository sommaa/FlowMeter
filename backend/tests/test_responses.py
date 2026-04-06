"""Tests for backend/app/core/responses.py - NaN-safe JSON serialization."""

import pytest
import os
import sys
import math
import json
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.core.responses import sanitize_for_json, NaNSafeJSONResponse


class TestSanitizeForJson:
    """Tests for the sanitize_for_json function."""

    def test_nan_to_none(self):
        assert sanitize_for_json(float("nan")) is None

    def test_inf_to_none(self):
        assert sanitize_for_json(float("inf")) is None

    def test_neg_inf_to_none(self):
        assert sanitize_for_json(float("-inf")) is None

    def test_normal_float_unchanged(self):
        assert sanitize_for_json(3.14) == 3.14

    def test_none_unchanged(self):
        assert sanitize_for_json(None) is None

    def test_int_unchanged(self):
        assert sanitize_for_json(42) == 42

    def test_string_unchanged(self):
        assert sanitize_for_json("hello") == "hello"

    def test_dict_sanitized(self):
        result = sanitize_for_json({"a": float("nan"), "b": 1.0})
        assert result == {"a": None, "b": 1.0}

    def test_list_sanitized(self):
        result = sanitize_for_json([1.0, float("nan"), float("inf"), 3.0])
        assert result == [1.0, None, None, 3.0]

    def test_nested_dict_sanitized(self):
        data = {"outer": {"inner": float("nan"), "ok": 5}}
        result = sanitize_for_json(data)
        assert result == {"outer": {"inner": None, "ok": 5}}

    def test_tuple_sanitized(self):
        result = sanitize_for_json((1.0, float("nan")))
        assert result == [1.0, None]

    def test_numpy_nan(self):
        result = sanitize_for_json(np.float64("nan"))
        assert result is None

    def test_numpy_float(self):
        result = sanitize_for_json(np.float64(3.14))
        assert abs(result - 3.14) < 1e-10

    def test_numpy_int(self):
        result = sanitize_for_json(np.int64(42))
        assert result == 42

    def test_pydantic_model(self):
        from pydantic import BaseModel

        class TestModel(BaseModel):
            value: float

        model = TestModel(value=float("nan"))
        result = sanitize_for_json(model)
        assert result == {"value": None}


class TestNaNSafeJSONResponse:
    """Tests for the NaNSafeJSONResponse class."""

    def test_renders_valid_json(self):
        response = NaNSafeJSONResponse(content={"a": 1, "b": 2})
        body = json.loads(response.body)
        assert body == {"a": 1, "b": 2}

    def test_renders_nan_as_null(self):
        response = NaNSafeJSONResponse(content={"value": float("nan")})
        body = json.loads(response.body)
        assert body["value"] is None

    def test_media_type(self):
        response = NaNSafeJSONResponse(content={})
        assert response.media_type == "application/json"

    def test_handles_numpy_array(self):
        arr = np.array([1.0, 2.0, float("nan")])
        response = NaNSafeJSONResponse(content={"data": arr.tolist()})
        body = json.loads(response.body)
        assert body["data"] == [1.0, 2.0, None]
