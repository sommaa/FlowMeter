
import pytest
import pandas as pd
import numpy as np
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.models.schemas import VisualizationConfig, VisualizationType, FormulaConfig, RegressionConfig, AxisConfig
from app.services.visualization_service import VisualizationService

def test_formula_random_forest_params(viz_service):
    """Test that formula plots pass RF params correctly."""
    df = pd.DataFrame({
        'x': np.linspace(0, 10, 20),
        'y': np.linspace(0, 10, 20)
    })
    
    # Mock data service to return our df
    viz_service.data_service.get_dataset = lambda id: df
    
    config = VisualizationConfig(
        id="test_formula_rf",
        viz_type=VisualizationType.FORMULA,
        formula=FormulaConfig(
            input="result = col['y'] * 2",
            add_regression=True
        ),
        regression=RegressionConfig(
            model_type="random_forest",
            rf_n_estimators=5
        ),
        axis=AxisConfig(
            x_axis="x",
            y_axis=[],
            enable_y_axis_range=False,
            multi_axis_plot_type="Line"
        )
    )
    
    response = viz_service.generate_plot_data("mock_id", config)
    
    assert response.regression_model is not None
    assert response.regression_line is not None
    assert response.regression_line.name.startswith("Regression:")
