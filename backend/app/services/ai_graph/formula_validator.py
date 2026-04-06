"""
Formula validation for AI-generated Python expressions.

Provides comprehensive validation including:
- AST parsing for syntax checking
- Column existence validation
- Safety checks (no dangerous functions)
- Operator validation (** instead of ^)
"""

import ast
import os
import re
import logging
from typing import Optional
from difflib import get_close_matches

from .schemas import ValidationResult, FormulaConfig

logger = logging.getLogger(__name__)


def _get_debug_level() -> int:
    """Retrieve the debug verbosity level from environment variable.

    Reads the AI_DEBUG_LEVEL environment variable to control logging verbosity.
    Higher values enable more detailed debug output.

    Returns:
        Integer debug level (0 = disabled, 1 = minimal, 2 = verbose, 3 = trace).
        Returns 0 if the environment variable is not set or invalid.
    """
    try:
        return int(os.environ.get("AI_DEBUG_LEVEL", "0"))
    except ValueError:
        return 0


def _debug_log(msg: str, min_level: int = 2) -> None:
    """Log a debug message if the current debug level meets the threshold.

    Args:
        msg: The debug message to log.
        min_level: Minimum debug level required to emit this message.
            Level 2 is used for standard validation steps,
            level 3 for detailed trace information.
    """
    if _get_debug_level() >= min_level:
        logger.info(f"[AI-DEBUG] {msg}")


# ============= Safe Functions Whitelist =============

# Whitelist of allowed function calls in formulas. These are safe mathematical
# operations that cannot be used for code execution or system access.
SAFE_FUNCTIONS = {
    # NumPy functions
    'np.exp', 'np.log', 'np.log10', 'np.log2', 'np.sqrt', 'np.abs',
    'np.sin', 'np.cos', 'np.tan', 'np.arcsin', 'np.arccos', 'np.arctan',
    'np.sinh', 'np.cosh', 'np.tanh',
    'np.power', 'np.square', 'np.cbrt',
    'np.mean', 'np.std', 'np.sum', 'np.min', 'np.max',
    'np.clip', 'np.where', 'np.sign', 'np.floor', 'np.ceil', 'np.round',
    'np.nan', 'np.inf', 'np.isnan', 'np.isinf',
    # Math functions (often aliased to np)
    'exp', 'log', 'log10', 'sqrt', 'abs',
    'sin', 'cos', 'tan',
    # Built-in safe functions
    'len', 'max', 'min', 'sum', 'range',
}

# Blacklist of dangerous patterns that indicate potential code injection attempts.
# These patterns are rejected to prevent arbitrary code execution.
DANGEROUS_PATTERNS = [
    'eval', 'exec', 'compile', 'open', 'import', '__import__',
    'os.', 'sys.', 'subprocess.', 'shutil.',
    'globals', 'locals', 'vars', 'dir',
    '__builtins__', '__class__', '__bases__',
    'getattr', 'setattr', 'delattr',
    'file', 'input', 'raw_input',
]


# ============= Syntax Validation =============

def validate_syntax(expression: str) -> tuple[bool, str]:
    """Validate Python syntax using AST parsing.

    Parses the expression as Python code to check for syntax errors.
    This is the first validation step to ensure the formula is
    parseable before further analysis.

    Args:
        expression: The Python formula expression to validate.

    Returns:
        A tuple of (is_valid, error_message) where is_valid is True
        if syntax is correct, and error_message contains the syntax
        error details if validation fails.

    Example:
        >>> validate_syntax("result = col['a'] + col['b']")
        (True, "")
        >>> validate_syntax("result = col['a' +")
        (False, "Syntax error at line 1, column 18: unexpected EOF...")
    """
    if not expression or not expression.strip():
        return False, "Formula expression is empty"

    try:
        ast.parse(expression)
        return True, ""
    except SyntaxError as e:
        return False, f"Syntax error at line {e.lineno}, column {e.offset}: {e.msg}"


