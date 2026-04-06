from app.models.schemas import VisualizationConfig

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
    
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings
    }
