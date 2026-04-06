"""
Performance profiling utilities for request and function timing.

This module provides lightweight profiling tools for monitoring
application performance and identifying bottlenecks:

**Middleware:**
    - ProcessTimeMiddleware: Logs HTTP request execution times

**Decorators:**
    - profile_performance: Measures function execution time

Both async and sync functions are supported. Timing information is
logged to the "profiler" logger and added to HTTP response headers.

Usage:
    In main.py:
    ```python
    app.add_middleware(ProcessTimeMiddleware)
    ```

    On slow functions:
    ```python
    @profile_performance
    def expensive_computation(data):
        # ... heavy processing ...
        return result
    ```

Output example:
    ```
    [Profiler] Request: GET /api/v1/plot-data took 245.67ms
    [Profiler] Function: generate_regression_line took 89.23ms
    ```
"""
import time
import functools
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

import asyncio
import inspect

# Configure logger
logger = logging.getLogger("profiler")

class ProcessTimeMiddleware(BaseHTTPMiddleware):
    """ASGI middleware for HTTP request profiling.

    Measures and logs the total processing time for each HTTP request,
    including all middleware, route handlers, and background tasks.

    The execution time is:
        1. Logged to the "profiler" logger in milliseconds
        2. Added to response headers as "X-Process-Time" in seconds

    Example log output:
        [Profiler] Request: POST /api/v1/plot-data took 345.67ms

    The X-Process-Time header can be used by frontend monitoring tools
    or browser DevTools for performance analysis.

    Note:
        This middleware should be added early in the middleware stack
        (in main.py) to capture the full request lifecycle timing.
    """
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time

        # Log path and time
        logger.info(f"[Profiler] Request: {request.method} {request.url.path} took {process_time * 1000:.2f}ms")

        # Add header for frontend visibility if needed
        response.headers["X-Process-Time"] = str(process_time)
        return response

def profile_performance(func):
    """Decorator to measure and log function execution time.

    Supports both synchronous and asynchronous functions. Automatically
    detects the function type using inspect.iscoroutinefunction().

    Args:
        func: Function to profile (sync or async).

    Returns:
        Wrapped function that logs execution time on each call.

    Usage:
        ```python
        @profile_performance
        def slow_computation(n):
            time.sleep(n)
            return n * 2

        @profile_performance
        async def slow_async_query(db):
            return await db.fetch_all()

        result = slow_computation(2)
        # Logs: [Profiler] Function: slow_computation took 2001.45ms
        ```

    Note:
        The decorator preserves function metadata using functools.wraps()
        for compatibility with FastAPI dependency injection and OpenAPI docs.
    """
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        duration = time.time() - start_time
        logger.info(f"[Profiler] Function: {func.__name__} took {duration * 1000:.2f}ms")
        return result
    
    @functools.wraps(func)
    async def async_wrapper(*args, **kwargs):
        start_time = time.time()
        result = await func(*args, **kwargs)
        duration = time.time() - start_time
        logger.info(f"[Profiler] Function: {func.__name__} (async) took {duration * 1000:.2f}ms")
        return result

    if inspect.iscoroutinefunction(func):
        return async_wrapper
    return wrapper
