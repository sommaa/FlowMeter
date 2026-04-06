"""Tests for backend/app/core/config.py - Application settings."""

import pytest
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


class TestSettings:
    """Tests for the Settings configuration model."""

    def test_default_values(self):
        from app.core.config import Settings
        settings = Settings()
        assert settings.app_name == "FlowMeter API"
        assert settings.port == 8000
        assert settings.host == "0.0.0.0"
        assert settings.debug is False
        assert settings.max_file_size_mb == 50
        assert ".xlsx" in settings.allowed_extensions
        assert ".csv" in settings.allowed_extensions
        assert settings.max_datasets_per_session == 10

    def test_cors_origins(self):
        from app.core.config import Settings
        settings = Settings()
        assert "http://localhost:3000" in settings.cors_origins
        assert "http://localhost:5173" in settings.cors_origins

    def test_env_override(self):
        from app.core.config import Settings
        with patch.dict(os.environ, {"PORT": "9000", "DEBUG": "true"}):
            settings = Settings()
            assert settings.port == 9000
            assert settings.debug is True

    def test_get_settings_cached(self):
        from app.core.config import get_settings
        s1 = get_settings()
        s2 = get_settings()
        assert s1 is s2  # Same instance due to lru_cache

    def test_ignores_extra_env_vars(self):
        """Settings should ignore unknown env vars (like ANTHROPIC_API_KEY)."""
        from app.core.config import Settings
        with patch.dict(os.environ, {"SOME_UNKNOWN_VAR": "value"}):
            settings = Settings()  # Should not raise
            assert settings.app_name == "FlowMeter API"
