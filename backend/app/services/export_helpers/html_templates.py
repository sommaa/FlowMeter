"""
Jinja2 HTML template for FlowMeter dashboard export reports.

This module contains the REPORT_TEMPLATE constant, a complete Jinja2
template for generating self-contained HTML reports with embedded
visualizations, statistics, and configurable branding.

Template variables:
    **Header Section:**
        - plant_name: Facility/plant name for the report title
        - logo_base64: Optional base64-encoded logo image

    **Report Info:**
        - date_range: Data date range as formatted string
        - author: Report author name
        - job_title: Author's job title
        - location: Facility location
        - generation_date: Report generation date
        - comments: Optional free-text comments (HTML-safe)

    **Statistics:**
        - stats_html: Pre-rendered HTML table of data statistics

    **Visualizations:**
        - plots: List of dicts with {id, title, config, image, notes}
            - image: Base64-encoded SVG plot image
            - config: HTML-formatted configuration summary
            - notes: Optional chart notes text

    **Branding:**
        - primary_color: Hex color for primary accents
        - primary_color_light: Lightened version for gradients
        - primary_color_rgb: RGB tuple for rgba() usage
        - secondary_color: Hex color for secondary accents
        - text_color: Contrast text color (black or white)
        - flowmeter_logo_b64: FlowMeter branding logo

Features:
    - Responsive layout with max-width container
    - Collapsible plot configuration details
    - Sticky table headers and row labels
    - Print-friendly styling
    - Self-contained (no external dependencies)
"""

