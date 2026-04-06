"""Tests for backend/app/services/ai_graph/formula_validator.py."""
import pytest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.ai_graph.formula_validator import (
    validate_syntax, fix_common_syntax_errors, validate_safety,
    find_function_calls, validate_function_calls, extract_column_references,
    validate_column_references, validate_result_assignment, add_result_assignment,
    validate_formula, fix_formula_with_suggestions, SAFE_FUNCTIONS, DANGEROUS_PATTERNS
)


# ============= validate_syntax =============

class TestValidateSyntax:

    def test_valid_simple_expression(self):
        is_valid, error = validate_syntax("result = col['a'] + col['b']")
        assert is_valid is True
        assert error == ""

    def test_valid_multiline(self):
        expr = "x = 1\nresult = x + 2"
        is_valid, error = validate_syntax(expr)
        assert is_valid is True
        assert error == ""

    def test_empty_string(self):
        is_valid, error = validate_syntax("")
        assert is_valid is False
        assert "empty" in error.lower()

    def test_whitespace_only(self):
        is_valid, error = validate_syntax("   ")
        assert is_valid is False
        assert "empty" in error.lower()

    def test_syntax_error_unclosed_bracket(self):
        is_valid, error = validate_syntax("result = col['a' +")
        assert is_valid is False
        assert "Syntax error" in error

    def test_syntax_error_invalid_operator(self):
        is_valid, error = validate_syntax("result = 1 */ 2")
        assert is_valid is False
        assert "Syntax error" in error

    def test_valid_numpy_expression(self):
        is_valid, error = validate_syntax("result = np.exp(col['x'])")
        assert is_valid is True
        assert error == ""


# ============= fix_common_syntax_errors =============

class TestFixCommonSyntaxErrors:

    def test_caret_to_power(self):
        result = fix_common_syntax_errors("x^2")
        assert "**" in result
        assert "^" not in result

    def test_implicit_multiplication_number_variable(self):
        result = fix_common_syntax_errors("2x")
        assert result == "2*x"

    def test_implicit_multiplication_multiple(self):
        result = fix_common_syntax_errors("3a + 4b")
        assert "3*a" in result
        assert "4*b" in result

    def test_implicit_multiplication_closing_paren_variable(self):
        result = fix_common_syntax_errors("(a+b)x")
        assert ")*x" in result

    def test_implicit_multiplication_variable_opening_paren(self):
        # Note: this also affects function calls like np.exp(x) -> np.exp*(x)
        # which is a known limitation of the heuristic approach
        result = fix_common_syntax_errors("x(a+b)")
        assert "x*(" in result

    def test_unclosed_parentheses_single(self):
        result = fix_common_syntax_errors("(a + b")
        assert result.count("(") == result.count(")")

    def test_unclosed_parentheses_multiple(self):
        result = fix_common_syntax_errors("((a + b")
        assert result.count("(") == result.count(")")
        assert result.endswith("))")

    def test_balanced_parentheses_unchanged(self):
        result = fix_common_syntax_errors("(a + b)")
        # Parentheses already balanced, closing paren followed by nothing
        assert result.count("(") == result.count(")")

    def test_combined_fixes(self):
        result = fix_common_syntax_errors("2x^2 + 3x")
        assert "**" in result
        assert "2*x" in result
        assert "3*x" in result

    def test_no_changes_needed(self):
        expr = "result = col['a'] + col['b']"
        result = fix_common_syntax_errors(expr)
        # The expression should not be drastically altered
        assert "col" in result


# ============= validate_safety =============

class TestValidateSafety:

    def test_safe_expression(self):
        is_safe, error = validate_safety("result = col['a'] + 1")
        assert is_safe is True
        assert error == ""

    def test_safe_numpy_expression(self):
        is_safe, error = validate_safety("result = np.exp(col['x']) + np.log(col['y'])")
        assert is_safe is True
        assert error == ""

    def test_unsafe_eval(self):
        is_safe, error = validate_safety("result = eval('malicious')")
        assert is_safe is False
        assert "eval" in error

    def test_unsafe_exec(self):
        is_safe, error = validate_safety("exec('import os')")
        assert is_safe is False
        assert "exec" in error

    def test_unsafe_os_dot(self):
        is_safe, error = validate_safety("os.system('rm -rf /')")
        assert is_safe is False
        assert "os." in error

    def test_unsafe_import(self):
        is_safe, error = validate_safety("import subprocess")
        assert is_safe is False
        assert "import" in error

    def test_unsafe_builtins(self):
        is_safe, error = validate_safety("__builtins__['eval']('code')")
        assert is_safe is False
        assert "Unsafe" in error

    def test_unsafe_subprocess(self):
        is_safe, error = validate_safety("subprocess.call(['ls'])")
        assert is_safe is False
        assert "subprocess." in error

    def test_unsafe_getattr(self):
        is_safe, error = validate_safety("getattr(obj, 'method')()")
        assert is_safe is False
        assert "getattr" in error

    def test_unsafe_compile(self):
        # Use input without 'exec' in string literals to avoid matching exec first
        is_safe, error = validate_safety("compile('code', '<string>', 'eval')")
        assert is_safe is False
        assert "Unsafe" in error

    def test_unsafe_case_insensitive(self):
        is_safe, error = validate_safety("EVAL('test')")
        assert is_safe is False

    def test_all_dangerous_patterns_detected(self):
        """Verify that every entry in DANGEROUS_PATTERNS is actually caught."""
        for pattern in DANGEROUS_PATTERNS:
            is_safe, error = validate_safety(f"result = {pattern}(x)")
            assert is_safe is False, f"Pattern '{pattern}' was not detected as unsafe"


