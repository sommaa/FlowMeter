"""
Plotly-to-static-image rendering for HTML report exports.

This module provides PlotlyRenderer, which converts PlotDataResponse objects
(the same data structures used by the frontend) to static images using
Plotly and Kaleido. This ensures visual consistency between interactive
frontend visualizations and exported report images.

Key features:
    - Renders all visualization types: line, scatter, area, bar, box, PCA, correlation
    - Uses Kaleido for fast server-side image generation (SVG format)
    - Supports dual Y-axes, threshold lines with shading, and regression overlays
    - Pre-warming support to reduce first-render latency
    - Automatic marker size scaling based on data density

Performance optimization:
    - Kaleido scope is initialized once and reused across exports
    - Pre-warming can be triggered at server startup via prewarm_kaleido()
    - SVG format is used for resolution-independent output
"""
import base64
import logging
from typing import Optional, List, Dict, Any

import plotly.graph_objects as go
from plotly.subplots import make_subplots
import numpy as np

# Initialize Kaleido scope once for faster subsequent exports
_kaleido_scope = None
_kaleido_prewarmed = False

try:
    import kaleido
    from kaleido.scopes.plotly import PlotlyScope
    _kaleido_scope = PlotlyScope()
    _kaleido_scope.default_format = "svg"
    _kaleido_scope.default_width = 1200
    _kaleido_scope.default_height = 500
except ImportError:
    pass

from app.models.schemas import (
    PlotDataResponse,
    PlotDataSeries,
    VisualizationConfig,
    Threshold,
    SeriesRenderType,
)

logger = logging.getLogger(__name__)

# Same color palette used by frontend and old Matplotlib exporter
COLORS = [
    '#0072BD', '#D95319', '#EDB120', '#7E2F8E', '#77AC30',
    '#4DBEEE', '#A2142F', '#2563eb', '#16a34a', '#dc2626'
]

# Colormap mappings for correlation heatmaps
# Custom colorscales to match frontend definitions (Plotly.js missing built-ins)
CUSTOM_COLORSCALES = {
    'Magma': [
        [0.0, '#000004'], [0.125, '#180f3d'], [0.25, '#440f76'],
        [0.375, '#721f81'], [0.5, '#9e2f7f'], [0.625, '#cd4071'],
        [0.75, '#f1605d'], [0.875, '#feb078'], [1.0, '#fcfdbf'],
    ],
    'Inferno': [
        [0.0, '#000004'], [0.125, '#1b0c41'], [0.25, '#4a0c6b'],
        [0.375, '#781c6d'], [0.5, '#a52c60'], [0.625, '#cf4446'],
        [0.75, '#ed6925'], [0.875, '#fb9b06'], [1.0, '#fcffa4'],
    ],
    'Plasma': [
        [0.0, '#0d0887'], [0.125, '#46039f'], [0.25, '#7201a8'],
        [0.375, '#9c179e'], [0.5, '#bd3786'], [0.625, '#d8576b'],
        [0.75, '#ed7953'], [0.875, '#fb9f3a'], [1.0, '#f0f921'],
    ],
}

# Colormap mappings for correlation heatmaps
# Maps frontend string names to Plotly strings or custom scales
COLORSCALE_MAPPING = {
    'RdBu': 'RdBu',  # Removed _r to match frontend default
    'Viridis': 'Viridis',
    'Cividis': 'Cividis',
    'Jet': 'Jet',
    'Hot': 'Hot',
    'Greys': 'Greys',
    'YlGnBu': 'YlGnBu',
    'Blues': 'Blues',
    'Reds': 'Reds',
    'Earth': 'Earth',
    'Electric': 'Electric',
    'Blackbody': 'Blackbody',
    'Portland': 'Portland',
}


def prewarm_kaleido():
    """Pre-initialize Kaleido by rendering a minimal dummy figure.

    Kaleido uses an embedded Chromium instance for rendering, which has
    significant startup overhead. Calling this function at server startup
    warms up the renderer, reducing latency for the first actual export
    from several seconds to near-instant.

    This function is idempotent - subsequent calls are no-ops if already
    prewarmed or if Kaleido is unavailable.

    Note:
        This is optional but recommended for production deployments where
        export latency matters. Call this during application initialization.
    """
    global _kaleido_scope, _kaleido_prewarmed
    
    if _kaleido_prewarmed or _kaleido_scope is None:
        return
    
    try:
        logger.info("Prewarming Kaleido renderer...")
        # Create a minimal figure and render it
        dummy_fig = go.Figure(data=go.Scatter(x=[0], y=[0]))
        _kaleido_scope.transform(
            dummy_fig.to_json(),
            format="svg",
            width=100,
            height=100
        )
        _kaleido_prewarmed = True
        logger.info("Kaleido prewarm complete - subsequent exports will be faster")
    except Exception as e:
        logger.warning(f"Kaleido prewarm failed (non-critical): {e}")


