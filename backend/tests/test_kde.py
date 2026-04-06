
import pandas as pd
import numpy as np
from app.models.schemas import VisualizationConfig, VisualizationType, AxisConfig, SeriesConfiguration
from app.services.visualization.plotting import generate_histogram_data

# Create dummy data
np.random.seed(42)
df = pd.DataFrame({
    'A': np.random.normal(0, 1, 1000)
})

# Config with KDE enabled
config = VisualizationConfig(
    id="test_kde",
    viz_type=VisualizationType.HISTOGRAM,
    axis=AxisConfig(y_axis=['A']),
    series_configs={
        'A': SeriesConfiguration(type='bar', bins=30, show_kde=True, y_axis_id='right')
    }
)

print("Generating histogram data with KDE...")
response = generate_histogram_data(df, config)

# Check results
print(f"Number of series returned: {len(response.series)}")

hist_series = next((s for s in response.series if s.name == 'A'), None)
kde_series = next((s for s in response.series if 'KDE' in s.name), None)

if hist_series:
    print("PASS: Histogram series found")
    if hist_series.y_axis_id == 'right':
        print("PASS: Histogram series has y_axis_id='right'")
    else:
        print(f"FAIL: Histogram series has y_axis_id='{hist_series.y_axis_id}'")
else:
    print("FAIL: Histogram series missing")

if kde_series:
    print(f"PASS: KDE series found: {kde_series.name}")
    if kde_series.type == 'line':
        print("PASS: KDE series type is 'line'")
    else:
        print(f"FAIL: KDE series type is {kde_series.type}")
    
    if kde_series.y_axis_id == 'right':
        print("PASS: KDE series has y_axis_id='right'")
    else:
        print(f"FAIL: KDE series has y_axis_id='{kde_series.y_axis_id}'")
        
    if len(kde_series.data) > 0:
        print(f"PASS: KDE series has data ({len(kde_series.data)} points)")
    else:
        print("FAIL: KDE series has no data")
else:
    print("FAIL: KDE series missing")
