"""
HTML report generation service for FlowMeter dashboards.

This module provides the DashboardExporter class that generates self-contained
HTML reports from dashboard data, including rendered plots, statistics tables,
and configurable branding. Reports are suitable for offline viewing and
printing.

The export pipeline:
    1. Apply optional date range filtering to the dataset
    2. Generate static plot images in parallel using Plotly/Kaleido
    3. Compute statistics tables for visualized columns
    4. Render the final HTML using Jinja2 templates

Key features:
    - Parallel plot rendering for performance (ThreadPoolExecutor)
    - Self-contained HTML with embedded base64 images
    - Configurable branding (colors, logo, author info)
    - Automatic contrast color selection for readability
"""

import logging
import traceback
import pandas as pd
from datetime import datetime
from jinja2 import Template
from typing import List, Dict, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

from app.models.schemas import VisualizationConfig, ExportSettings
from app.services.export_helpers.utils import (
    filter_dataframe_by_date, hex_to_rgb, lighten_color, get_contrast_color
)
from app.services.export_helpers.plotly_renderer import PlotlyRenderer
from app.services.export_helpers.statistics import compute_statistics
from app.services.export_helpers.html_templates import REPORT_TEMPLATE
from app.services.visualization_service import VisualizationService

logger = logging.getLogger(__name__)