def fix_common_syntax_errors(expression: str) -> str:
    """Attempt to automatically fix common syntax errors in formulas.

    Applies heuristic transformations to convert common mathematical
    notation to valid Python syntax. This allows AI-generated formulas
    or user input with mathematical conventions to be corrected.

    Fixes applied:
        - ``^`` to ``**``: Power operator (Excel/math notation)
        - ``2x`` to ``2*x``: Implicit multiplication between numbers and variables
        - ``)x`` to ``)*x``: Implicit multiplication after closing parenthesis
        - ``x(`` to ``x*(``): Implicit multiplication before opening parenthesis
        - Unclosed parentheses: Appends missing closing parentheses

    Args:
        expression: The formula expression to fix.

    Returns:
        The corrected expression with common syntax issues resolved.

    Example:
        >>> fix_common_syntax_errors("2x^2 + 3x")
        "2*x**2 + 3*x"
        >>> fix_common_syntax_errors("(a+b)(c+d")
        "(a+b)*(c+d)"
    """
    fixed = expression

    # Replace ^ with ** for power
    fixed = fixed.replace('^', '**')

    # Insert multiplication between number and variable (2x -> 2*x)
    # Exclude patterns like col['name'], np.func, result1, pd.Series
    # Only match digit followed by a standalone variable start (not part of known identifiers)
    fixed = re.sub(r'(\d)(?!\s*[\[\]\.,=:])([a-zA-Z_](?!\w*\[))(?<!col)(?<!result)', r'\1*\2', fixed)

    # Insert multiplication between closing paren and variable
    # Exclude method calls like ).mean(), ).rolling()
    fixed = re.sub(r'\)([a-zA-Z_])(?!\.)', r')*\1', fixed)

    # Insert multiplication between variable and opening paren
    # Exclude function/method calls: np.exp(, col(, .rolling(, etc.
    # Only match single-letter variables followed by (
    fixed = re.sub(r'(?<![a-zA-Z0-9_\.])([a-zA-Z])\(', r'\1*(', fixed)

    # Count parentheses and add missing closing ones
    open_count = fixed.count('(')
    close_count = fixed.count(')')
    if open_count > close_count:
        fixed += ')' * (open_count - close_count)

    return fixed


# ============= Safety Validation =============

def validate_safety(expression: str) -> tuple[bool, str]:
    """Check for dangerous patterns that could enable code injection.

    Performs a case-insensitive scan for patterns that indicate attempts
    to execute arbitrary code, access the file system, or import modules.
    This is a defense-in-depth measure against malicious formulas.

    String literals inside col['...'] are stripped before scanning to avoid
    false positives on column names like 'profile', 'direction', 'file_size'.

    Args:
        expression: The formula expression to check.

    Returns:
        A tuple of (is_safe, error_message) where is_safe is True if
        no dangerous patterns are found, and error_message identifies
        the unsafe pattern if validation fails.
    """
    # Strip string literals to avoid false positives on column names
    # e.g. col['profile'] should not trigger 'file' pattern
    stripped = re.sub(r"col\[(['\"]).*?\1\]", 'col["_"]', expression)
    # Also strip other string literals
    stripped = re.sub(r"(['\"]).*?\1", '"_"', stripped)
    lower_expr = stripped.lower()

    for pattern in DANGEROUS_PATTERNS:
        if pattern.lower() in lower_expr:
            return False, f"Unsafe pattern detected: '{pattern}'"

    return True, ""


def find_function_calls(expression: str) -> set[str]:
    """Extract all function call names from an expression using AST analysis.

    Parses the expression and walks the AST to identify all function calls,
    including both simple calls (``func()``) and attribute calls (``np.func()``).

    Args:
        expression: The Python expression to analyze.

    Returns:
        A set of function names found in the expression. Attribute-style
        calls are returned as "module.function" (e.g., "np.exp").

    Example:
        >>> find_function_calls("result = np.exp(x) + log(y)")
        {"np.exp", "log"}
    """
    try:
        tree = ast.parse(expression)
    except SyntaxError:
        return set()

    functions = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            # Get the function name
            if isinstance(node.func, ast.Name):
                functions.add(node.func.id)
            elif isinstance(node.func, ast.Attribute):
                # Handle np.function() style calls
                if isinstance(node.func.value, ast.Name):
                    functions.add(f"{node.func.value.id}.{node.func.attr}")

    return functions


