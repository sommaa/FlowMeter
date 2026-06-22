"""Centralized safe-evaluation gate for user- and template-supplied formulas.

FlowMeter lets users define chart formulas, global variables, KPI expressions and
custom regression equations that are evaluated at render time with ``eval``/``exec``.
Because dashboard *templates* are shareable artifacts, an unsandboxed formula is an
arbitrary-code-execution vector: opening a malicious template (e.g. one whose formula
is ``__import__('os').system(...)`` or ``pd.read_pickle('http://evil/x.pkl')``) could
run code on the victim's machine. Every formula evaluation in the app must therefore
go through the helpers in this module.

Two independent layers of defense:

1. **AST validation** (compile time, immune to comments and string tricks):
   - reject ``import`` / ``from ... import`` statements;
   - reject any access to *dunder* attributes or names (``__class__``, ``__globals__``,
     ``__import__`` ...), which blocks the classic
     ``().__class__.__bases__[0].__subclasses__()`` sandbox escape;
   - restrict every function call to a vetted numeric whitelist, so I/O-capable calls
     such as ``np.load`` or ``pd.read_pickle`` are refused. Series/DataFrame *methods*
     (``.rolling(...).mean()``, ``.diff()``, ``.dt.total_seconds()`` ...) are allowed —
     they cannot reach the filesystem or import machinery.

2. **Runtime namespace hardening**: ``__builtins__`` is replaced with a minimal mapping
   (:data:`SAFE_BUILTINS`) so dangerous builtins (``open``, ``__import__``, ``eval``,
   ``exec``, ``getattr`` ...) are simply absent from the evaluation namespace.

Anything rejected raises :class:`UnsafeFormulaError` (a ``ValueError`` subclass) so the
existing ``except ValueError`` / ``except Exception`` handlers around each call site
surface it to the user as a normal formula error.

This module is intentionally self-contained (stdlib ``ast`` only). It deliberately does
not import from ``app.services.ai_graph`` so that the hot visualization render path
stays free of the heavy LangChain/LangGraph dependency tree.
"""

from __future__ import annotations

import ast
from typing import Any


class UnsafeFormulaError(ValueError):
    """Raised when a formula contains code that is not allowed to execute."""


# ---------------------------------------------------------------------------
# Runtime opt-out of the sandbox.
#
# FlowMeter is a desktop-first, single-user, local app: the user owns the
# machine and may knowingly trust their own templates, including formulas that
# fall outside the conservative whitelist below. When this flag is on, every
# gate in this module short-circuits and formulas run with *real* builtins —
# i.e. arbitrary code execution. It defaults to off (sandbox enforced) and is
# toggled at runtime via the settings endpoint (see app.api.settings).
# ---------------------------------------------------------------------------
_allow_unsafe: bool | None = None


def is_unsafe_allowed() -> bool:
    """Return whether the formula sandbox is currently disabled.

    Lazily seeds from ``settings.allow_unsafe_formulas`` (env-overridable,
    default ``False``) on first access so the env var is honored even if the
    app startup hook never ran (e.g. in tests). Override with
    :func:`set_unsafe_allowed`.
    """
    global _allow_unsafe
    if _allow_unsafe is None:
        from app.core.config import get_settings
        _allow_unsafe = bool(get_settings().allow_unsafe_formulas)
    return _allow_unsafe


def set_unsafe_allowed(value: bool) -> None:
    """Enable (``True``) or disable (``False``) the formula sandbox opt-out."""
    global _allow_unsafe
    _allow_unsafe = bool(value)