class DashboardExporter:
    """Service for generating self-contained HTML reports from dashboard data.

    Orchestrates the report generation pipeline by coordinating plot rendering,
    statistics computation, and template rendering. Delegates specialized tasks
    to helper modules in app.services.export_helpers.

    The generated reports are fully self-contained HTML files with embedded
    images and styles, suitable for email distribution or offline viewing.

    Example:
        >>> exporter = DashboardExporter()
        >>> html = exporter.generate_html_report(
        ...     df=data,
        ...     visualizations=viz_configs,
        ...     plant_name="Refinery A",
        ...     comments="Monthly performance review"
        ... )
        >>> with open("report.html", "w") as f:
        ...     f.write(html)
    """

    def generate_html_report(
        self,
        df: pd.DataFrame,
        visualizations: List[VisualizationConfig],
        plant_name: str,
        comments: str = "",
        settings: Optional[ExportSettings] = None,
        date_range: Optional[Dict[str, str]] = None,
        storyline_events: Optional[List] = None,
        report_sections = None
    ) -> str:
        """Generate a complete HTML report from dashboard data.

        Processes the dataset and visualization configurations to produce
        a styled HTML report with embedded plot images, statistics tables,
        and metadata. Plot rendering is parallelized for performance.

        Args:
            df: The pandas DataFrame containing the dataset to visualize.
            visualizations: List of VisualizationConfig objects defining
                each chart to include in the report.
            plant_name: Name of the plant/facility for the report header.
            comments: Optional free-text comments to include in the report.
                Newlines are converted to HTML line breaks.
            settings: Optional ExportSettings with branding configuration
                (colors, logo, author info). Uses defaults if not provided.
            date_range: Optional dict with 'start' and 'end' keys to filter
                the dataset before rendering. Format: ISO date strings.
            storyline_events: Optional list of storyline events to include.

        Returns:
            Complete HTML document as a string, ready to save or serve.

        Note:
            Plot rendering uses up to 4 parallel workers. Errors in individual
            plots are logged but don't fail the entire report - the plot is
            simply omitted from the output.
        """

        logger.info(f"Generating report with comments: '{comments}' (Type: {type(comments)})")
        # Use default settings if none provided
        if settings is None:
            settings = ExportSettings()
        
        # Ensure storyline_events is a list if None
        if storyline_events is None:
            storyline_events = []

        # 0. Apply Global Date Filter if provided
        # This ensures the entire report (header, stats, plots) reflects the filtered range
        if date_range:
            df = filter_dataframe_by_date(df, date_range)

        # 1. Generate Plots using PARALLEL processing for speed
        viz_service = VisualizationService()
        plots_data = []
        
        def generate_single_plot(args: Tuple[int, VisualizationConfig]) -> Optional[Dict]:
            """Generate a single plot image for parallel processing.

            Args:
                args: Tuple of (index, VisualizationConfig) for the plot.

            Returns:
                Dict with plot data (id, title, image, config, notes) on success,
                or None if rendering fails.
            """
            i, viz = args
            try:
                # Use the SAME logic as the frontend API for data generation
                plot_response = viz_service.generate_plot_data_from_df(df, viz)
                
                # Render to static image using Plotly + Kaleido
                # Pass storyline_events for consistent rendering with app
                base64_img = PlotlyRenderer.render_to_base64(
                    plot_response, viz, storyline_events=storyline_events
                )
                config_details = PlotlyRenderer.format_config_details(viz)
                
                if base64_img:
                    return {
                        "id": i,
                        "title": viz.title,
                        "image": base64_img,
                        "config": config_details,
                        "notes": viz.notes
                    }
            except Exception as e:
                logger.error(f"Error generating plot {viz.title}: {e}")
                traceback.print_exc()
            return None
        
        # Use ThreadPoolExecutor for parallel rendering
        # max_workers=4 is a good balance - more may cause memory issues
        with ThreadPoolExecutor(max_workers=4) as executor:
            # Submit all plots for parallel processing
            futures = {
                executor.submit(generate_single_plot, (i, viz)): i 
                for i, viz in enumerate(visualizations, 1)
            }
            
            # Collect results in order
            results = {}
            for future in as_completed(futures):
                idx = futures[future]
                result = future.result()
                if result:
                    results[idx] = result
            
            # Sort by original order
            plots_data = [results[i] for i in sorted(results.keys())]

        # 2. Generate Statistics
        stats_html = compute_statistics(df, visualizations)

        # 3. Prepare Template Context
        date_range_text = "N/A"
        if not df.empty:
            if isinstance(df.index, pd.DatetimeIndex):
                start = df.index.min().strftime('%d-%m-%Y')
                end = df.index.max().strftime('%d-%m-%Y')
                date_range_text = f"{start} to {end}"
            else:
                # Try to find a datetime column
                date_cols = df.select_dtypes(include=['datetime64']).columns
                if len(date_cols) > 0:
                    start_date = df[date_cols[0]].min().strftime(
                        '%d-%m-%Y')
                    end_date = df[date_cols[0]].max().strftime(
                        '%d-%m-%Y')
                    date_range_text = f"{start_date} to {end_date}"

        # Format storyline events dates for display
        formatted_events = []
        for event in storyline_events:
            # Convert model to dict if it isn't already
            evt = event.dict() if hasattr(event, 'dict') else event
            try:
                # Format ISO date to readable string
                dt = pd.to_datetime(evt['date'])
                evt['formatted_date'] = dt.strftime('%d-%m-%Y %H:%M')
            except:
                evt['formatted_date'] = evt['date']
            formatted_events.append(evt)

        # Sort events by date
        try:
            formatted_events.sort(key=lambda x: x['date'])
        except:
            pass

        context = {
            "plant_name": plant_name,
            "date_range": date_range_text,
            "generation_date": datetime.now().strftime('%d-%m-%Y'),
            "author": settings.author_name,
            "job_title": settings.job_title,
            "location": settings.location,
            "comments": comments.replace('\n', '<br>') if comments else "",
            "stats_html": stats_html,
            "plots": plots_data,
            "storyline_events": formatted_events,

            "primary_color": settings.primary_color,
            "primary_color_light": lighten_color(settings.primary_color, 0.4),
            "primary_color_rgb": hex_to_rgb(settings.primary_color),
            "text_color": get_contrast_color(settings.primary_color),
            "secondary_color": settings.secondary_color,
            "logo_base64": settings.logo_base64,

            # Section visibility flags
            "show_comments": report_sections.comments if report_sections else True,
            "show_storyline": report_sections.storyline if report_sections else True,
            "show_statistics": report_sections.statistics if report_sections else True,
            "show_visualizations": report_sections.visualizations if report_sections else True,
        }

        # Load logo variants dynamically from frontend public folder
        def load_logo_base64(filename: str) -> str:
            """Load an SVG logo file and encode it as base64.

            Handles both development mode (loading from frontend/public)
            and PyInstaller frozen mode (loading from bundled resources).

            Args:
                filename: Name of the SVG file (e.g., 'logo_black_colored.svg').

            Returns:
                Base64-encoded string of the file contents, or empty string
                if the file is not found.
            """
            import os
            import sys
            import base64

            # Check if running as PyInstaller executable
            if getattr(sys, 'frozen', False):
                # If frozen, look in the PyInstaller temp folder
                base_dir = sys._MEIPASS
                logo_path = os.path.join(base_dir, filename)
            else:
                # If dev, go up to frontend/public
                backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
                logo_path = os.path.join(backend_dir, '..', 'frontend', 'public', filename)

            if os.path.exists(logo_path):
                with open(logo_path, 'rb') as f:
                    return base64.b64encode(f.read()).decode('utf-8')
            logger.warning(f"Logo file not found: {logo_path}")
            return ""
        
        logo_black = load_logo_base64('logo_black_colored.svg')
        logo_white = load_logo_base64('logo_white_colored.svg')
        
        # Select logo based on text contrast color
        # If text_color is white (#ffffff), background is dark -> Use White Logo
        # If text_color is black/dark (#212529), background is light -> Use Black Logo
        selected_logo = logo_white if context["text_color"] == "#ffffff" else logo_black
        
        context["flowmeter_logo_b64"] = selected_logo

        # 4. Render HTML
        return self._render_template(context)

    def _render_template(self, context: Dict) -> str:
        """Render the Jinja2 HTML template with the provided context.

        Uses the REPORT_TEMPLATE from html_templates module and substitutes
        all context variables to produce the final HTML output.

        Args:
            context: Dictionary containing all template variables including
                plant_name, plots, stats_html, branding colors, etc.

        Returns:
            Rendered HTML string on success. On failure, returns a minimal
            error page with the exception message.
        """
        try:
            template = Template(REPORT_TEMPLATE)
            return template.render(context)
        except Exception as e:
            logger.error(f"Template rendering failed: {e}")
            traceback.print_exc()
            return f"<html><body><h1>Error generating report</h1><p>{str(e)}</p></body></html>"
