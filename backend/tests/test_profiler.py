"""Tests for backend/app/core/profiler.py - Performance profiling utilities."""

import pytest
import os
import sys
import time
import asyncio
import logging
from unittest.mock import MagicMock, patch
from starlette.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.core.profiler import profile_performance, ProcessTimeMiddleware


class TestProfilePerformance:
    """Tests for the profile_performance decorator."""

    def test_sync_function_profiling(self):
        """Decorator logs execution time for sync functions."""
        @profile_performance
        def add(a, b):
            return a + b

        result = add(2, 3)
        assert result == 5

    def test_async_function_profiling(self):
        """Decorator logs execution time for async functions."""
        @profile_performance
        async def async_add(a, b):
            return a + b

        result = asyncio.run(async_add(2, 3))
        assert result == 5

    def test_preserves_function_name(self):
        """Decorator preserves original function metadata."""
        @profile_performance
        def my_function():
            pass

        assert my_function.__name__ == "my_function"

    def test_preserves_async_function_name(self):
        """Decorator preserves async function metadata."""
        @profile_performance
        async def my_async_func():
            pass

        assert my_async_func.__name__ == "my_async_func"

    def test_logs_timing(self, caplog):
        """Decorator logs timing info to profiler logger."""
        @profile_performance
        def slow_func():
            time.sleep(0.01)
            return 42

        with caplog.at_level(logging.INFO, logger="profiler"):
            result = slow_func()

        assert result == 42
        assert any("[Profiler] Function: slow_func" in msg for msg in caplog.messages)


class TestProcessTimeMiddleware:
    """Tests for the ProcessTimeMiddleware."""

    def test_adds_process_time_header(self):
        """Middleware adds X-Process-Time header to responses."""
        from fastapi import FastAPI

        test_app = FastAPI()
        test_app.add_middleware(ProcessTimeMiddleware)

        @test_app.get("/test")
        async def test_endpoint():
            return {"ok": True}

        client = TestClient(test_app)
        response = client.get("/test")
        assert response.status_code == 200
        assert "x-process-time" in response.headers
        process_time = float(response.headers["x-process-time"])
        assert process_time >= 0