# ============= find_function_calls =============

class TestFindFunctionCalls:

    def test_attribute_call_np_exp(self):
        functions = find_function_calls("result = np.exp(x)")
        assert "np.exp" in functions

    def test_plain_function_call(self):
        functions = find_function_calls("result = abs(x)")
        assert "abs" in functions

    def test_multiple_function_calls(self):
        functions = find_function_calls("result = np.log(x) + abs(y) + np.sqrt(z)")
        assert "np.log" in functions
        assert "abs" in functions
        assert "np.sqrt" in functions

    def test_no_function_calls(self):
        functions = find_function_calls("result = x + y * 2")
        assert len(functions) == 0

    def test_syntax_error_returns_empty(self):
        functions = find_function_calls("result = np.exp(")
        assert len(functions) == 0

    def test_nested_function_calls(self):
        functions = find_function_calls("result = np.exp(np.log(x))")
        assert "np.exp" in functions
        assert "np.log" in functions


# ============= validate_function_calls =============

class TestValidateFunctionCalls:

    def test_all_safe_functions(self):
        all_safe, unsafe = validate_function_calls("result = np.exp(x) + np.log(y)")
        assert all_safe is True
        assert unsafe == []

    def test_safe_builtin_functions(self):
        all_safe, unsafe = validate_function_calls("result = abs(x) + max(y)")
        assert all_safe is True
        assert unsafe == []

    def test_unsafe_custom_function(self):
        all_safe, unsafe = validate_function_calls("result = custom_func(x)")
        assert all_safe is False
        assert "custom_func" in unsafe

    def test_mixed_safe_and_unsafe(self):
        all_safe, unsafe = validate_function_calls("result = np.exp(x) + danger(y)")
        assert all_safe is False
        assert "danger" in unsafe
        assert "np.exp" not in unsafe

    def test_no_functions_is_safe(self):
        all_safe, unsafe = validate_function_calls("result = x + y")
        assert all_safe is True
        assert unsafe == []

    def test_safe_functions_whitelist_not_empty(self):
        """Verify the whitelist contains expected entries."""
        assert "np.exp" in SAFE_FUNCTIONS
        assert "np.log" in SAFE_FUNCTIONS
        assert "abs" in SAFE_FUNCTIONS
        assert "len" in SAFE_FUNCTIONS


# ============= extract_column_references =============

class TestExtractColumnReferences:

    def test_col_single_quote(self):
        columns = extract_column_references("result = col['temperature']")
        assert "temperature" in columns

    def test_col_double_quote(self):
        columns = extract_column_references('result = col["pressure"]')
        assert "pressure" in columns

    def test_multiple_col_references(self):
        columns = extract_column_references("result = col['temp'] + col['press']")
        assert "temp" in columns
        assert "press" in columns

    def test_standalone_variable(self):
        columns = extract_column_references("result = temperature + 1")
        assert "temperature" in columns

    def test_excludes_known_keywords(self):
        columns = extract_column_references("result = col['x'] + np.exp(col['y'])")
        assert "col" not in columns
        assert "np" not in columns
        assert "result" not in columns

    def test_excludes_safe_functions(self):
        columns = extract_column_references("result = abs(x) + len(y)")
        # abs and len are in SAFE_FUNCTIONS, so they should be excluded
        assert "abs" not in columns
        assert "len" not in columns

    def test_syntax_error_still_extracts_col_patterns(self):
        # Even with a syntax error, regex-based col['...'] extraction works
        columns = extract_column_references("result = col['temp'] + (")
        assert "temp" in columns

    def test_column_with_spaces(self):
        columns = extract_column_references("result = col['my column']")
        assert "my column" in columns


# ============= validate_column_references =============

