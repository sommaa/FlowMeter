"""Tests for the runtime formula-sandbox opt-out.

Covers both the gate functions in app.services.formula_safety and the
/api/v1/settings/security endpoint that toggles the runtime flag. An autouse
fixture restores the default (sandbox enforced) after every test so the global
flag never leaks into other test modules.
"""
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.main import app
from app.services import formula_safety
from app.services.formula_safety import (
    assert_formula_safe,
    assert_no_escape,
    safe_eval,
    safe_exec,
    set_unsafe_allowed,
    is_unsafe_allowed,
    UnsafeFormulaError,
)


@pytest.fixture(autouse=True)
def reset_sandbox():
    """Ensure the sandbox is enforced before and after each test."""
    set_unsafe_allowed(False)
    yield
    set_unsafe_allowed(False)


@pytest.fixture
def client():
    return TestClient(app)


# ============= gate functions: default (sandbox ON) =============

class TestSandboxEnforced:
    def test_default_is_enforced(self):
        assert is_unsafe_allowed() is False

    def test_assert_formula_safe_rejects_import(self):
        with pytest.raises(UnsafeFormulaError):
            assert_formula_safe("__import__('os').system('echo hi')")

    def test_assert_formula_safe_rejects_non_whitelisted_call(self):
        with pytest.raises(UnsafeFormulaError):
            assert_formula_safe("pd.read_pickle('x')")

    def test_assert_no_escape_rejects_import(self):
        with pytest.raises(UnsafeFormulaError):
            assert_no_escape("import os")

    def test_safe_eval_locks_builtins(self):
        # open() is not in SAFE_BUILTINS, so it is absent from the namespace.
        with pytest.raises(UnsafeFormulaError):
            safe_eval("open('/etc/passwd')", {})


# ============= gate functions: opt-out (sandbox OFF) =============

class TestSandboxOptedOut:
    def test_flag_reads_true(self):
        set_unsafe_allowed(True)
        assert is_unsafe_allowed() is True

    def test_assert_formula_safe_allows_anything(self):
        set_unsafe_allowed(True)
        # Would normally raise; now a no-op.
        assert_formula_safe("__import__('os').system('echo hi')")

    def test_assert_no_escape_allows_import(self):
        set_unsafe_allowed(True)
        assert_no_escape("import os")

    def test_safe_eval_runs_with_real_builtins(self):
        set_unsafe_allowed(True)
        result = safe_eval("__import__('os').getcwd()", {})
        assert isinstance(result, str)

    def test_safe_exec_runs_with_real_builtins(self):
        set_unsafe_allowed(True)
        ns = {}
        safe_exec("result = len([1, 2, 3]) + abs(-4)", ns)
        assert ns["result"] == 7


# ============= settings endpoint =============

class TestSecuritySettingsEndpoint:
    def test_get_default(self, client):
        response = client.get("/api/v1/settings/security")
        assert response.status_code == 200
        assert response.json()["data"]["allow_unsafe_formulas"] is False

    def test_put_enables_and_get_reflects(self, client):
        put = client.put(
            "/api/v1/settings/security",
            json={"allow_unsafe_formulas": True},
        )
        assert put.status_code == 200
        assert put.json()["data"]["allow_unsafe_formulas"] is True
        # And the runtime flag is actually set.
        assert is_unsafe_allowed() is True

        get = client.get("/api/v1/settings/security")
        assert get.json()["data"]["allow_unsafe_formulas"] is True

    def test_put_disables(self, client):
        set_unsafe_allowed(True)
        put = client.put(
            "/api/v1/settings/security",
            json={"allow_unsafe_formulas": False},
        )
        assert put.status_code == 200
        assert put.json()["data"]["allow_unsafe_formulas"] is False
        assert is_unsafe_allowed() is False
