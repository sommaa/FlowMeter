"""
Validation functions for AI visualization suggestions.

Provides validators for:
- Column existence and type matching
- Visualization type requirements
- Professional output quality
"""

import logging
import os
from typing import Optional
from difflib import get_close_matches

from .schemas import (
    VisualizationSuggestion, 
    ValidationResult, 
    ColumnMetadata,
    VizType,
)


logger = logging.getLogger(__name__)


def _get_debug_level() -> int:
    """Retrieve the debug verbosity level from environment variable.

    Reads the AI_DEBUG_LEVEL environment variable to control logging verbosity.
    Higher values enable more detailed debug output during validation.

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
            Level 2 shows validation step results, level 3 shows detailed
            field-by-field information.
    """
    if _get_debug_level() >= min_level:
        logger.info(f"[AI-DEBUG] {msg}")


# ============= Column Validation =============

def validate_columns_exist(
    suggestion: VisualizationSuggestion,
    valid_columns: set[str]
) -> ValidationResult:
    """Validate that all column references in a suggestion exist in the dataset.

    Checks both x_axis and y_axes against the available columns. Uses fuzzy
    matching to suggest corrections for invalid column names.

    Special cases:
        - Correlation visualizations don't require an x_axis
        - Formula visualizations skip y_axes validation (results are computed)
        - Columns starting with "result" are treated as computed columns

    Args:
        suggestion: The visualization suggestion to validate.
        valid_columns: Set of valid column names from the dataset.

    Returns:
        ValidationResult containing any column-related errors with
        suggested corrections where possible.

    Example:
        >>> result = validate_columns_exist(suggestion, {"temp", "pressure"})
        >>> if not result.is_valid:
        ...     print(result.errors[0].message)
        "Column 'temprature' not found"
    """
    result = ValidationResult()
    _debug_log(f"  validate_columns_exist: {suggestion.title}", min_level=3)
    _debug_log(f"       x_axis: {suggestion.x_axis}", min_level=3)
    _debug_log(f"       y_axes: {suggestion.y_axes}", min_level=3)
    _debug_log(f"       valid_columns: {len(valid_columns)} available", min_level=3)
    
    # Check x_axis - correlation type can have empty x_axis
    if suggestion.viz_type == "correlation" and not suggestion.x_axis:
        _debug_log(f"       (correlation type - x_axis not required)", min_level=3)
    elif suggestion.x_axis and suggestion.x_axis not in valid_columns:
        matches = get_close_matches(suggestion.x_axis, list(valid_columns), n=1, cutoff=0.6)
        suggestion_text = f"Did you mean '{matches[0]}'?" if matches else "Check column name"
        result.add_error("x_axis", f"Column '{suggestion.x_axis}' not found", suggestion_text)
        _debug_log(f"       ✗ x_axis '{suggestion.x_axis}' NOT FOUND", min_level=2)
        if matches:
            _debug_log(f"         Suggested: {matches[0]}", min_level=2)
    elif suggestion.x_axis:
        _debug_log(f"       ✓ x_axis '{suggestion.x_axis}' exists", min_level=3)
    
    # For formula viz types, skip y_axes validation - 'result', 'result1', etc. are computed
    if suggestion.viz_type == "formula":
        _debug_log(f"       (formula type - skipping y_axes validation)", min_level=3)
        return result

    # For KPI viz types, validate metric column references in additional_config.kpi_metrics
    if suggestion.viz_type == "kpi":
        kpi_metrics = getattr(suggestion.additional_config, "kpi_metrics", None) or []
        _debug_log(f"       (kpi type - validating {len(kpi_metrics)} metric columns)", min_level=3)
        for idx, metric in enumerate(kpi_metrics):
            op = getattr(metric, "operation", None)
            col = getattr(metric, "column", None)
            if op == "formula":
                continue  # formula metrics are evaluated at runtime; no column to verify here
            if not col:
                result.add_error(
                    f"additional_config.kpi_metrics[{idx}].column",
                    f"Metric '{getattr(metric, 'label', '?')}' missing 'column'",
                    "Set a column name for non-formula metrics",
                )
                continue
            if col not in valid_columns:
                matches = get_close_matches(col, list(valid_columns), n=1, cutoff=0.6)
                suggestion_text = f"Did you mean '{matches[0]}'?" if matches else "Check column name"
                result.add_error(
                    f"additional_config.kpi_metrics[{idx}].column",
                    f"Column '{col}' not found",
                    suggestion_text,
                )
                _debug_log(f"       ✗ kpi metric column '{col}' NOT FOUND", min_level=2)
            else:
                _debug_log(f"       ✓ kpi metric column '{col}' exists", min_level=3)
        return result

    # Check y_axes
    for col in suggestion.y_axes:
        # Allow common computed/placeholder names that aren't real columns
        if col.lower().startswith("result"):
            _debug_log(f"       ✓ y_axis '{col}' (computed/result column)", min_level=3)
            continue
        if col not in valid_columns:
            matches = get_close_matches(col, list(valid_columns), n=1, cutoff=0.6)
            suggestion_text = f"Did you mean '{matches[0]}'?" if matches else "Check column name"
            result.add_error("y_axes", f"Column '{col}' not found", suggestion_text)
            _debug_log(f"       ✗ y_axis '{col}' NOT FOUND", min_level=2)
            if matches:
                _debug_log(f"         Suggested: {matches[0]}", min_level=2)
        else:
            _debug_log(f"       ✓ y_axis '{col}' exists", min_level=3)
    
    return result


