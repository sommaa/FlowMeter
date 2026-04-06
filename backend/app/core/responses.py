"""
Custom JSON response handling for scientific/numeric data.

This module provides NaN/Inf-safe JSON serialization for FastAPI responses,
critical for data analytics applications dealing with pandas/numpy outputs.

Problem:
    Standard JSON doesn't support NaN (Not a Number) or Inf (Infinity) values.
    pandas/numpy operations frequently produce these values (division by zero,
    missing data, etc.), causing serialization failures.

Solution:
    - NaNSafeJSONResponse: Custom response class that sanitizes numeric data
    - sanitize_for_json(): Recursive sanitizer converting NaN/Inf → null
    - Uses orjson for fast serialization with numpy support

This prevents "ValueError: Out of range float values are not JSON compliant"
errors when returning DataFrames or statistical computations to the frontend.

Usage in FastAPI:
    ```python
    @router.get("/data", response_class=NaNSafeJSONResponse)
    async def get_data():
        return {"value": float('nan'), "data": [1, float('inf'), 3]}
        # Returns: {"value": null, "data": [1, null, 3]}
    ```
"""
import math
from typing import Any
import orjson
from fastapi.responses import JSONResponse


def sanitize_for_json(obj: Any) -> Any:
    """Recursively sanitize data structures for JSON serialization.

    Converts problematic numeric values to JSON-compliant equivalents:
        - NaN (Not a Number) → null
        - Inf (Infinity) → null
        - -Inf → null

    Handles nested structures:
        - Dictionaries (recursively sanitizes values)
        - Lists and tuples (recursively sanitizes elements)
        - Pydantic models (via model_dump() or dict())
        - NumPy scalars (via .item() method)

    Args:
        obj: Any Python object to sanitize.

    Returns:
        Sanitized object safe for JSON serialization.

    Example:
        ```python
        data = {"a": float('nan'), "b": [1, float('inf'), 3]}
        clean = sanitize_for_json(data)
        # Returns: {"a": None, "b": [1, None, 3]}
        ```

    Note:
        This function is called automatically by NaNSafeJSONResponse.
        Direct use is only needed for manual JSON encoding.
    """
    if obj is None:
        return None
    
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    
    if isinstance(obj, (list, tuple)):
        return [sanitize_for_json(item) for item in obj]
    
    if hasattr(obj, 'item'):
        try:
            val = obj.item()
            if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                return None
            return val
        except (ValueError, AttributeError):
            pass
    
    if hasattr(obj, 'model_dump'):
        return sanitize_for_json(obj.model_dump())
    elif hasattr(obj, 'dict'):
        return sanitize_for_json(obj.dict())
    
    return obj


class NaNSafeJSONResponse(JSONResponse):
    """FastAPI JSON response with automatic NaN/Inf sanitization.

    Extends FastAPI's JSONResponse to handle numeric edge cases
    commonly encountered in data science applications. Uses orjson
    for fast serialization with numpy array support.

    Features:
        - Converts NaN/Inf/−Inf to JSON null
        - Serializes numpy types (float64, int32, etc.)
        - Handles non-string dict keys
        - Faster than standard json.dumps

    Usage:
        Set as response_class on FastAPI routes returning numeric data:

        ```python
        @router.get("/stats", response_class=NaNSafeJSONResponse)
        async def get_stats():
            df = get_dataframe()
            return df.describe().to_dict()  # May contain NaN
        ```

    Note:
        This is the default response class for the application
        (set in app.main.py) to ensure all endpoints are protected.
    """
    
    media_type = "application/json"
    
    def render(self, content: Any) -> bytes:
        sanitized = sanitize_for_json(content)
        return orjson.dumps(
            sanitized,
            option=orjson.OPT_SERIALIZE_NUMPY | orjson.OPT_NON_STR_KEYS
        )