class TestValidateColumnReferences:

    def test_all_valid_columns(self):
        valid_cols = {"temperature", "pressure"}
        is_valid, invalid = validate_column_references(
            "result = col['temperature'] + col['pressure']",
            valid_cols
        )
        assert is_valid is True
        assert invalid == []

    def test_invalid_column_with_fuzzy_match(self):
        valid_cols = {"temperature", "pressure"}
        is_valid, invalid = validate_column_references(
            "result = col['temprature']",
            valid_cols
        )
        assert is_valid is False
        assert len(invalid) == 1
        col_name, suggestion = invalid[0]
        assert col_name == "temprature"
        assert suggestion == "temperature"

    def test_invalid_column_no_match(self):
        valid_cols = {"temperature", "pressure"}
        is_valid, invalid = validate_column_references(
            "result = col['xyz_totally_wrong']",
            valid_cols
        )
        assert is_valid is False
        assert len(invalid) == 1
        col_name, suggestion = invalid[0]
        assert col_name == "xyz_totally_wrong"
        # No close match expected
        assert suggestion == ""

    def test_wildcard_pattern_single_match(self):
        valid_cols = {"Temperature_1", "Pressure_1"}
        is_valid, invalid = validate_column_references(
            "result = col['Temp*']",
            valid_cols
        )
        assert is_valid is False
        assert len(invalid) == 1
        col_name, suggestion = invalid[0]
        assert col_name == "Temp*"
        assert suggestion == "Temperature_1"

    def test_wildcard_pattern_multiple_matches(self):
        valid_cols = {"Temp_1", "Temp_2", "Pressure"}
        is_valid, invalid = validate_column_references(
            "result = col['Temp*']",
            valid_cols
        )
        assert is_valid is False
        assert len(invalid) == 1
        col_name, suggestion = invalid[0]
        assert col_name == "Temp*"
        # Should pick one of the matches
        assert suggestion in {"Temp_1", "Temp_2"}

    def test_standalone_variable_validated(self):
        valid_cols = {"x", "y"}
        is_valid, invalid = validate_column_references(
            "result = x + y",
            valid_cols
        )
        assert is_valid is True
        assert invalid == []


# ============= validate_result_assignment =============

class TestValidateResultAssignment:

    def test_result_equals(self):
        has_result, error = validate_result_assignment("result = col['a'] + col['b']")
        assert has_result is True
        assert error == ""

    def test_result1_equals(self):
        has_result, error = validate_result_assignment("result1 = col['a'] + col['b']")
        assert has_result is True
        assert error == ""

    def test_result2_equals(self):
        has_result, error = validate_result_assignment("result2 = col['a'] * 2")
        assert has_result is True
        assert error == ""

    def test_missing_result(self):
        has_result, error = validate_result_assignment("col['a'] + col['b']")
        assert has_result is False
        assert "result" in error.lower()

    def test_result_no_space_before_equals(self):
        has_result, error = validate_result_assignment("result= col['a']")
        assert has_result is True
        assert error == ""

    def test_result_in_wrong_context(self):
        # 'result' appears but not as an assignment target
        has_result, error = validate_result_assignment("x = result + 1")
        # The regex \bresult\d*\s*= would NOT match here because 'result' is not
        # followed by '=' in this context. Actually, let's check: "result + 1"
        # does not have result followed by =, but "x = result + 1" has no result= either.
        assert has_result is False


# ============= add_result_assignment =============

class TestAddResultAssignment:

    def test_adds_when_missing(self):
        result = add_result_assignment("col['a'] + col['b']")
        assert result == "result = col['a'] + col['b']"

    def test_does_not_add_when_present(self):
        expr = "result = col['a'] + col['b']"
        result = add_result_assignment(expr)
        assert result == expr

    def test_does_not_add_when_result1_present(self):
        expr = "result1 = col['a']"
        result = add_result_assignment(expr)
        assert result == expr

    def test_preserves_existing_expression(self):
        result = add_result_assignment("np.exp(col['x'])")
        assert result.startswith("result = ")
        assert "np.exp" in result


# ============= validate_formula (full pipeline) =============