def validate_column_types(
    suggestion: VisualizationSuggestion,
    column_metadata: dict[str, ColumnMetadata]
) -> ValidationResult:
    """Validate that column data types match visualization requirements.

    Different visualization types have specific requirements for input
    data types. This validator ensures the selected columns are compatible
    with the chosen visualization method.

    Type requirements by visualization:
        - **regression**: Both x_axis and all y_axes must be numeric
        - **pca**: All y_axes must be numeric (dimensionality reduction)
        - **correlation**: All y_axes must be numeric (correlation matrix)
        - **hist**: x_axis should be numeric or datetime
        - **box**: y_axes should be numeric (statistical distribution)

    Args:
        suggestion: The visualization suggestion to validate.
        column_metadata: Dictionary mapping column names to their metadata,
            including the ``data_type`` field ("numeric", "categorical",
            "datetime", etc.).

    Returns:
        ValidationResult containing any type mismatch errors with
        guidance on correct column selection.

    Example:
        >>> result = validate_column_types(suggestion, metadata)
        >>> if not result.is_valid:
        ...     print(result.errors[0].suggestion)
        "Choose numeric columns as predictors"
    """
    result = ValidationResult()
    
    viz_type = suggestion.viz_type
    _debug_log(f"  validate_column_types: {suggestion.title} (viz_type={viz_type})", min_level=3)
    
    # Get column type helper
    def get_type(col: str) -> Optional[str]:
        if col in column_metadata:
            return column_metadata[col].data_type
        return None
    
    # Regression requires numeric columns
    if viz_type == "regression":
        x_type = get_type(suggestion.x_axis)
        _debug_log(f"       x_axis type: {x_type} (need: numeric)", min_level=3)
        if x_type and x_type != "numeric":
            result.add_error("x_axis", 
                           f"Regression requires numeric x_axis, got '{x_type}'",
                           "Choose a numeric column for the target variable")
            _debug_log(f"       ✗ Regression x_axis type mismatch: {x_type}", min_level=2)
        
        for col in suggestion.y_axes:
            col_type = get_type(col)
            _debug_log(f"       y_axis '{col}' type: {col_type}", min_level=3)
            if col_type and col_type != "numeric":
                result.add_error("y_axes",
                               f"Regression predictor '{col}' should be numeric, got '{col_type}'",
                               "Choose numeric columns as predictors")
                _debug_log(f"       ✗ Regression predictor type mismatch: {col}={col_type}", min_level=2)
    
    # PCA requires all numeric
    elif viz_type == "pca":
        for col in suggestion.y_axes:
            col_type = get_type(col)
            _debug_log(f"       PCA variable '{col}' type: {col_type}", min_level=3)
            if col_type and col_type != "numeric":
                result.add_error("y_axes",
                               f"PCA variable '{col}' must be numeric, got '{col_type}'",
                               "PCA only works with numeric data")
                _debug_log(f"       ✗ PCA variable type mismatch: {col}={col_type}", min_level=2)
    
    # Correlation requires numeric
    elif viz_type == "correlation":
        for col in suggestion.y_axes:
            col_type = get_type(col)
            _debug_log(f"       Correlation variable '{col}' type: {col_type}", min_level=3)
            if col_type and col_type != "numeric":
                result.add_error("y_axes",
                               f"Correlation variable '{col}' must be numeric, got '{col_type}'",
                               "Correlation matrix requires numeric data")
                _debug_log(f"       ✗ Correlation variable type mismatch: {col}={col_type}", min_level=2)
    
    # Histogram typically for numeric
    elif viz_type == "hist":
        x_type = get_type(suggestion.x_axis)
        _debug_log(f"       Histogram x_axis type: {x_type}", min_level=3)
        if x_type and x_type not in ["numeric", "datetime"]:
            result.add_error("x_axis",
                           f"Histogram is best for numeric data, got '{x_type}'",
                           "Consider using a bar chart for categorical data")
            _debug_log(f"       ✗ Histogram x_axis type mismatch: {x_type}", min_level=2)
    
    # Box plots require numeric y_axes
    elif viz_type == "box":
        for col in suggestion.y_axes:
            col_type = get_type(col)
            _debug_log(f"       Box variable '{col}' type: {col_type}", min_level=3)
            if col_type and col_type != "numeric":
                result.add_error("y_axes",
                               f"Box plot variable '{col}' must be numeric, got '{col_type}'",
                               "Box plots show statistical distributions of numeric data")
                _debug_log(f"       ✗ Box variable type mismatch: {col}={col_type}", min_level=2)
    
    return result


