
import pandas as pd
import numpy as np
from app.models.schemas import VisualizationConfig, VisualizationType, AxisConfig, SeriesConfiguration
from app.services.visualization.plotting import generate_histogram_data

# Create dummy data
df = pd.DataFrame({
    'A': np.random.normal(0, 1, 1000),
    'B': np.random.normal(5, 2, 1000)
})

# Config with 50 bins for 'A' and default (30) for 'B' (implicit)
config = VisualizationConfig(
    id="test",
    viz_type=VisualizationType.HISTOGRAM,
    axis=AxisConfig(y_axis=['A', 'B']),
    series_configs={
        'A': SeriesConfiguration(type='bar', bins=50)
    }
)

# Generate data
response = generate_histogram_data(df, config)

# Check results
series_a = next(s for s in response.series if s.name == 'A')
series_b = next(s for s in response.series if s.name == 'B')

print(f"Series A bins: {len(series_a.data)}")
print(f"Series B bins: {len(series_b.data)}")

if len(series_a.data) == 50:
    print("PASS: Series A has 50 bins")
else:
    print(f"FAIL: Series A has {len(series_a.data)} bins (expected 50)")

if len(series_b.data) == 30:
    print("PASS: Series B has 30 bins (default)")
else:
    print(f"FAIL: Series B has {len(series_b.data)} bins (expected 30)")