def validate_function_calls(expression: str) -> tuple[bool, list[str]]:
    """Validate that all function calls use only whitelisted safe functions.

    Ensures that formulas only use approved mathematical functions from
    numpy and Python builtins. This prevents calling arbitrary functions
    that could be used for code execution.

    Args:
        expression: The formula expression to validate.

    Returns:
        A tuple of (all_safe, unsafe_functions) where all_safe is True
        if all functions are whitelisted, and unsafe_functions lists
        any function names that are not approved.

    Example:
        >>> validate_function_calls("result = np.exp(x) + np.log(y)")
        (True, [])
        >>> validate_function_calls("result = custom_func(x)")
        (False, ["custom_func"])
    """
    used_functions = find_function_calls(expression)
    unsafe = []

    for func in used_functions:
        # Check if function is safe (directly or as np.function)
        if func not in SAFE_FUNCTIONS and f"np.{func}" not in SAFE_FUNCTIONS:
            # Check if it might be a column reference (allowed)
            # Only col[...] is allowed now
            unsafe.append(func)

    return len(unsafe) == 0, unsafe


# ============= Column Validation =============

def extract_column_references(expression: str) -> set[str]:
    """Extract all column references from a formula expression.

    Identifies column names referenced in the formula using two methods:
    1. Explicit subscript notation: ``col['column_name']`` or ``col["column_name"]``
    2. Standalone variable names that aren't keywords or safe functions

    Note:
        The ``df['column']`` format is no longer supported. All formulas
        should use the ``col['column']`` notation for consistency.

    Args:
        expression: The formula expression to analyze.

    Returns:
        A set of column names referenced in the expression.

    Example:
        >>> extract_column_references("result = col['temp'] + pressure")
        {"temp", "pressure"}
    """
    columns = set()


    # Match col['column'] or col["column"]
    # We strictly enforce 'col' usage now, 'df' is not allowed
    col_pattern = r"col\[(['\"])(.+?)\1\]"
    for match in re.finditer(col_pattern, expression):
        columns.add(match.group(2))

    # Match standalone variable names (excluding keywords, functions, and assignment targets)
    try:
        tree = ast.parse(expression)
        # Collect assignment targets to exclude them
        assigned_names = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        assigned_names.add(target.id)
            elif isinstance(node, ast.AugAssign):
                if isinstance(node.target, ast.Name):
                    assigned_names.add(node.target.id)
        
        for node in ast.walk(tree):
            if isinstance(node, ast.Name):
                name = node.id
                # Skip known keywords, functions, and assignment targets
                if name in {'col', 'np', 'result', 'True', 'False', 'None', 'pd'}:
                    continue
                if name in assigned_names:
                    continue
                if name not in SAFE_FUNCTIONS and not name.startswith('result'):
                    columns.add(name)
    except SyntaxError:
        pass

    return columns


def validate_column_references(
    expression: str,
    valid_columns: set[str]
) -> tuple[bool, list[tuple[str, str]]]:
    """Validate that all column references exist in the dataset.

    Checks each referenced column against the set of valid column names
    and attempts to provide correction suggestions for invalid references
    using wildcard pattern matching and fuzzy string matching.

    Args:
        expression: The formula expression to validate.
        valid_columns: Set of valid column names from the dataset.

    Returns:
        A tuple of (all_valid, invalid_columns) where all_valid is True
        if all columns exist, and invalid_columns is a list of tuples
        containing (invalid_name, suggested_name). The suggestion may
        be empty if no close match is found.

    Example:
        >>> validate_column_references("col['temprature']", {"temperature", "pressure"})
        (False, [("temprature", "temperature")])
        >>> validate_column_references("col['Temp*']", {"Temperature_1", "Pressure"})
        (False, [("Temp*", "Temperature_1")])
    """
    used_columns = extract_column_references(expression)
    invalid = []

    for col in used_columns:
        if col not in valid_columns:
            suggestion = ""

            # Check if it's a wildcard pattern (contains *)
            if '*' in col:
                # Convert wildcard to regex pattern
                pattern = col.replace('*', '.*')
                try:
                    regex = re.compile(f'^{pattern}$', re.IGNORECASE)
                    matches = [c for c in valid_columns if regex.match(c)]
                    if len(matches) == 1:
                        # Exactly one match - use it
                        suggestion = matches[0]
                    elif len(matches) > 1:
                        # Multiple matches - pick first or closest
                        suggestion = matches[0]
                except re.error:
                    pass

            # If no wildcard match, try fuzzy matching
            if not suggestion:
                matches = get_close_matches(col, list(valid_columns), n=1, cutoff=0.5)
                suggestion = matches[0] if matches else ""

            invalid.append((col, suggestion))

    return len(invalid) == 0, invalid