# ---------------------------------------------------------------------------
# Whitelist of callable names permitted inside formulas.
#
# Only pure numerical / array helpers appear here. Anything that performs I/O,
# deserialization, or attribute escapes is deliberately excluded so that it is
# rejected by :func:`assert_formula_safe`. In particular this list must NEVER
# contain readers such as ``np.load``, ``np.fromfile``, ``pd.read_*`` or
# ``pd.read_pickle`` (which can execute arbitrary code via pickle).
# ---------------------------------------------------------------------------
ALLOWED_CALLS: frozenset[str] = frozenset({
    # --- numpy element-wise math ---
    'np.exp', 'np.log', 'np.log10', 'np.log2', 'np.log1p', 'np.expm1',
    'np.sqrt', 'np.cbrt', 'np.square', 'np.power', 'np.abs', 'np.absolute',
    'np.sin', 'np.cos', 'np.tan', 'np.arcsin', 'np.arccos', 'np.arctan',
    'np.arctan2', 'np.sinh', 'np.cosh', 'np.tanh', 'np.hypot',
    'np.deg2rad', 'np.rad2deg', 'np.radians', 'np.degrees',
    'np.floor', 'np.ceil', 'np.round', 'np.rint', 'np.trunc', 'np.fix',
    'np.sign', 'np.clip', 'np.where', 'np.select', 'np.maximum', 'np.minimum',
    'np.mod', 'np.remainder', 'np.fmod', 'np.nan_to_num',
    # --- numpy reductions / statistics ---
    'np.mean', 'np.median', 'np.average', 'np.std', 'np.var',
    'np.sum', 'np.prod', 'np.cumsum', 'np.cumprod', 'np.diff', 'np.gradient',
    'np.min', 'np.max', 'np.percentile', 'np.quantile',
    'np.nanmean', 'np.nanmedian', 'np.nanstd', 'np.nansum',
    'np.nanmin', 'np.nanmax', 'np.isnan', 'np.isinf', 'np.isfinite',
    # --- numpy pure constructors (no I/O) ---
    'np.array', 'np.asarray', 'np.arange', 'np.linspace', 'np.zeros',
    'np.ones', 'np.full', 'np.repeat', 'np.tile', 'np.concatenate',
    'np.stack', 'np.vstack', 'np.hstack', 'np.interp',
    # --- bare aliases (numpy/math style, used in regression SAFE_MATH too) ---
    'exp', 'log', 'log10', 'log2', 'sqrt', 'cbrt', 'square', 'power', 'abs',
    'sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'arctan2',
    'sinh', 'cosh', 'tanh', 'floor', 'ceil', 'round', 'sign', 'clip', 'where',
    'mean', 'median', 'std', 'var', 'cumsum', 'cumprod', 'maximum', 'minimum',
    # --- safe pandas constructors / element-wise helpers ---
    # NOTE: pd.read_*, pd.eval and pd.query are intentionally absent.
    'pd.Series', 'pd.DataFrame', 'pd.to_datetime', 'pd.to_numeric',
    'pd.to_timedelta', 'pd.concat', 'pd.isna', 'pd.notna', 'pd.cut', 'pd.qcut',
    'pd.date_range',
    # --- safe builtins ---
    'len', 'max', 'min', 'sum', 'range', 'abs', 'round', 'int', 'float', 'bool',
})

# Builtins exposed to formula evaluation. Mirrors the callable builtins permitted by
# ALLOWED_CALLS so the runtime surface matches what validation allows. Everything else
# (open, __import__, eval, exec, getattr, compile, ...) is intentionally absent.
SAFE_BUILTINS: dict[str, Any] = {
    'abs': abs, 'len': len, 'max': max, 'min': min, 'sum': sum,
    'range': range, 'round': round, 'int': int, 'float': float, 'bool': bool,
    'True': True, 'False': False, 'None': None,
}


def _is_dunder(name: str) -> bool:
    """True for names like ``__class__`` that enable sandbox-escape attribute walks."""
    return len(name) > 4 and name.startswith('__') and name.endswith('__')


def find_function_calls(tree: ast.AST) -> set[str]:
    """Return the names of all *direct* function calls in an AST.

    Simple calls (``func()``) are returned by name; module-attribute calls
    (``np.exp()``) as ``"module.func"``. Method calls on expressions
    (``col['x'].rolling(...)``) are intentionally not reported — their receiver is
    not a bare name, so they cannot be used to reach module-level dangerous
    functions and are always allowed.
    """
    functions: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name):
                functions.add(func.id)
            elif isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name):
                functions.add(f"{func.value.id}.{func.attr}")
    return functions


