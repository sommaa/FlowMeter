"""Tests for the API-key redacting logging filter."""

import logging

from app.core.logging_filters import (
    SecretRedactingFilter,
    install_secret_redaction,
    redact,
)


def test_redact_anthropic_key():
    out = redact("using key sk-ant-api03-abcdefghijklmnopqrstuv now")
    assert "sk-ant" not in out
    assert "***REDACTED***" in out


def test_redact_openai_key():
    out = redact("Bearer sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ in header")
    assert "sk-proj" not in out
    assert "***REDACTED***" in out


def test_redact_google_key():
    out = redact("url?key=AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R extra")
    assert "AIza" not in out
    assert "***REDACTED***" in out


def test_redact_no_match_left_untouched():
    assert redact("no keys here") == "no keys here"
    assert redact("") == ""


def test_filter_mutates_record_msg(caplog):
    lg = logging.getLogger("flowmeter.redaction.test")
    lg.setLevel(logging.DEBUG)
    lg.addFilter(SecretRedactingFilter())
    with caplog.at_level(logging.DEBUG, logger="flowmeter.redaction.test"):
        lg.info("key=sk-ant-api03-abcdefghijklmnopqrstuv")
    joined = " ".join(r.getMessage() for r in caplog.records)
    assert "sk-ant" not in joined
    assert "***REDACTED***" in joined


def test_filter_redacts_string_args(caplog):
    lg = logging.getLogger("flowmeter.redaction.test.args")
    lg.setLevel(logging.DEBUG)
    lg.addFilter(SecretRedactingFilter())
    with caplog.at_level(logging.DEBUG, logger="flowmeter.redaction.test.args"):
        lg.info("token=%s", "sk-ant-api03-abcdefghijklmnopqrstuv")
    joined = " ".join(r.getMessage() for r in caplog.records)
    assert "sk-ant" not in joined
    assert "***REDACTED***" in joined


def test_install_is_idempotent():
    install_secret_redaction()
    install_secret_redaction()
    root = logging.getLogger()
    for handler in root.handlers:
        count = sum(1 for f in handler.filters if isinstance(f, SecretRedactingFilter))
        assert count <= 1