# ============= Result Assignment Validation =============

def validate_result_assignment(expression: str) -> tuple[bool, str]:
    """Check that the formula assigns to a result variable.

    Verifies that the formula includes an assignment to ``result`` or
    a numbered variant like ``result1``, ``result2``, etc. This is
    required for the formula execution engine to capture the output.

    Args:
        expression: The formula expression to validate.

    Returns:
        A tuple of (has_result, error_message) where has_result is True
        if a valid result assignment is found, and error_message provides
        guidance if validation fails.

    Example:
        >>> validate_result_assignment("result = col['a'] + col['b']")
        (True, "")
        >>> validate_result_assignment("col['a'] + col['b']")
        (False, "Formula must assign to 'result'...")
    """
    # Check for result = or result1 =, result2 =, etc.
    result_pattern = r'\bresult\d*\s*='
    if re.search(result_pattern, expression):
        return True, ""

    return False, "Formula must assign to 'result' (e.g., 'result = col['col1'] + col['col2']')"


def add_result_assignment(expression: str) -> str:
    """Add 'result = ' prefix to an expression if missing.

    Automatically wraps expressions that don't assign to a result
    variable with the standard ``result = `` prefix.

    Args:
        expression: The formula expression to modify.

    Returns:
        The expression with ``result = `` prepended if no result
        assignment was present, otherwise returns unchanged.

    Example:
        >>> add_result_assignment("col['a'] + col['b']")
        "result = col['a'] + col['b']"
        >>> add_result_assignment("result = col['a']")
        "result = col['a']"
    """
    if not re.search(r'\bresult\d*\s*=', expression):
        return f"result = {expression}"
    return expression


# ============= Main Validation Function =============