class TestValidateFormula:

    def test_valid_formula_no_fixes_needed(self):
        valid_cols = {"a", "b"}
        vr, fixed = validate_formula(
            "result = col['a'] + col['b']",
            valid_cols,
            auto_fix=True
        )
        assert vr.is_valid is True
        assert "col['a']" in fixed
        assert "col['b']" in fixed

    def test_auto_fix_adds_result_assignment(self):
        valid_cols = {"a", "b"}
        vr, fixed = validate_formula(
            "col['a'] + col['b']",
            valid_cols,
            auto_fix=True
        )
        assert vr.is_valid is True
        assert fixed.startswith("result = ")

    def test_auto_fix_caret_to_power(self):
        valid_cols = {"x"}
        vr, fixed = validate_formula(
            "result = col['x'] ^ 2",
            valid_cols,
            auto_fix=True
        )
        # After fix, ^ becomes **
        assert "**" in fixed
        assert "^" not in fixed

    def test_unsafe_formula_rejected(self):
        valid_cols = {"a"}
        vr, fixed = validate_formula(
            "result = eval(col['a'])",
            valid_cols,
            auto_fix=True
        )
        assert vr.is_valid is False
        assert any("Safety error" in e.error or "Unsafe" in e.error for e in vr.errors)

    def test_invalid_syntax_rejected(self):
        valid_cols = {"a"}
        vr, fixed = validate_formula(
            "result = col['a' +++ ",
            valid_cols,
            auto_fix=True
        )
        assert vr.is_valid is False
        assert any("Syntax error" in e.error or "syntax" in e.error.lower() for e in vr.errors)

    def test_auto_fix_disabled(self):
        valid_cols = {"a"}
        vr, fixed = validate_formula(
            "col['a'] + 1",
            valid_cols,
            auto_fix=False
        )
        # Without auto_fix, missing result assignment should be an error
        assert vr.is_valid is False
        assert any("result" in e.error.lower() for e in vr.errors)

    def test_invalid_column_with_auto_fix(self):
        valid_cols = {"temperature", "pressure"}
        vr, fixed = validate_formula(
            "result = col['temprature']",
            valid_cols,
            auto_fix=True
        )
        # The fuzzy match should fix 'temprature' -> 'temperature'
        assert "temperature" in fixed

    def test_unsupported_function_flagged(self):
        valid_cols = {"a"}
        vr, fixed = validate_formula(
            "result = my_custom_func(col['a'])",
            valid_cols,
            auto_fix=True
        )
        assert vr.is_valid is False
        assert any("Unsupported functions" in e.error or "my_custom_func" in e.error for e in vr.errors)

    def test_empty_expression(self):
        valid_cols = {"a"}
        vr, fixed = validate_formula("", valid_cols, auto_fix=True)
        assert vr.is_valid is False


# ============= fix_formula_with_suggestions =============

class TestFixFormulaWithSuggestions:

    def test_replaces_col_reference(self):
        result = fix_formula_with_suggestions(
            "result = col['temprature']",
            [("temprature", "temperature")]
        )
        assert "col['temperature']" in result
        assert "temprature" not in result

    def test_replaces_standalone_variable(self):
        result = fix_formula_with_suggestions(
            "result = presure + 1",
            [("presure", "pressure")]
        )
        assert "pressure" in result
        assert "presure" not in result

    def test_replaces_multiple_columns(self):
        result = fix_formula_with_suggestions(
            "result = col['temprature'] + col['presure']",
            [("temprature", "temperature"), ("presure", "pressure")]
        )
        assert "col['temperature']" in result
        assert "col['pressure']" in result

    def test_skips_empty_suggestion(self):
        original = "result = col['xyz']"
        result = fix_formula_with_suggestions(
            original,
            [("xyz", "")]
        )
        assert result == original

    def test_handles_double_quoted_col(self):
        result = fix_formula_with_suggestions(
            'result = col["temprature"]',
            [("temprature", "temperature")]
        )
        assert "temperature" in result


# ============= Edge Cases & Integration =============

class TestEdgeCasesAndIntegration:

    def test_complex_formula_validates(self):
        valid_cols = {"flow_rate", "density", "viscosity"}
        expr = "result = np.log(col['flow_rate']) * col['density'] / np.sqrt(col['viscosity'])"
        vr, fixed = validate_formula(expr, valid_cols, auto_fix=False)
        assert vr.is_valid is True

    def test_multiple_results_in_one_expression(self):
        """Multi-line expressions with multiple result assignments."""
        expr = "result1 = col['a'] + col['b']\nresult2 = col['a'] * col['b']"
        has_result, _ = validate_result_assignment(expr)
        assert has_result is True

    def test_dangerous_patterns_list_not_empty(self):
        assert len(DANGEROUS_PATTERNS) > 0
        assert "eval" in DANGEROUS_PATTERNS
        assert "exec" in DANGEROUS_PATTERNS

    def test_safe_functions_contains_numpy(self):
        numpy_funcs = [f for f in SAFE_FUNCTIONS if f.startswith("np.")]
        assert len(numpy_funcs) > 10

    def test_validate_formula_returns_validation_result_type(self):
        vr, fixed = validate_formula("result = 1 + 2", set(), auto_fix=True)
        assert hasattr(vr, "is_valid")
        assert hasattr(vr, "errors")
        assert isinstance(fixed, str)
