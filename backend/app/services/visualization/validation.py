from app.models.schemas import VisualizationConfig, KPI_OPERATIONS

from typing import Dict, List, Union

def validate_config(config: VisualizationConfig) -> Dict[str, Union[bool, List[str]]]:
    """
    Validate a visualization configuration.
    
    Returns:
        dict: Validation result containing:
            - valid (bool): True if valid
            - errors (list[str]): List of error messages
            - warnings (list[str]): List of warning messages
    """
    errors = []
    warnings = []
    
    # Basic validation
    if not config.title:
        warnings.append("Title is empty")
    
    if config.viz_type.value in ['line', 'scatter', 'bar', 'area'] and not config.axis.y_axis:
        errors.append("Y-axis must be specified")
    
    if config.viz_type.value == 'pca' and len(config.axis.y_axis) < 2:
        errors.append("PCA requires at least 2 variables")
    
    if config.viz_type.value == 'formula' and not config.formula.input:
        errors.append("Formula input is required")
    
    if config.axis.x_axis == "Custom Formula" and not config.formula.x_formula:
        errors.append("X-axis formula is required when using custom formula")
    
    if config.regression.degree < 1 or config.regression.degree > 10:
        errors.append("Regression degree must be between 1 and 10")
    
    if config.regression.alpha < 0 or config.regression.alpha > 1:
        errors.append("Alpha must be between 0 and 1")

    if config.viz_type.value == 'kpi':
        if not config.kpi.metrics:
            errors.append("KPI requires at least one metric")
        else:
            for idx, metric in enumerate(config.kpi.metrics):
                prefix = f"KPI metric #{idx + 1} ('{metric.label or 'unnamed'}')"
                if metric.operation not in KPI_OPERATIONS:
                    errors.append(f"{prefix}: unsupported operation '{metric.operation}'")
                elif metric.operation == 'formula':
                    if not metric.formula or not metric.formula.strip():
                        errors.append(f"{prefix}: formula expression is required")
                else:
                    if not metric.column:
                        errors.append(f"{prefix}: column is required")
        if not (1 <= config.kpi.columns_per_row <= 6):
            warnings.append("KPI columns_per_row should be between 1 and 6")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings
    }