def validate_formula(
    expression: str,
    valid_columns: set[str],
    auto_fix: bool = True
) -> tuple[ValidationResult, str]:
    """Perform comprehensive validation of a formula expression.

    Executes a multi-step validation pipeline to ensure the formula is:
    1. Syntactically correct Python code
    2. Free of dangerous code patterns
    3. Using only whitelisted safe functions
    4. Referencing only existing dataset columns
    5. Properly assigning to a result variable

    When auto_fix is enabled, common issues are automatically corrected:
    - Power operator (^ to **)
    - Implicit multiplication
    - Missing result assignment
    - Column name typos (via fuzzy matching)

    Args:
        expression: The Python formula expression to validate.
        valid_columns: Set of valid column names from the dataset.
        auto_fix: If True, attempt to automatically correct common issues.
            Defaults to True.

    Returns:
        A tuple of (validation_result, fixed_expression) where
        validation_result contains any errors found, and fixed_expression
        is the potentially corrected formula.

    Example:
        >>> result, fixed = validate_formula(
        ...     "col['temp'] ^ 2",
        ...     {"temp", "pressure"},
        ...     auto_fix=True
        ... )
        >>> result.is_valid
        True
        >>> fixed
        "result = col['temp'] ** 2"
    """
    result = ValidationResult()
    fixed = expression
    
    _debug_log(f"  Formula validation started", min_level=2)
    _debug_log(f"       Input: {expression[:80]}{'...' if len(expression) > 80 else ''}", min_level=2)
    _debug_log(f"       auto_fix: {auto_fix}", min_level=3)
    _debug_log(f"       valid_columns: {len(valid_columns)} available", min_level=3)
    
    if auto_fix:
        fixed = fix_common_syntax_errors(fixed)
        if fixed != expression:
            _debug_log(f"       Auto-fixed syntax: {fixed[:80]}{'...' if len(fixed) > 80 else ''}", min_level=2)
    
    # 1. Syntax check
    
    is_valid, error = validate_syntax(fixed)
    _debug_log(f"       Step 1 - Syntax check: {'✓ PASS' if is_valid else '✗ FAIL'}", min_level=2)
    if not is_valid:
        _debug_log(f"         Error: {error}", min_level=2)
        result.add_error("expression", f"Syntax error: {error}", 
                        "Check brackets, operators, and quotes")
        return result, fixed
    
    # 2. Safety check
    is_safe, error = validate_safety(fixed)
    _debug_log(f"       Step 2 - Safety check: {'✓ PASS' if is_safe else '✗ FAIL'}", min_level=2)
    if not is_safe:
        _debug_log(f"         Error: {error}", min_level=2)
        result.add_error("expression", f"Safety error: {error}",
                        "Remove unsafe functions and use only numpy/math operations")
        return result, fixed
    
    # 3. Function call validation
    all_safe, unsafe_funcs = validate_function_calls(fixed)
    _debug_log(f"       Step 3 - Function calls: {'✓ PASS' if all_safe else '✗ FAIL'}", min_level=2)
    if not all_safe:
        _debug_log(f"         Unsafe functions: {unsafe_funcs}", min_level=2)
        result.add_error("expression", 
                        f"Unsupported functions: {', '.join(unsafe_funcs)}",
                        "Use numpy functions like np.exp, np.log, np.sqrt, etc.")
    
    # 4. Column validation
    cols_valid, invalid_cols = validate_column_references(fixed, valid_columns)
    _debug_log(f"       Step 4 - Column references: {'✓ PASS' if cols_valid else '✗ FAIL'}", min_level=2)
    if not cols_valid:
        _debug_log(f"         Invalid columns: {[col for col, _ in invalid_cols]}", min_level=2)
        # Check if we can auto-fix using suggestions (e.g., from wildcard patterns)
        fixable_cols = [(col, sug) for col, sug in invalid_cols if sug]
        unfixable_cols = [(col, sug) for col, sug in invalid_cols if not sug]
        
        if auto_fix and fixable_cols:
            # Log the fixes being applied
            for col, sug in fixable_cols:
                logger.info(f"  Auto-fixing column: '{col}' → '{sug}'")
                _debug_log(f"         Auto-fix: '{col}' → '{sug}'", min_level=2)
            # Apply fixes for columns with suggestions
            fixed = fix_formula_with_suggestions(fixed, fixable_cols)
        
        # Report errors only for columns we couldn't fix
        for col, suggestion in (unfixable_cols if auto_fix else invalid_cols):
            fix_msg = f"Did you mean '{suggestion}'?" if suggestion else "Check column name spelling"
            result.add_error("columns", f"Unknown column: '{col}'", fix_msg)
    
    # 5. Result assignment check
    has_result, error = validate_result_assignment(fixed)
    _debug_log(f"       Step 5 - Result assignment: {'✓ PASS' if has_result else '✗ FAIL'}", min_level=2)
    if not has_result:
        if auto_fix:
            fixed = add_result_assignment(fixed)
            _debug_log(f"         Auto-added result assignment", min_level=2)
        else:
            result.add_error("expression", error, "Add 'result = ' at the beginning")
    
    _debug_log(f"       Validation complete: {'✓ VALID' if result.is_valid else '✗ INVALID'}", min_level=2)
    if fixed != expression:
        _debug_log(f"       Final formula: {fixed[:80]}{'...' if len(fixed) > 80 else ''}", min_level=2)
    
    return result, fixed


def fix_formula_with_suggestions(
    expression: str,
    invalid_columns: list[tuple[str, str]]
) -> str:
    """Apply automatic column name corrections to a formula.

    Replaces invalid column references with their suggested corrections.
    Handles both subscript notation (``col['name']``) and standalone
    variable references.

    Args:
        expression: The formula expression to fix.
        invalid_columns: List of (invalid_name, suggested_name) tuples
            from column validation. Only entries with non-empty
            suggestions are applied.

    Returns:
        The corrected expression with invalid column names replaced
        by their suggestions.

    Example:
        >>> fix_formula_with_suggestions(
        ...     "result = col['temprature'] + presure",
        ...     [("temprature", "temperature"), ("presure", "pressure")]
        ... )
        "result = col['temperature'] + pressure"
    """
    fixed = expression

    for invalid, suggested in invalid_columns:
        if suggested:
            # Replace in col['column'] format
            fixed = re.sub(
                rf"col\[(['\"]){re.escape(invalid)}\1\]",
                f"col['{suggested}']",
                fixed
            )
            # Replace as standalone variable
            fixed = re.sub(
                rf"\b{re.escape(invalid)}\b",
                suggested,
                fixed
            )

    return fixed