REPORT_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{{ plant_name }} - Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            color: #212529;
            padding: 20px;
            min-height: 100vh;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 16px;
            padding: 40px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            border-top: 8px solid {{ primary_color }};
        }
        .header-section {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 4px solid {{ primary_color }};
        }
        .header-logo {
            max-height: 80px;
            max-width: 200px;
            object-fit: contain;
        }
        h1 {
            color: #000000;
            font-size: 2.5em;
            font-weight: 700;
            margin: 0;
        }
        h1 .eni-accent {
            color: {{ secondary_color }};
        }
        .info {
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            padding: 25px;
            margin: 20px 0;
            border-radius: 12px;
            border-left: 6px solid {{ primary_color }};
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .stats {
            background: #ffffff;
            padding: 0;
            margin: 20px 0;
            border-radius: 12px;
            border: 2px solid #e9ecef;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }

        .stats h2 {
            padding: 25px 25px 15px 25px;
            margin: 0;
            background: #ffffff;
            position: sticky;
            left: 0;
            z-index: 10;
            border-radius: 12px 12px 0 0;
            color: {{ secondary_color }};
        }

        .stats table {
            margin: 0;
            width: 100%;
        }

        .stats-padding-wrapper {
            padding: 20px;
            background: #ffffff;
            border-radius: 0 0 12px 12px;
            position: relative; /* Contain absolute children if any */
            z-index: 1; /* Establish base level */
        }

        .stats-scroll {
            overflow-x: auto;
            overflow-y: hidden; /* Prevent vertical overflow/leaks */
            padding: 0;
            border-radius: 12px; /* Inner radius to clip content */
            position: relative;
            z-index: 0; /* Create strict stacking context for sticky children */
            isolation: isolate; /* Ensure robustness */
            box-shadow: 0 0 0 1px #e9ecef inset; /* Subtle border for the scroll area */
        }
        table {
            width: 100%;
            border-collapse: separate; /* Changed to separate to allow border radius if needed, or keep collapse but spacing handling */
            border-spacing: 0;
            margin-top: 0;
            table-layout: fixed; /* Enforce constant width distribution */
        }
        th, td {
            padding: 15px 20px;
            text-align: left;
            border-bottom: 1px solid #e9ecef;
            white-space: normal; /* Allow wrapping */
            word-wrap: break-word; /* Ensure different words wrap */
            overflow-wrap: break-word; /* Standard property */
            width: 180px;
            min-width: 180px;
            max-width: 180px;
            background-clip: padding-box;
            vertical-align: middle;
        }
        th {
            background: linear-gradient(135deg, {{ primary_color }} 0%, {{ primary_color_light }} 100%);
            color: {{ text_color }};
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.85em;
            letter-spacing: 0.8px;
            position: sticky;
            top: 0;
            z-index: 10;
            border-bottom: none;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        th:first-child {
            position: sticky;
            left: 0;
            z-index: 20;
            background: linear-gradient(135deg, {{ primary_color }} 0%, {{ primary_color_light }} 100%);
            border-top-left-radius: 8px; /* Rounded corners for first header */
            padding-left: 25px;
            box-shadow: 2px 0 5px rgba(0,0,0,0.1);
        }
        th:last-child {
            border-top-right-radius: 8px; /* Rounded corners for last header */
        }
        td:first-child {
            padding-left: 25px;
            font-weight: 600;
            color: {{ secondary_color }};
            background: #fdfdfd;
            position: sticky;
            left: 0;
            z-index: 5;
            box-shadow: 2px 0 5px rgba(0,0,0,0.05);
        }
        tr:last-child td {
            border-bottom: none;
        }
        tr:nth-child(even) {
            background: #f8f9fa;
        }
        tr:hover {
            background: #fff8e1;
            transition: background 0.2s ease;
        }
        .plot-container {
            margin: 25px 0;
            padding: 25px;
            background: #ffffff;
            border-radius: 12px;
            border: 0px solid #e9ecef;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }
        .plot-title {
            font-size: 1.4em;
            font-weight: 700;
            color: {{ text_color }}; /* Consistent Header text color */
            margin-bottom: 15px;
            padding: 15px;
            background: linear-gradient(135deg, {{ primary_color }} 0%, {{ primary_color_light }} 100%);
            border-radius: 8px;
            border-left: 5px solid {{ secondary_color }};
            box-shadow: 0 2px 6px rgba({{ primary_color_rgb }}, 0.3);
            cursor: pointer;
            position: relative;
            transition: all 0.3s ease;
        }
        .plot-title:hover {
            box-shadow: 0 4px 8px rgba({{ primary_color_rgb }}, 0.4);
        }
        .plot-title::after {
            content: '▼';
            position: absolute;
            right: 20px;
            top: 50%;
            transform: translateY(-50%);
            transition: transform 0.3s;
            font-size: 0.8em;
            color: {{ text_color }};
        }
        .plot-title.collapsed::after {
            transform: translateY(-50%) rotate(-90deg);
        }
        .plot-title-text {
            display: inline-block;
        }
        .plot-config-details {
            background: rgba(255, 255, 255, 0.9);
            padding: 10px;
            margin-top: 10px;
            border-top: 0px solid rgba(0,0,0,0.1);
            font-size: 0.65em;
            color: #495057;
            max-height: 200px;
            overflow: hidden;
            transition: max-height 0.3s ease;
        }
        .plot-config-details.hidden {
            max-height: 0;
            padding: 0;
            margin-top: 0;
        }
        .plot-image {
            text-align: center;
            margin: 20px 0;
            background: #ffffff;
            padding: 15px;
            border-radius: 8px;
            border: 0px solid #dee2e6;
        }
        .plot-image img {
            max-width: 100%;
            height: auto;
            border-radius: 6px;
        }
        .plot-notes {
            background: #fff8e1;
            padding: 15px 18px;
            border-radius: 6px;
            margin-top: 12px;
            font-size: 0.95em;
            color: #212529;
            border-left: 4px solid {{ primary_color }};
            box-shadow: 0 2px 4px rgba({{ primary_color_rgb }}, 0.2);
        }
        h2 {
            color: {{ secondary_color }};
            margin-top: 10px;
            font-weight: 700;
            font-size: 1.5em;
        }
        p {
            line-height: 1.8;
            color: #495057;
        }
        strong {
            color: #000000;
            font-weight: 700;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding: 25px;
            background: linear-gradient(135deg, {{ primary_color }} 0%, {{ primary_color_light }} 100%);
            border-radius: 8px;
            border-top: 3px solid {{ secondary_color }};
            box-shadow: 0 4px 12px rgba({{ primary_color_rgb }}, 0.3);
        }
        .footer p {
            color: #000000;
            font-weight: 600;
        }
        h1 .company-accent {
            color: {{ secondary_color }};
        }
        .company-accent {
            color: {{ secondary_color }};
            font-weight: 700;
            position: relative;
            display: inline-block;
        }
        .value-highlight {
            color: {{ secondary_color }};
            font-weight: 600;
        }
        
        /* Storyline Styles */
        .sl-container {
            max-height: 450px;
            overflow-y: auto;
            position: relative;
            padding: 20px 20px 20px 20px;
            background: #ffffff;
            border-radius: 0 0 12px 12px;
            scrollbar-width: thin;
        }
        .sl-line {
            position: absolute;
            left: 35px;
            top: 25px;
            bottom: 25px;
            width: 2px;
            background: #e9ecef;
            z-index: 1;
        }
        .sl-event {
            position: relative;
            padding-left: 35px;
            margin-bottom: 20px;
        }
        .sl-dot {
            position: absolute;
            left: 10px;
            top: 15px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #ffffff;
            border: 3px solid {{ secondary_color }};
            z-index: 2;
            box-shadow: 0 0 0 3px #ffffff; /* Contrast ring */
        }
        .sl-card {
            background: #ffffff;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.03);
            transition: all 0.2s ease;
        }
        .sl-card:hover {
            box-shadow: 0 4px 8px rgba(0,0,0,0.08);
            transform: translateY(-1px);
            border-color: {{ secondary_color }};
        }
        .sl-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .sl-title {
            margin: 0;
            color: #212529;
            font-size: 1.05em;
            font-weight: 700;
        }
        .sl-date {
            font-size: 0.85em;
            color: {{ secondary_color }};
            font-weight: 600;
            background: rgba({{ primary_color_rgb }}, 0.1);
            padding: 4px 8px;
            border-radius: 4px;
        }
        .sl-desc {
            margin: 0;
            color: #495057;
            font-size: 0.95em;
            line-height: 1.6;
            white-space: pre-wrap;
        }
    </style>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const titles = document.querySelectorAll('.plot-title');

            titles.forEach(title => {
                const details = title.querySelector('.plot-config-details');

                // Start collapsed
                title.classList.add('collapsed');
                details.classList.add('hidden');

                // Simple click handler
                title.addEventListener('click', function() {
                    this.classList.toggle('collapsed');
                    details.classList.toggle('hidden');
                });
            });
        });
    </script>
</head>
<body>
    <div class="container">
        <div class="header-section">
            <h1>🏭 <span class="company-accent">{{ plant_name }}</span> Report</h1>
            {% if logo_base64 %}
            <img src="{{ logo_base64 }}" alt="Logo" class="header-logo">
            {% endif %}
        </div>

        <div class="info">
            <h2 style="margin-bottom: 20px; color: {{ secondary_color }};">📋 Report Information</h2>
            <p><strong>Date Range:</strong> <span class="value-highlight">{{ date_range }}</span></p>
            <p><strong>Generated By:</strong> <span class="value-highlight">{{ author }} | {{ job_title }}</span></p>
            <p><strong>Generation Date:</strong> <span class="value-highlight">{{ generation_date }}</span></p>
        </div>

        {% if show_comments and comments %}
        <div class="info" style="background: #fff8e1; border-left-color: {{ secondary_color }};">
            <h2 style="color: {{ secondary_color }};">💭 Comments</h2>
            <div style="padding: 10px; background: #fff8e1; border-radius: 6px; margin-top: 10px;">
                {{ comments | safe }}
            </div>
        </div>
        {% endif %}

        {% if show_storyline and storyline_events %}
        <div class="stats">
            <h2>📅 Storyline Events</h2>
            <div class="sl-container">
                 <div class="sl-line"></div>
                 {% for event in storyline_events %}
                 <div class="sl-event">
                     <div class="sl-dot" style="background-color: {{ event.color or '#6366f1' }}; border-color: {{ event.color or '#6366f1' }}; color: white; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; width: 18px; height: 18px; left: 7px; top: 13px;">{{ loop.index }}</div>
                     <div class="sl-card">
                         <div class="sl-header">
                            <h4 class="sl-title">{{ event.title }}</h4>
                            <span class="sl-date">{{ event.formatted_date }}</span>
                         </div>
                         <p class="sl-desc">{{ event.description }}</p>
                     </div>
                 </div>
                 {% endfor %}
            </div>
        </div>
        {% endif %}

        {% if show_statistics %}
        <div class="stats">
            <h2>📊 Data Statistics</h2>
            <div class="stats-padding-wrapper">
                <div class="stats-scroll">
                    {{ stats_html | safe }}
                </div>
            </div>
        </div>
        {% endif %}

        {% if show_visualizations %}
        <div class="stats">
             <h2>📈 Visualizations</h2>
             <!-- Plots injected here -->
             {% for plot in plots %}
             <div class="plot-container">
                <div class="plot-title">
                    <div class="plot-title-text">{{ plot.id }}. {{ plot.title }}</div>
                    <div class="plot-config-details">
                        {{ plot.config | safe }}
                    </div>
                </div>
                <div class="plot-image">
                    <img src="data:image/svg+xml;base64,{{ plot.image }}" alt="{{ plot.title }}">
                </div>
                {% if plot.notes %}
                <div class="plot-notes">
                    <strong>📝 Notes:</strong> {{ plot.notes }}
                </div>
                {% endif %}
            </div>
            {% endfor %}
        </div>
        {% endif %}

        <div class="footer">
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 12px;">
                <span style="font-size: 1.05em; color: #333;">Generated with</span>
                <img src="data:image/svg+xml;base64,{{ flowmeter_logo_b64 }}" alt="FlowMeter" style="height: 24px; vertical-align: middle;">
                <span style="font-size: 1.1em; font-weight: bold;">FlowMeter</span>
            </div>
            <p style="margin-bottom: 5px;"><strong>Generated By:</strong> {{ author }} | {{ job_title }}</p>
            <p style="font-size: 0.9em; color: #666;"><strong>Location:</strong> {{ location }} | <strong>Date:</strong> {{ generation_date }}</p>
        </div>
    </div>
</body>
</html>
"""
