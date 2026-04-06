
import pytest
import pandas as pd
import numpy as np
import sys
import os

# Ensure backend app is in path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.visualization_service import VisualizationService
from app.models.schemas import VisualizationConfig, VisualizationType

@pytest.fixture
def viz_service():
    return VisualizationService()

@pytest.fixture
def sample_numeric_df():
    return pd.DataFrame({
        "x": [1, 2, 3, 4, 5],
        "y": [2, 4, 6, 8, 10], # Perfect linear y=2x
        "noise": [2.1, 3.9, 6.2, 7.8, 10.1],
        "outlier": [2, 4, 100, 8, 10] # 100 is outlier
    })

@pytest.fixture
def sample_date_df():
    dates = pd.to_datetime(["2023-01-01", "2023-01-02", "2023-01-03", "2023-01-04", "2023-01-05"])
    return pd.DataFrame({
        "Date": dates,
        "Value": [10, 20, 30, 40, 50],
        "Target": [100, 200, 300, 400, 500]
    })

@pytest.fixture
def basic_config():
    return VisualizationConfig(
        id="test_viz",
        title="Test Visualization",
        viz_type="regression", # String match for enum
        x_axis="x",
        y_axis=["y"],
        regression_predictors=["x"]
    )
