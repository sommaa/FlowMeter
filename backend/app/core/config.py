"""
Application configuration and settings management.

This module provides centralized configuration using Pydantic Settings
for type-safe environment variable management with validation.

Configuration categories:
    - App Info: Application metadata and debug settings
    - Server: Host and port configuration
    - CORS: Cross-Origin Resource Sharing allowed origins
    - File Upload: Size limits, allowed extensions, storage directory
    - Data Storage: Session limits and in-memory storage constraints

Environment variables are loaded from .env file (if present) with
automatic type conversion and validation.

Usage:
    ```python
    from app.core.config import get_settings

    settings = get_settings()  # Cached singleton
    print(settings.max_file_size_mb)  # Type-safe access
    ```

The settings instance is cached using @lru_cache() for performance.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    All fields can be overridden via environment variables with the
    same name (case-insensitive). For example, APP_NAME=MyApp will
    override the app_name field.

    Attributes:
        app_name: Application display name.
        app_version: Semantic version string.
        debug: Enable debug mode (verbose logging, CORS *, etc.).
        host: Server bind address (0.0.0.0 = all interfaces).
        port: Server listening port.
        cors_origins: List of allowed CORS origins for frontend.
        max_file_size_mb: Maximum upload file size in megabytes.
        allowed_extensions: Permitted file extensions for uploads.
        upload_dir: Directory for temporary file storage.
        max_datasets_per_session: Limit on concurrent loaded datasets.
    """
    
    # App Info
    app_name: str = "FlowMeter API"
    app_version: str = "1.0.0-alpha"
    debug: bool = False
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    
    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    
    # File Upload
    max_file_size_mb: int = 50
    allowed_extensions: list[str] = [".xlsx", ".xls", ".csv", ".parquet", ".pqt"]
    upload_dir: str = "uploads"
    
    # Data Storage (in-memory for MVP, can extend to Redis/DB)
    max_datasets_per_session: int = 10
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached application settings singleton.

    Returns:
        Settings: Cached settings instance loaded from environment.

    Note:
        Uses @lru_cache() to ensure a single Settings instance is
        reused across the application, avoiding repeated environment
        variable parsing. The cache is never cleared during runtime.

    Example:
        ```python
        settings = get_settings()
        if settings.debug:
            logger.setLevel(logging.DEBUG)
        ```
    """
    return Settings()