# ============= Viz-Type Specific Validation =============

def validate_viz_type_requirements(
    suggestion: VisualizationSuggestion
) -> ValidationResult:
    """Validate visualization-type specific structural requirements.

    Each visualization type has minimum requirements for the number of
    variables and specific configuration fields. This validator ensures
    the suggestion meets those requirements.

    Minimum y_axes requirements:
        - **pca**: 3+ variables (dimensionality reduction needs multiple features)
        - **correlation**: 3+ variables (meaningful correlation matrix)
        - **regression**: 1+ predictor variables
        - **universal/area/box/hist**: 1+ variable
        - **formula**: 0 (generates its own computed column)

    Additional requirements:
        - **universal**: plot_type must be one of: line, scatter, step, bar, line+scatter
        - **formula**: must have additional_config.formula.input defined

    Args:
        suggestion: The visualization suggestion to validate.

    Returns:
        ValidationResult containing any structural requirement errors.

    Example:
        >>> result = validate_viz_type_requirements(pca_suggestion)
        >>> if not result.is_valid:
        ...     print(result.errors[0].message)
        "pca requires at least 3 Y variable(s), got 2"
    """
    result = ValidationResult()
    
    viz_type = suggestion.viz_type
    y_count = len(suggestion.y_axes)
    
    _debug_log(f"  validate_viz_type_requirements: {suggestion.title}", min_level=3)
    _debug_log(f"       viz_type: {viz_type}, y_count: {y_count}", min_level=3)
    
    # Minimum y_axes requirements
    min_y_axes = {
        "pca": 3,
        "correlation": 3,
        "regression": 1,
        "universal": 1,
        "area": 1,
        "box": 1,
        "hist": 1,
        "fft": 1,
        "root_cause": 3,
        "formula": 0,  # Formula generates its own data
        "kpi": 0,  # KPI aggregates scalars, no y-axis series
    }

    required = min_y_axes.get(viz_type, 1)
    _debug_log(f"       Required y_axes: {required}, has: {y_count}", min_level=3)
    if y_count < required:
        result.add_error("y_axes",
                        f"{viz_type} requires at least {required} Y variable(s), got {y_count}",
                        f"Add more variables to y_axes")
        _debug_log(f"       ✗ Insufficient y_axes: {y_count} < {required}", min_level=2)
    else:
        _debug_log(f"       ✓ y_axes count OK", min_level=3)
    
    # Universal plot_type validation
    if viz_type == "universal":
        valid_plot_types = ["line", "scatter", "step", "bar", "line+scatter"]
        _debug_log(f"       plot_type: {suggestion.plot_type}", min_level=3)
        if suggestion.plot_type not in valid_plot_types:
            result.add_error("plot_type",
                           f"Invalid plot_type '{suggestion.plot_type}'",
                           f"Use one of: {', '.join(valid_plot_types)}")
            _debug_log(f"       ✗ Invalid plot_type: {suggestion.plot_type}", min_level=2)
        else:
            _debug_log(f"       ✓ plot_type valid", min_level=3)
    
    # Formula requires expression
    if viz_type == "formula":
        config = suggestion.additional_config
        has_formula = config.formula and config.formula.input
        _debug_log(f"       formula present: {has_formula}", min_level=3)
        if not has_formula:
            result.add_error("additional_config.formula",
                           "Formula visualization requires a formula expression",
                           "Provide a Python expression like 'result = col[\"col1\"] + col[\"col2\"]'")
            _debug_log(f"       ✗ Missing formula expression", min_level=2)
        else:
            _debug_log(f"       ✓ Formula expression present: {config.formula.input[:50]}...", min_level=3)
    
    return result


# ============= Professional Output Validation =============