class PlotlyRenderer:
    """Static renderer for converting PlotDataResponse to base64 images.

    Provides static methods for rendering visualization data to images
    suitable for embedding in HTML reports. Uses the same PlotDataResponse
    objects as the frontend API, ensuring visual consistency.

    All methods are static as no instance state is required - the Kaleido
    scope is managed at module level for performance.

    Supported visualization types:
        - Line, scatter, step, bar plots (including dual Y-axis)
        - Area charts (with optional stacking)
        - Box plots
        - PCA biplots with loading vectors
        - Correlation heatmaps
        - Regression lines with confidence intervals
        - Threshold lines with shaded areas

    Example:
        >>> response = viz_service.generate_plot_data_from_df(df, config)
        >>> base64_img = PlotlyRenderer.render_to_base64(response, config)
        >>> html = f'<img src="data:image/svg+xml;base64,{base64_img}"/>'
    """
    
    @staticmethod
    def render_to_base64(
        response: PlotDataResponse,
        config: VisualizationConfig,
        width: int = 1200,
        height: int = 500,
        storyline_events: Optional[List] = None
    ) -> str:
        """Convert PlotDataResponse to a base64-encoded SVG image.

        Main entry point for rendering visualizations. Builds a Plotly
        figure from the response data, then exports it to SVG format
        encoded as base64 for embedding in HTML.

        Args:
            response: PlotDataResponse from VisualizationService containing
                series data, labels, limits, and optional extras like
                regression lines or correlation matrices.
            config: VisualizationConfig defining the chart type, styling,
                axis configuration, and other rendering options.
            width: Output image width in pixels. Defaults to 1200.
            height: Output image height in pixels. Defaults to 500.
            storyline_events: Optional list of storyline events to render
                as vertical markers on datetime-indexed charts.

        Returns:
            Base64-encoded SVG string suitable for use in an HTML img tag
            with src="data:image/svg+xml;base64,{returned_string}".

        Note:
            On rendering errors, returns an error placeholder image with
            the exception message rather than raising an exception.
        """
        try:
            fig = PlotlyRenderer._build_figure(response, config, storyline_events)
            return PlotlyRenderer._export_to_base64(fig, width, height)
        except Exception as e:
            logger.error(f"PlotlyRenderer error: {e}")
            # Return an error placeholder image
            fig = go.Figure()
            fig.add_annotation(
                text=f"Error rendering chart:<br>{str(e)[:100]}",
                xref="paper", yref="paper",
                x=0.5, y=0.5, showarrow=False,
                font=dict(size=14, color="red")
            )
            return PlotlyRenderer._export_to_base64(fig, width, height)
    
    @staticmethod
    def _build_figure(response: PlotDataResponse, config: VisualizationConfig, storyline_events: Optional[List] = None) -> go.Figure:
        """Build a Plotly Figure from PlotDataResponse data.

        Constructs the complete figure by adding all series, regression lines,
        thresholds, storyline events, and annotations. Handles special cases 
        like correlation matrices and dual Y-axes.

        Args:
            response: The plot data containing series and metadata.
            config: Visualization configuration for styling.
            storyline_events: Optional list of storyline events to render.

        Returns:
            Configured Plotly Figure ready for export.
        """
        
        # Special case: Correlation Matrix (Heatmap)
        if response.correlation_matrix:
            return PlotlyRenderer._build_correlation_figure(response, config)
        
        # Special case: Root Cause Analysis
        if response.root_cause_analysis:
            return PlotlyRenderer._build_root_cause_figure(response, config)
        
        # Check if we need a secondary Y-axis
        has_secondary_axis = any(
            s.y_axis_id == 'right' for s in response.series
        )
        
        # Create figure with secondary Y axis if needed
        if has_secondary_axis:
            fig = make_subplots(specs=[[{"secondary_y": True}]])
        else:
            fig = go.Figure()
        
        # Add each data series
        for i, series in enumerate(response.series):
            # Assign color if missing (e.g., FFT doesn't generate colors)
            if not series.color:
                series.color = COLORS[i % len(COLORS)]
            PlotlyRenderer._add_series(fig, series, has_secondary_axis, config)
        
        # Add regression line if present
        if response.regression_line:
            PlotlyRenderer._add_series(fig, response.regression_line, has_secondary_axis, config)
        
        # Add threshold limits
        if response.limits:
            PlotlyRenderer._add_thresholds(fig, response, config)
        
        # Add storyline events (if applicable)
        # Check if x-axis is datetime-based by examining actual x-values
        # Need to detect both string datetimes AND native Timestamp/datetime objects
        is_datetime_axis = False
        if response.series:
            import pandas as pd
            from datetime import datetime
            first_series = next((s for s in response.series if s.data), None)
            if first_series and first_series.data:
                sample_x = first_series.data[0].get('x')
                # Check for native datetime/Timestamp objects
                if isinstance(sample_x, (datetime, pd.Timestamp)):
                    is_datetime_axis = True
                # Check for datetime strings
                elif isinstance(sample_x, str):
                    try:
                        pd.to_datetime(sample_x)
                        is_datetime_axis = True
                    except:
                        pass
        
        if storyline_events and is_datetime_axis and response.series:
            PlotlyRenderer._add_storyline_events(fig, response, storyline_events)
        
        # Add annotations (e.g., PCA loading vectors)
        if response.annotations:
            PlotlyRenderer._add_annotations(fig, response.annotations, config)
        
        # Configure layout
        PlotlyRenderer._configure_layout(fig, response, config, has_secondary_axis)
        
        return fig
    
    @staticmethod
    def _add_series(fig: go.Figure, series: PlotDataSeries, has_secondary_axis: bool, config: VisualizationConfig = None) -> None:
        """Add a single data series trace to the Plotly figure.

        Handles different series types (line, scatter, bar, area, step, box)
        and configures appropriate Plotly trace objects. Automatically adjusts
        marker sizes based on data density for optimal visibility.

        Args:
            fig: The Plotly figure to add the trace to.
            series: PlotDataSeries containing data points and styling.
            has_secondary_axis: Whether the figure has a secondary Y-axis.
            config: Optional config for additional styling options.

        Note:
            Series names starting with '_' are treated as internal (e.g., PCA
            unit circle) and hidden from the legend.
        """
        x_vals = [pt.get('x') for pt in series.data]
        y_vals = [pt.get('y') for pt in series.data]
        
        color = series.color or COLORS[0]
        is_secondary = series.y_axis_id == 'right'
        
        # Internal series (like PCA circle) start with underscore - hide from legend
        is_internal = series.name.startswith('_')
        
        # Common kwargs
        common_kwargs = dict(
            name=series.name,
            legendgroup=series.name,
            showlegend=not is_internal,
            hoverinfo='skip' if is_internal else 'name+x+y',
        )
        
        # Dynamic marker size based on data density (ignoring NaNs)
        # We only care about visible points for density calculation
        valid_points = sum(1 for y in y_vals if y is not None and not (isinstance(y, float) and np.isnan(y)))
        
        if valid_points < 50:
            marker_size = 10
        elif valid_points < 200:
            marker_size = 8
        elif valid_points < 1000:
            marker_size = 6
        else:
            marker_size = 4
        
        series_type = series.type.lower() if series.type else 'line'
        
        # Resolve marker symbol with open variant for unfilled
        resolved_symbol = series.marker_symbol or 'circle'
        if not series.marker_filled and '-open' not in resolved_symbol:
            resolved_symbol = f"{resolved_symbol}-open"
        
        # Resolve line style
        line_dash = series.line_dash if series.line_dash and series.line_dash != 'solid' else None
        line_w = series.line_width if series.line_width is not None else 2
        
        if series_type == 'scatter':
            final_size = series.marker_size if series.marker_size is not None else marker_size
            trace = go.Scatter(
                x=x_vals, y=y_vals,
                mode='markers',
                marker=dict(color=color, size=final_size, symbol=resolved_symbol),
                **common_kwargs
            )
        elif series_type == 'bar':
            trace = go.Bar(
                x=x_vals, y=y_vals,
                marker=dict(color=color),
                **common_kwargs
            )
        elif series_type == 'area':
            is_stacking = config and config.style and config.style.enable_stacking
            alpha = 0.5 if is_stacking else 0.3
            
            # Use the safe helper instead of manual hex slicing
            rgba_vals = PlotlyRenderer._hex_to_rgba(color, alpha)
            fillcolor = f"rgba{rgba_vals}"
            
            trace = go.Scatter(
                x=x_vals, y=y_vals,
                mode='lines',
                fill='tonexty' if is_stacking else 'tozeroy',
                stackgroup='one' if is_stacking else None,
                fillcolor=fillcolor,
                line=dict(color=color, width=line_w, dash=line_dash),
                **common_kwargs
            )
        elif series_type == 'step':
            trace = go.Scatter(
                x=x_vals, y=y_vals,
                mode='lines',
                line=dict(color=color, width=line_w, shape='hv', dash=line_dash),
                **common_kwargs
            )
        elif series_type == 'box':
            # Box plot data has different structure
            # Each point is {x, low, q1, median, q3, high, outliers}
            for pt in series.data:
                trace = go.Box(
                    name=pt.get('x', series.name),
                    x=[pt.get('x', series.name)],
                    lowerfence=[pt.get('low', pt.get('q1', 0))],
                    q1=[pt.get('q1', 0)],
                    median=[pt.get('median', 0)],
                    q3=[pt.get('q3', 0)],
                    upperfence=[pt.get('high', pt.get('q3', 0))],
                    marker=dict(color=color),
                    boxpoints='outliers' if pt.get('outliers') else False,
                )
                if has_secondary_axis:
                    fig.add_trace(trace, secondary_y=is_secondary)
                else:
                    fig.add_trace(trace)
            return  # Box plots handled differently
        elif series_type in ['line+scatter', 'line_scatter']:
            final_size = series.marker_size if series.marker_size is not None else max(marker_size - 2, 4)
            trace = go.Scatter(
                x=x_vals, y=y_vals,
                mode='lines+markers',
                line=dict(color=color, width=line_w, dash=line_dash),
                marker=dict(color=color, size=final_size, symbol=resolved_symbol),
                **common_kwargs
            )
        else:  # Default: line
            is_ci = series.render_type in (SeriesRenderType.CI_LOWER, SeriesRenderType.CI_UPPER)
            is_regression = series.render_type == SeriesRenderType.REGRESSION
            
            if is_ci:
                rgba_vals = PlotlyRenderer._hex_to_rgba(color, 0.2)
                
                # Merge showlegend override into common_kwargs safely
                ci_kwargs = {**common_kwargs, "showlegend": False}
                
                trace = go.Scatter(
                    x=x_vals, y=y_vals,
                    mode='lines',
                    line=dict(width=0), 
                    fill='tonexty' if series.render_type == SeriesRenderType.CI_UPPER else None, 
                    fillcolor=f"rgba{rgba_vals}",
                    **ci_kwargs  # Pass the modified dict here
                )
            elif is_regression:
                trace = go.Scatter(
                    x=x_vals, y=y_vals,
                    mode='lines',
                    line=dict(color=color, width=2, dash='dash'),
                    **common_kwargs
                )
            else:
                trace = go.Scatter(
                    x=x_vals, y=y_vals,
                    mode='lines',
                    line=dict(color=color, width=line_w, dash=line_dash),
                    **common_kwargs
                )
        
        if has_secondary_axis:
            fig.add_trace(trace, secondary_y=is_secondary)
        else:
            fig.add_trace(trace)
    
    @staticmethod
    def _add_thresholds(fig: go.Figure, response: PlotDataResponse, config: VisualizationConfig) -> None:
        """Add threshold limit lines and optional shaded areas to the figure.

        Renders threshold values as dashed horizontal lines with optional
        shaded regions indicating areas above or below the threshold.
        Thresholds appear in the legend for reference.

        Args:
            fig: The Plotly figure to add thresholds to.
            response: PlotDataResponse containing the threshold definitions.
            config: Visualization configuration (used for styling context).

        Note:
            Shaded areas use a very large value (1e20) as infinity bounds
            to ensure they extend beyond any realistic data range.
        """
        
        infinity_bound = 1e20
        
        for threshold in response.limits:
            color = threshold.color or '#ef4444'
            name = threshold.label if threshold.label else f"Limit {threshold.value}"
            
            # Determine axis context
            is_right = threshold.y_axis_id == 'right'
            yref = "y2" if is_right else "y"
            
            # Add threshold as a trace so it appears in legend
            fig.add_trace(go.Scatter(
                x=[None], 
                y=[threshold.value],
                mode='lines',
                name=name,
                line=dict(color=color, width=2, dash='dash'),
                showlegend=True,
                hoverinfo='name+y',
                yaxis=yref
            ))
            
            # Add the actual horizontal line using full-width shape
            fig.add_shape(
                type="line",
                xref="paper", yref=yref,
                x0=0, x1=1,
                y0=threshold.value, y1=threshold.value,
                line=dict(color=color, width=2, dash="dash"),
            )
            
            # Add shaded area if enabled
            if threshold.show_shaded_area:
                opacity = threshold.shaded_area_opacity or 0.2
                
                # Use RGBA for fill color to control opacity directly, ensuring visibility
                # independent of shape-level opacity settings
                rgba_vals = PlotlyRenderer._hex_to_rgba(color, opacity)
                fill_color_rgba = f"rgba{rgba_vals}"
                
                if threshold.shaded_area_direction == 'up':
                    # Shade from threshold UP to Infinity
                    y0 = threshold.value
                    y1 = infinity_bound
                else:
                    # Shade from threshold DOWN to -Infinity
                    y0 = -infinity_bound
                    y1 = threshold.value
                
                fig.add_shape(
                    type="rect",
                    xref="paper", yref=yref,
                    x0=0, x1=1,
                    y0=y0, y1=y1,
                    fillcolor=fill_color_rgba,
                    line_width=0,
                    layer='above'
                )
    
    @staticmethod
    def _add_storyline_events(fig: go.Figure, response: PlotDataResponse, storyline_events: List) -> None:
        """Add storyline event markers as numbered vertical lines.

        Renders storyline events as dotted vertical lines with numbered badges
        at the top of the chart. Only shows events within the data date range.
        Uses custom event colors when provided.

        Args:
            fig: The Plotly figure to add events to.
            response: PlotDataResponse containing series data for date range.
            storyline_events: List of storyline event objects with date, title,
                description, and optional color fields.

        Note:
            Events are numbered sequentially (1, 2, 3...) based on their order
            within the visible date range.
        """
        from datetime import datetime as dt
        import pandas as pd
        
        # Get date range from first series with data
        if not response.series:
            return
            
        first_series = next((s for s in response.series if s.data), None)
        if not first_series:
            return
            
        x_vals = [pt.get('x') for pt in first_series.data]
        
        # Parse dates to timestamps - handle strings, datetime, and Timestamp objects
        x_dates = []
        for x in x_vals:
            try:
                if isinstance(x, (dt, pd.Timestamp)):
                    x_dates.append(pd.Timestamp(x).timestamp())
                elif isinstance(x, str):
                    x_dates.append(pd.to_datetime(x).timestamp())
            except:
                pass
                
        if not x_dates:
            return
            
        x_min, x_max = min(x_dates), max(x_dates)
        range_padding = (x_max - x_min) * 0.02
        
        # Default color
        default_color = '#6366f1'  # Indigo
        event_number = 0
        
        for event in storyline_events:
            # Handle both dict and model objects
            evt = event.dict() if hasattr(event, 'dict') else event
            
            try:
                event_time = pd.to_datetime(evt['date']).timestamp()
            except:
                continue
                
            # Only show events within visible range
            if event_time < x_min - range_padding or event_time > x_max + range_padding:
                continue
                
            event_number += 1
            event_date_str = pd.to_datetime(evt['date']).isoformat()
            event_color = evt.get('color') or default_color
            
            # Add ~60% opacity to color for line
            rgba_vals = PlotlyRenderer._hex_to_rgba(event_color, 0.6)
            event_color_alpha = f"rgba{rgba_vals}"
            
            # Vertical dashed line
            fig.add_shape(
                type="line",
                xref="x", yref="paper",
                x0=event_date_str, x1=event_date_str,
                y0=0, y1=1,
                line=dict(color=event_color_alpha, width=1.5, dash="dot"),
                layer="below"
            )
            
            # Numbered badge annotation at top
            fig.add_annotation(
                x=event_date_str,
                y=1,
                xref="x", yref="paper",
                text=f"<b>{event_number}</b>",
                showarrow=False,
                font=dict(color="white", size=10),
                bgcolor=event_color,
                bordercolor=event_color,
                borderwidth=1,
                borderpad=1,
                xanchor="center",
                yanchor="top",
                hovertext=f"{event_number}. {evt.get('title', '')}"
            )
    
    @staticmethod
    def _add_annotations(fig: go.Figure, annotations: List[Dict], config: VisualizationConfig = None) -> None:
        """Add annotation overlays like PCA loading vectors to the figure.

        Renders arrow-type annotations as colored lines with labels positioned
        outside the data area. Used primarily for PCA biplot loading vectors.

        Args:
            fig: The Plotly figure to add annotations to.
            annotations: List of annotation dicts with type, coordinates, and labels.
            config: Optional config for custom color mappings.

        Note:
            Labels are positioned at 1.3x the vector endpoint to place them
            outside the PCA unit circle with slight padding.
        """
        for i, ann in enumerate(annotations):
            if ann.get('type') == 'arrow':
                label = ann.get('label', '')
                
                # Get color from config custom_colors or use default palette
                color = COLORS[i % len(COLORS)]  # Default from palette
                if config and config.style and config.style.custom_colors:
                    if label in config.style.custom_colors:
                        color = config.style.custom_colors[label]
                
                x0, y0 = ann.get('x0', 0), ann.get('y0', 0)
                x1, y1 = ann.get('x1', 0), ann.get('y1', 0)
                
                # Draw vector as a line shape (like frontend does)
                fig.add_shape(
                    type="line",
                    x0=x0, y0=y0,
                    x1=x1, y1=y1,
                    line=dict(color=color, width=3),
                )
                
                # Add label positioned outside the circle (1.2x the vector position)
                fig.add_annotation(
                    x=x1 * 1.3,
                    y=y1 * 1.3,
                    text=label,
                    showarrow=False,
                    font=dict(color=color, size=12),
                    bgcolor='rgba(255,255,255,0.7)',
                    borderpad=2,
                )
    
    @staticmethod
    def _build_correlation_figure(response: PlotDataResponse, config: VisualizationConfig) -> go.Figure:
        """Build a correlation matrix heatmap figure.

        Creates a Plotly heatmap from the correlation_matrix data in the
        response. Uses color scales to represent correlation strength from
        -1 (negative) to +1 (positive) with annotations showing values.

        Args:
            response: PlotDataResponse with correlation_matrix dict containing
                x (column labels), y (row labels), and z (correlation values).
            config: VisualizationConfig with colormap preference in style.

        Returns:
            Configured Plotly Figure with heatmap and colorbar.
        """
        corr = response.correlation_matrix
        
        x_labels = corr.get('x', [])
        y_labels = corr.get('y', [])
        z_values = corr.get('z', [])
        
        # Get colorscale
        # Get colorscale - check CUSTOM first, then standard mapping
        colormap_name = config.style.colormap if config.style.colormap else 'RdBu'
        
        if colormap_name in CUSTOM_COLORSCALES:
            colorscale = CUSTOM_COLORSCALES[colormap_name]
        else:
            colorscale = COLORSCALE_MAPPING.get(colormap_name, 'RdBu')
        
        fig = go.Figure(data=go.Heatmap(
            z=z_values,
            x=x_labels,
            y=y_labels,
            colorscale=colorscale,
            zmin=-1, zmax=1,
            xgap=1,  # Add 1px gap between cells horizontally
            ygap=1,  # Add 1px gap between cells vertically
            text=[[f"{val:.2f}" for val in row] for row in z_values],
            texttemplate="%{text}",
            textfont={"size": 10},
            hovertemplate="x: %{x}<br>y: %{y}<br>correlation: %{z:.3f}<extra></extra>",
            colorbar=dict(title="Correlation")
        ))
        
        fig.update_layout(
            xaxis=dict(tickangle=45),
            yaxis=dict(autorange='reversed'),
            template='plotly_white',
            showlegend=True,
            legend=dict(
                orientation='h',
                yanchor='top',
                y=-0.25,
                xanchor='center',
                x=0.5
            ),
            margin=dict(l=60, r=60, t=50, b=100),
        )
        
        return fig
    
    @staticmethod
    def _build_root_cause_figure(response: PlotDataResponse, config: VisualizationConfig) -> go.Figure:
        """Build a root cause analysis figure.

        Supports three plot modes controlled by config.root_cause.result_plot:
          - ranking: horizontal bar chart of composite scores
          - correlation_lag: scatter of |Pearson| vs lag
          - method_breakdown: grouped bar of per-method contributions
        """
        rca = response.root_cause_analysis
        ranking = rca.get('ranking', [])
        target_var = rca.get('target_variable', 'target')
        result_plot = 'ranking'
        if config.root_cause:
            result_plot = getattr(config.root_cause, 'result_plot', 'ranking') or 'ranking'

        GRANGER_COLORS = {
            'CAUSE': '#22c55e',
            'EFFECT': '#ef4444',
            'FEEDBACK': '#f59e0b',
            'NONE': '#6b7280',
            'n/a': '#6b7280',
        }
        GRANGER_LABELS = {
            'CAUSE': 'Cause',
            'EFFECT': 'Effect',
            'FEEDBACK': 'Feedback',
            'NONE': 'Not significant',
            'n/a': 'Not significant',
        }

        fig = go.Figure()

        if result_plot == 'correlation_lag':
            # --- Scatter: |Pearson| vs lag, grouped by Granger type ---
            groups: dict[str, list] = {}
            for r in ranking:
                gt = r.get('granger_type', 'n/a') or 'n/a'
                groups.setdefault(gt, []).append(r)

            for gt, items in groups.items():
                fig.add_trace(go.Scatter(
                    x=[r.get('lag_samples', 0) for r in items],
                    y=[abs(r.get('pearson', 0)) for r in items],
                    text=[r['variable'] for r in items],
                    textposition='top center',
                    textfont=dict(size=8),
                    mode='markers+text',
                    name=GRANGER_LABELS.get(gt, gt),
                    marker=dict(
                        color=GRANGER_COLORS.get(gt, '#6b7280'),
                        size=[max(8, min(30, r.get('score', 10) * 0.6)) for r in items],
                        opacity=0.85,
                    ),
                    hovertext=[
                        f"{r['variable']}<br>Score: {r.get('score',0):.1f}<br>|Pearson|: {abs(r.get('pearson',0)):.3f}<br>Lag: {r.get('lag_samples',0)}"
                        for r in items
                    ],
                    hoverinfo='text',
                ))

            fig.update_layout(
                template='plotly_white',
                title=dict(text=f'Correlation vs Lag → {target_var}', font=dict(size=14)),
                xaxis=dict(title='Lag (samples)', showgrid=True, zeroline=True),
                yaxis=dict(title='|Pearson|', showgrid=True, range=[0, 1.05]),
                legend=dict(orientation='h', y=-0.2, x=0.5, xanchor='center'),
                margin=dict(l=60, r=30, t=50, b=80),
                hovermode='closest',
            )

        elif result_plot == 'method_breakdown':
            # --- Grouped bar: per-method contributions ---
            top_n = ranking[:10]
            variables = [r['variable'] for r in top_n]
            methods = [
                ('pearson_abs', 'Pearson |r|', '#6366f1'),
                ('xcorr_abs', 'Cross-Corr', '#06b6d4'),
                ('mutual_info_norm', 'Mutual Info', '#f59e0b'),
            ]
            for key, label, color in methods:
                fig.add_trace(go.Bar(
                    x=variables,
                    y=[r.get(key, 0) or 0 for r in top_n],
                    name=label,
                    marker=dict(color=color),
                ))

            fig.update_layout(
                template='plotly_white',
                title=dict(text=f'Method Breakdown → {target_var}', font=dict(size=14)),
                barmode='group',
                xaxis=dict(tickangle=-35),
                yaxis=dict(title='Normalized Value', showgrid=True),
                legend=dict(orientation='h', y=-0.3, x=0.5, xanchor='center'),
                margin=dict(l=60, r=30, t=50, b=100),
            )

        else:
            # --- Default: ranking horizontal bar chart ---
            items = list(reversed(ranking))

            # 1. Add the main bar trace FIRST so axes are initialized correctly
            fig.add_trace(go.Bar(
                y=[r['variable'] for r in items],
                x=[r.get('score', 0) for r in items],
                orientation='h',
                marker=dict(
                    color=[GRANGER_COLORS.get(r.get('granger_type', 'n/a') or 'n/a', '#6b7280') for r in items],
                ),
                text=[f"{r.get('score', 0):.1f}" for r in items],
                textposition='outside',
                hovertext=[
                    f"{r['variable']}<br>Score: {r.get('score',0):.1f}<br>Pearson: {r.get('pearson',0):.3f}<br>Lag: {r.get('lag_samples',0)}<br>Granger: {r.get('granger_type','n/a')}"
                    for r in items
                ],
                hoverinfo='text',
                showlegend=False,
            ))

            # 2. Add dummy traces for legend to match frontend (AFTER main trace)
            legend_items = [
                ('#22c55e', 'Cause'),
                ('#f59e0b', 'Feedback'),
                ('#ef4444', 'Effect'),
                ('#6b7280', 'Not significant'),
            ]
            
            for color, label in legend_items:
                 fig.add_trace(go.Scatter(
                    x=[None],
                    y=[None],
                    mode='markers',
                    marker=dict(size=10, color=color, symbol='square'),
                    name=label,
                    showlegend=True,
                    hoverinfo='none',
                ))

            fig.update_layout(
                template='plotly_white',
                title=dict(text=f'Root Cause → {target_var}', font=dict(size=14)),
                xaxis=dict(title='Score', showgrid=True),
                yaxis=dict(automargin=True),
                legend=dict(orientation='h', y=-0.2, x=0.5, xanchor='center'),
                margin=dict(l=10, r=50, t=50, b=50),
                bargap=0.25,
            )

        return fig

    @staticmethod
    def _configure_layout(
        fig: go.Figure,
        response: PlotDataResponse,
        config: VisualizationConfig,
        has_secondary_axis: bool
    ) -> None:
        """Configure the figure layout including axes, legend, and styling.

        Sets up the complete figure layout with appropriate axis labels,
        ranges, grid styling, and legend positioning. Handles special cases
        like PCA biplots (fixed aspect ratio, unit circle) and dual Y-axes.

        Args:
            fig: The Plotly figure to configure.
            response: PlotDataResponse containing axis labels.
            config: VisualizationConfig with axis range settings.
            has_secondary_axis: Whether to configure a secondary Y-axis.

        Note:
            For PCA plots, the layout enforces a 1:1 aspect ratio and adds
            a white unit circle shape as background.
        """
        
        # Base layout (no title, legend at bottom)
        layout_updates = dict(
            template='plotly_white',
            showlegend=True,
            legend=dict(
                orientation='h',
                yanchor='top',
                y=-0.25,
                xanchor='center',
                x=0.5
            ),
            margin=dict(l=60, r=60, t=50, b=100),
        )
        
        # X-axis
        xaxis_config = dict(
            title=dict(text=response.x_label),
            showgrid=True,
            gridwidth=1,
            gridcolor='rgba(128, 128, 128, 0.2)',
        )
        
        # Y-axis (primary)
        yaxis_config = dict(
            title=dict(text=response.y_label),
            showgrid=True,
            gridwidth=1,
            gridcolor='rgba(128, 128, 128, 0.2)',
        )
        
        # PCA-specific layout: correlation circle with unit radius
        is_pca = config.viz_type.value == 'pca'
        if is_pca:
            # Fixed range for unit circle with padding
            xaxis_config['range'] = [-1.3, 1.3]
            yaxis_config['range'] = [-1.3, 1.3]
            
            # Add zero lines
            xaxis_config['zeroline'] = True
            xaxis_config['zerolinewidth'] = 1
            xaxis_config['zerolinecolor'] = 'rgba(128, 128, 128, 0.5)'
            yaxis_config['zeroline'] = True
            yaxis_config['zerolinewidth'] = 1
            yaxis_config['zerolinecolor'] = 'rgba(128, 128, 128, 0.5)'
            
            # Ensure equal aspect ratio for PCA
            xaxis_config['scaleanchor'] = 'y'
            xaxis_config['scaleratio'] = 1
            
            # Grey background
            layout_updates['plot_bgcolor'] = '#e2e8f0'
            
            # Add white circle shape for correlation circle
            fig.add_shape(
                type="circle",
                xref="x", yref="y",
                x0=-1, y0=-1,
                x1=1, y1=1,
                fillcolor="white",
                line=dict(color="#888888", width=2),
                layer="below"
            )
        
        # FFT specific layout
        elif config.viz_type.value == 'fft':
             if config.fft.x_axis_scale:
                 xaxis_config['type'] = config.fft.x_axis_scale
             if config.fft.y_axis_scale:
                 yaxis_config['type'] = config.fft.y_axis_scale
        
        # Apply General Axis Scales (if not captured by above special cases)
        if config.viz_type.value not in ['pca', 'fft', 'correlation']:
            # X-Axis Scale: Only apply if provided AND not 'Index' (Date)
            if config.axis.x_axis_scale and config.axis.x_axis != 'Index':
                xaxis_config['type'] = config.axis.x_axis_scale
            
            # Y-Axis Scale
            if config.axis.y_axis_scale and config.axis.y_axis_scale != 'linear':
                yaxis_config['type'] = config.axis.y_axis_scale


        # Apply X-axis range if configured (non-PCA, non-auto-X types)
        # Box plots have categorical X axis (variable names), so range doesn't apply
        # FFT has its own frequency range logic
        x_range_unsupported = config.viz_type.value in ('box', 'fft')
        if config.axis.enable_x_axis_range and not is_pca and not x_range_unsupported:
            x_min_val = config.axis.x_axis_min
            x_max_val = config.axis.x_axis_max
            
            # Convert to log10 if log scale AND values are numeric
            if xaxis_config.get('type') == 'log':
                import math
                if isinstance(x_min_val, (int, float)) and x_min_val > 0:
                    x_min_val = math.log10(x_min_val)
                if isinstance(x_max_val, (int, float)) and x_max_val > 0:
                    x_max_val = math.log10(x_max_val)

            if x_min_val is not None and x_max_val is not None:
                xaxis_config['range'] = [x_min_val, x_max_val]
            elif x_min_val is not None:
                xaxis_config['range'] = [x_min_val, None]
                xaxis_config['autorange'] = False
            elif x_max_val is not None:
                xaxis_config['range'] = [None, x_max_val]
                xaxis_config['autorange'] = False
        
        # Ensure autorange is True if no range set (and not PCA)
        if not config.axis.enable_x_axis_range and not is_pca:
             if 'range' not in xaxis_config:
                xaxis_config['autorange'] = True

        # Apply Y-axis range if configured (non-PCA)
        # Checked AFTER setting type to handle log scale conversion
        if config.axis.enable_y_axis_range and not is_pca:
            min_val = config.axis.y_axis_min
            max_val = config.axis.y_axis_max
            
            # Convert to log10 if log scale
            if yaxis_config.get('type') == 'log':
                import math
                if min_val is not None:
                    min_val = math.log10(min_val) if min_val > 0 else None
                if max_val is not None:
                    max_val = math.log10(max_val) if max_val > 0 else None

            if min_val is not None and max_val is not None:
                yaxis_config['range'] = [min_val, max_val]
            elif min_val is not None:
                yaxis_config['range'] = [min_val, None]
                yaxis_config['autorange'] = False
            elif max_val is not None:
                yaxis_config['range'] = [None, max_val]
                yaxis_config['autorange'] = False
        
        # Ensure autorange is True if no range set (important for log scale toggling stability)
        if not config.axis.enable_y_axis_range and not is_pca:
            yaxis_config['autorange'] = True
        
        layout_updates['xaxis'] = xaxis_config
        layout_updates['yaxis'] = yaxis_config
        
        # Secondary Y-axis
        if has_secondary_axis:
            y2_label = config.axis.y2_label or "Secondary Axis"
            yaxis2_config = dict(
                title=dict(text=y2_label),
                side='right',
                overlaying='y',
                showgrid=False,
            )
            
            if config.axis.enable_y2_axis_range:
                if config.axis.y2_axis_min is not None and config.axis.y2_axis_max is not None:
                    yaxis2_config['range'] = [config.axis.y2_axis_min, config.axis.y2_axis_max]
            
            layout_updates['yaxis2'] = yaxis2_config
        
        fig.update_layout(**layout_updates)
    
    @staticmethod
    def _export_to_base64(fig: go.Figure, width: int, height: int) -> str:
        """Export a Plotly Figure to base64-encoded SVG.

        Uses the pre-initialized Kaleido scope for fast rendering, falling
        back to the standard Plotly method if the scope is unavailable.
        SVG format is preferred over PNG for resolution independence.

        Args:
            fig: The Plotly Figure to export.
            width: Output width in pixels.
            height: Output height in pixels.

        Returns:
            Base64-encoded SVG string.

        Raises:
            Exception: If Kaleido rendering fails (propagated to caller).
        """
        global _kaleido_scope
        try:
            # Use cached scope if available (much faster for multiple exports)
            if _kaleido_scope is not None:
                img_bytes = _kaleido_scope.transform(
                    fig.to_json(),
                    format="svg",
                    width=width,
                    height=height
                )
            else:
                # Fallback to standard method
                img_bytes = fig.to_image(
                    format="svg",
                    width=width,
                    height=height,
                    engine="kaleido"
                )
            return base64.b64encode(img_bytes).decode('utf-8')
        except Exception as e:
            logger.error(f"Kaleido export failed: {e}")
            raise
            raise
    

    @staticmethod
    def _hex_to_rgba(color_str: str, alpha: float = 1.0) -> str:
        """Convert a color string (hex or rgb) to an RGBA tuple string.

        Handles multiple input formats and returns a string suitable for
        use in Plotly's rgba() color specifications.

        Args:
            color_str: Color in hex (#RGB or #RRGGBB) or rgb(r,g,b) format.
            alpha: Opacity value from 0.0 (transparent) to 1.0 (opaque).

        Returns:
            Tuple string like "(255, 128, 0, 0.5)" for use in f"rgba{result}".
            Returns "(0, 0, 0, {alpha})" for invalid or missing input.

        Example:
            >>> PlotlyRenderer._hex_to_rgba("#ff8000", 0.5)
            "(255, 128, 0, 0.5)"
        """
        if not color_str or not isinstance(color_str, str):
            return f"(0, 0, 0, {alpha})"
        
        # Handle existing rgb/rgba strings
        if color_str.startswith('rgb'):
            import re
            nums = re.findall(r"(\d+)", color_str)
            if len(nums) >= 3:
                return f"({nums[0]}, {nums[1]}, {nums[2]}, {alpha})"
            return f"(0, 0, 0, {alpha})"
        
        # Handle Hex strings
        hex_color = color_str.lstrip('#')
        try:
            if len(hex_color) == 3:
                hex_color = ''.join([c*2 for c in hex_color])
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            return f"({r}, {g}, {b}, {alpha})"
        except (ValueError, IndexError):
            logger.warning(f"Failed to parse color: {color_str}")
            return f"(0, 0, 0, {alpha})"
    
    @staticmethod
    def format_config_details(config: VisualizationConfig) -> str:
        """Generate an HTML summary of visualization configuration for reports.

        Creates a human-readable configuration string showing the visualization
        type and key parameters. Used in export reports to document how each
        chart was configured.

        Args:
            config: VisualizationConfig to summarize.

        Returns:
            HTML string with pipe-separated config items, e.g.:
            "<strong>Type:</strong> regression | <strong>Target:</strong> temp"

        Note:
            Different viz types show different config items:
            - PCA: variables, components
            - Formula: expressions, regression settings
            - Regression: target, predictors, model type
            - Correlation: variables (truncated if >5)
            - Others: X/Y axes, regression if added
        """
        config_parts = [
            f"<strong>Type:</strong> {config.viz_type.value}",
        ]
        
        if config.viz_type.value == 'pca':
            config_parts.append(
                f"<strong>Variables:</strong> {', '.join(config.axis.y_axis)}"
            )
            config_parts.append(
                f"<strong>Components:</strong> {config.pca.components}"
            )
        elif config.viz_type.value == 'formula':
            if config.formula.x_formula:
                config_parts.append(f"<strong>X:</strong> {config.formula.x_formula}")
            config_parts.append(
                f"<strong>Plot:</strong> {config.formula.plot_type.value}"
            )
            if config.formula.add_regression:
                config_parts.append(
                    f"<strong>Regression:</strong> Degree {config.formula.regression_degree}"
                )
        elif config.viz_type.value == 'regression':
            if config.axis.y_axis:
                config_parts.append(f"<strong>Target:</strong> {config.axis.y_axis[0]}")
            predictors = config.regression.predictors or []
            config_parts.append(
                f"<strong>Predictors:</strong> {', '.join(predictors) if predictors else 'N/A'}"
            )
            config_parts.append(f"<strong>Model:</strong> {config.regression.model_type}")
        elif config.viz_type.value == 'correlation':
            config_parts.append(
                f"<strong>Variables:</strong> {', '.join(config.axis.y_axis[:5])}"
                + ('...' if len(config.axis.y_axis) > 5 else '')
            )
        else:
            config_parts.append(f"<strong>X:</strong> {config.axis.x_axis}")
            y_display = ', '.join(config.axis.y_axis[:3])
            if len(config.axis.y_axis) > 3:
                y_display += '...'
            config_parts.append(f"<strong>Y:</strong> {y_display}")
            
            if config.regression.added:
                config_parts.append(
                    f"<strong>Regression:</strong> Degree {config.regression.degree}"
                )
        
        return " | ".join(config_parts)