def _parse(code: str) -> ast.AST:
    if not code or not code.strip():
        raise UnsafeFormulaError("Formula is empty")
    try:
        return ast.parse(code)
    except SyntaxError as e:
        raise UnsafeFormulaError(f"Formula syntax error: {e.msg}") from e


def _reject_escapes(tree: ast.AST) -> None:
    """Reject imports and dunder access — the routes to a sandbox escape."""
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            raise UnsafeFormulaError("import statements are not allowed in formulas")
        if isinstance(node, ast.Attribute) and _is_dunder(node.attr):
            raise UnsafeFormulaError(f"access to '{node.attr}' is not allowed in formulas")
        if isinstance(node, ast.Name) and _is_dunder(node.id):
            raise UnsafeFormulaError(f"use of '{node.id}' is not allowed in formulas")


def assert_no_escape(code: str) -> None:
    """Validate that *code* cannot escape the eval sandbox (imports / dunders).

    Used for evaluation contexts whose namespace is already locked down to a curated
    set of callables with empty builtins (e.g. the regression engine's ``SAFE_MATH``),
    where the function-call whitelist would be redundant and overly strict.
    """
    if is_unsafe_allowed():
        return
    _reject_escapes(_parse(code))


def assert_formula_safe(code: str) -> None:
    """Full validation for formulas evaluated with ``np`` / ``pd`` / ``col`` in scope.

    Blocks imports and dunder access, and restricts every direct function call to the
    vetted :data:`ALLOWED_CALLS` whitelist (so e.g. ``pd.read_pickle`` or ``np.load``
    are refused). Accepts both expression formulas (``col['a'] + col['b']``) and
    multi-line statement formulas with comments (``result1 = ...``).

    Raises:
        UnsafeFormulaError: if the formula is empty, malformed, or contains
            disallowed constructs.
    """
    if is_unsafe_allowed():
        return
    tree = _parse(code)
    _reject_escapes(tree)
    unsafe = sorted(
        name for name in find_function_calls(tree)
        if name not in ALLOWED_CALLS and f"np.{name}" not in ALLOWED_CALLS
    )
    if unsafe:
        raise UnsafeFormulaError(
            "unsupported function call(s): " + ", ".join(unsafe) + ". "
            "Only numpy/pandas math functions and Series methods are allowed."
        )


def safe_eval(code: str, namespace: dict[str, Any]) -> Any:
    """Validate then ``eval`` an expression formula with builtins locked down.

    *namespace* supplies the formula variables (``col``, ``np``, ``pd``, global
    variables, ...). It is not mutated; a copy with hardened ``__builtins__`` is used.
    """
    assert_formula_safe(code)
    scope = dict(namespace)
    # When the sandbox is opted out, run with real builtins so trusted formulas
    # using non-whitelisted calls work; otherwise lock builtins down.
    if not is_unsafe_allowed():
        scope['__builtins__'] = SAFE_BUILTINS
    return eval(code, scope)  # noqa: S307 - gated by assert_formula_safe + locked builtins


def safe_exec(code: str, namespace: dict[str, Any]) -> dict[str, Any]:
    """Validate then ``exec`` a statement formula in *namespace* (builtins locked).

    *namespace* is hardened in place (callers read ``result``/``result1``/... back from
    it after execution) and returned for convenience.
    """
    assert_formula_safe(code)
    # When the sandbox is opted out, run with real builtins so trusted formulas
    # using non-whitelisted calls work; otherwise lock builtins down.
    if not is_unsafe_allowed():
        namespace['__builtins__'] = SAFE_BUILTINS
    exec(code, namespace)  # noqa: S102 - gated by assert_formula_safe + locked builtins
    return namespace
