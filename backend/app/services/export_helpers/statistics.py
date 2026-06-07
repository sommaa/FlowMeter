"""
Statistics computation for FlowMeter export reports.

This module generates HTML statistics tables summarizing the data displayed
in dashboard visualizations. It computes descriptive statistics and
regression-based trend analysis for each visualized variable.

Statistics computed:
    - Median: Middle value of the distribution
    - Min/Max: Range bounds
    - N° of Samples: Count of valid data points
    - % Change (regression): Trend direction based on linear regression

The regression % change uses a robust method that excludes outliers
(Z-score > 3) before fitting to reduce sensitivity to anomalies.
"""

import pandas as pd
import numpy as np
import logging
from typing import List, Optional
from sklearn.linear_model import LinearRegression
from app.models.schemas import VisualizationConfig, ExportSettings
from app.services.export_helpers.utils import filter_dataframe_by_date
from app.services.formula_safety import safe_exec

logger = logging.getLogger(__name__)


def compute_statistics(df: pd.DataFrame, visualizations: List[VisualizationConfig]) -> str:
    """Compute summary statistics for visualized variables and render as HTML.

    Extracts the data columns referenced by each visualization config,
    computes descriptive statistics, and formats the results as an HTML
    table with colored trend indicators.

    For formula visualizations, the formula is re-executed to obtain the
    computed results for statistical analysis.

    Args:
        df: The source DataFrame containing the dataset.
        visualizations: List of VisualizationConfig objects defining
            which columns/formulas to include in statistics.

    Returns:
        HTML string containing a <table> with statistics. On error,
        returns an error message wrapped in <p> tags.

    Statistics computed:
        - Median: pd.median()
        - Min/Max: pd.min(), pd.max()
        - N° of Samples: Count of non-null values
        - % Change (regression): Percentage change from start to end
          based on linear regression fit (outlier-robust)

    Trend indicators:
        - Green arrow (↗) for increase > 0.5%
        - Red arrow (↘) for decrease < -0.5%
        - Gray arrow (→) for stable trends

    Note:
        Variables are de-duplicated by label - if the same label appears
        in multiple visualizations, only the first occurrence is used.
    """
    try:
        # OrderedDict to preserve insertion order: {Label: Series}
        stats_data = {}

        for viz in visualizations:
            # Filter data for this visualization
            viz_df = filter_dataframe_by_date(df, viz.date_range)

            # 1. Handle Formulas
            if viz.viz_type == 'formula' and viz.formula.input:
                try:
                    # Re-execute formula to get data
                    df_copy = viz_df.copy(deep=True)
                    # Only coerce object columns to numeric (preserve datetime columns)
                    for c in df_copy.columns:
                        if df_copy[c].dtype == 'object':
                            df_copy[c] = pd.to_numeric(df_copy[c], errors='coerce')

                    # Make index available for formula (matches generate_formula_data)
                    if df_copy.index.name:
                        df_copy[df_copy.index.name] = df_copy.index
                    df_copy['Index'] = df_copy.index

                    namespace = {
                        'col': df_copy,
                        'np': np,
                        'pd': pd,
                        'df': viz_df
                    }
                    safe_exec(viz.formula.input, namespace)

                    results = {}
                    if 'result' in namespace:
                        results['result'] = namespace['result']
                    j = 1
                    while f'result{j}' in namespace:
                        results[f'result{j}'] = namespace[f'result{j}']
                        j += 1

                    if not results and 'results' in namespace:
                        res_obj = namespace['results']
                        if isinstance(res_obj, dict):
                            results = res_obj
                        elif isinstance(res_obj, list):
                            for k, v in enumerate(res_obj):
                                results[f'result{k + 1}'] = v

                    # Add results to stats
                    for idx, (name, res) in enumerate(results.items()):
                        # Determine Label
                        label = name
                        if viz.legend.labels and idx < len(viz.legend.labels) and viz.legend.labels[idx]:
                            label = viz.legend.labels[idx]

                        # Ensure Series
                        if not isinstance(res, (pd.Series, np.ndarray)):
                            res = pd.Series(res, index=viz_df.index)
                        elif isinstance(res, np.ndarray):
                            res = pd.Series(
                                res, index=viz_df.index if len(res) == len(viz_df) else None)

                        # Add if not exists (preserve first occurrence order)
                        if label not in stats_data:
                            stats_data[label] = res
                except Exception as e:
                    logger.error(f"Error calculating stats for formula {viz.title}: {e}")

            # 2. Handle Standard Columns (Line, Bar, etc.)
            elif viz.axis.y_axis:
                for i, col in enumerate(viz.axis.y_axis):
                    if col in viz_df.columns:
                        # Determine Label
                        label = col
                        if viz.legend.labels and i < len(viz.legend.labels) and viz.legend.labels[i]:
                            label = viz.legend.labels[i]

                        if label not in stats_data:
                            stats_data[label] = viz_df[col]

        if not stats_data:
            return "<p>No data selected for statistics.</p>"

        # Create DataFrame from ordered dict
        stats_df = pd.DataFrame(stats_data)

        # Basic stats logic matching user code
        desc = stats_df.describe().round(2)
        desc.loc['median'] = stats_df.median().round(2)

        # Regression % Change
        trends = {}
        for col in stats_df.columns:
            try:
                data = stats_df[col].dropna()
                if len(data) < 2:
                    trends[col] = np.nan
                    continue

                x = np.arange(len(data)).reshape(-1, 1)
                y = data.values
                
                # Robust method: Remove outliers (Z-score < 3)
                if len(y) > 2:
                        mean_y = np.mean(y)
                        std_y = np.std(y)
                        if std_y > 0:
                            z_scores = np.abs((y - mean_y) / std_y)
                            valid_mask = z_scores < 3.0
                            x_clean = x[valid_mask]
                            y_clean = y[valid_mask]
                            if len(x_clean) > 1:
                                x = x_clean
                                y = y_clean

                model = LinearRegression().fit(x, y)

                y_start = model.predict([[0]])[0]
                y_end = model.predict([[len(data) - 1]])[0]

                if y_start != 0:
                    change = ((y_end - y_start) / abs(y_start)) * 100
                    trends[col] = round(change, 2)
                else:
                    trends[col] = np.nan
            except BaseException:
                trends[col] = np.nan

        desc.loc['% Change (regression)'] = pd.Series(trends)

        # Select rows - MAINTAIN USER CAPITALIZATION
        final_stats = desc.loc[['median', 'min', 'max', 'count', '% Change (regression)']].rename(
            index={
                'count': 'N° of Samples',
                'median': 'Median',
                'min': 'Min',
                'max': 'Max'}
        )

        # Convert to HTML via Pandas first, then post-process for colors
        # We construct HTML manually to strictly match the requested style
        # for Colored Arrows

        html_parts = ['<table class="stats-table">']

        # Header - Variable
        html_parts.append('<thead><tr><th>Variable</th>')
        for col in final_stats.columns:
            html_parts.append(f'<th>{col}</th>')
        html_parts.append('</tr></thead><tbody>')

        # Body
        for idx, row in final_stats.iterrows():
            html_parts.append('<tr>')
            html_parts.append(f'<td><strong>{idx}</strong></td>')
            for col in final_stats.columns:
                val = row[col]
                display_val = str(val)
                style = ""

                if idx == '% Change (regression)' and pd.notna(val):
                    # Apply color logic: > 0.5 Green, < -0.5 Red, else Gray
                    if val > 0.5:
                        style = 'color: #10b981; font-weight: bold; white-space: nowrap;'
                        display_val = f"↗&nbsp;+{val}%"
                    elif val < -0.5:
                        style = 'color: #ef4444; font-weight: bold; white-space: nowrap;'
                        display_val = f"↘&nbsp;{val}%"
                    else:
                        sign = '+' if val >= 0 else ''
                        style = 'color: #64748b; font-weight: bold; white-space: nowrap;'
                        display_val = f"→&nbsp;{sign}{val}%"

                if style:
                    html_parts.append(
                        f'<td style="{style}">{display_val}</td>')
                else:
                    html_parts.append(f'<td>{display_val}</td>')
            html_parts.append('</tr>')

        html_parts.append('</tbody></table>')
        return "".join(html_parts)

    except Exception as e:
        return f"<p>Error calculating statistics: {e}</p>"