def validate_professional_output(
    suggestion: VisualizationSuggestion
) -> ValidationResult:
    """Validate that the suggestion meets professional output standards.

    Ensures AI-generated suggestions are suitable for technical reports
    and presentations by checking for descriptive titles and substantive
    reasoning explanations.

    Quality checks:
        - **Title**: Must not be overly generic (e.g., "chart", "plot", "graph")
        - **Reasoning**: Must be at least 30 characters to provide meaningful
          context about the visualization's purpose and insights

    Args:
        suggestion: The visualization suggestion to validate.

    Returns:
        ValidationResult containing any quality-related errors with
        guidance on improving the output.

    Example:
        >>> result = validate_professional_output(suggestion)
        >>> if not result.is_valid:
        ...     print(result.errors[0].suggestion)
        "Use a specific, descriptive title like 'Temperature vs Time Profile'"
    """
    result = ValidationResult()
    
    # Title should not be too generic
    generic_words = {"chart", "plot", "graph", "visualization", "data", "analysis"}
    title_words = set(suggestion.title.lower().split())
    # Flag if the title is dominated by generic words (all significant words are generic)
    non_generic = title_words - generic_words - {"the", "a", "an", "of", "and", "for", "my", "new"}
    if not non_generic:
        result.add_error("title",
                        f"Title '{suggestion.title}' is too generic",
                        "Use a specific, descriptive title like 'Temperature vs Time Profile'")
    
    # Reasoning should be substantive
    if len(suggestion.reasoning) < 30:
        result.add_error("reasoning",
                        "Reasoning is too brief for a technical report",
                        "Provide a 2-3 sentence explanation of insights and patterns")
    
    return result


# ============= Main Validation Pipeline =============

def validate_suggestion_complete(
    suggestion: VisualizationSuggestion,
    valid_columns: set[str],
    column_metadata: Optional[dict[str, ColumnMetadata]] = None
) -> ValidationResult:
    """Run the complete validation pipeline on a visualization suggestion.

    Executes all validation checks in sequence to ensure the suggestion
    is valid, type-correct, structurally sound, and professionally formatted.

    Validation pipeline:
        1. **Column existence**: Verify all referenced columns exist
        2. **Column types**: Check data types match visualization requirements
           (only if column_metadata is provided)
        3. **Viz-type requirements**: Validate structural requirements
        4. **Professional output**: Ensure quality standards for export

    Args:
        suggestion: The visualization suggestion to validate.
        valid_columns: Set of valid column names from the dataset.
        column_metadata: Optional dictionary mapping column names to their
            metadata for type validation. If None, type checking is skipped.

    Returns:
        Combined ValidationResult aggregating all errors from each
        validation step. The result is valid only if all steps pass.

    Example:
        >>> result = validate_suggestion_complete(
        ...     suggestion,
        ...     valid_columns={"temp", "pressure", "time"},
        ...     column_metadata=metadata
        ... )
        >>> if result.is_valid:
        ...     print("Suggestion ready for rendering")
        >>> else:
        ...     for error in result.errors:
        ...         print(f"{error.field}: {error.message}")
    """
    combined = ValidationResult()
    
    # 1. Column existence
    col_result = validate_columns_exist(suggestion, valid_columns)
    if not col_result.is_valid:
        combined.is_valid = False
        combined.errors.extend(col_result.errors)
    
    # 2. Column types (if metadata available)
    if column_metadata:
        type_result = validate_column_types(suggestion, column_metadata)
        if not type_result.is_valid:
            combined.is_valid = False
            combined.errors.extend(type_result.errors)
    
    # 3. Viz-type requirements
    viz_result = validate_viz_type_requirements(suggestion)
    if not viz_result.is_valid:
        combined.is_valid = False
        combined.errors.extend(viz_result.errors)
    
    # 4. Professional output
    prof_result = validate_professional_output(suggestion)
    if not prof_result.is_valid:
        combined.is_valid = False
        combined.errors.extend(prof_result.errors)
    
    return combined


def get_column_suggestions(
    invalid_column: str,
    valid_columns: set[str],
    n: int = 3
) -> list[str]:
    """Find closest matching column names for an invalid column reference.

    Uses fuzzy string matching to suggest corrections for misspelled or
    incorrect column names. This helps users and AI systems quickly
    identify the intended column.

    Args:
        invalid_column: The invalid column name to find matches for.
        valid_columns: Set of valid column names from the dataset.
        n: Maximum number of suggestions to return. Defaults to 3.

    Returns:
        List of up to ``n`` valid column names that closely match the
        invalid reference, sorted by similarity. Returns empty list if
        no matches meet the similarity threshold (0.5).

    Example:
        >>> get_column_suggestions("temprature", {"temperature", "pressure", "time"})
        ["temperature"]
        >>> get_column_suggestions("xyz", {"temperature", "pressure"})
        []
    """
    return get_close_matches(invalid_column, list(valid_columns), n=n, cutoff=0.5)
