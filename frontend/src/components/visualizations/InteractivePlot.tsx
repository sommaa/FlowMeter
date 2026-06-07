/**
 * Interactive plot component with comprehensive Plotly.js visualization support.
 *
 * This component handles rendering of all visualization types in the application including
 * line charts, scatter plots, bar charts, area charts, correlation matrices, PCA plots,
 * FFT analysis, and root cause analysis. It supports advanced features like:
 *
 * - Dual y-axes for multi-scale data
 * - Regression analysis with confidence intervals
 * - Limit lines with shaded threshold regions
 * - Storyline event markers on time-series data
 * - Custom color schemes and styling
 * - Dynamic responsive resizing
 * - Theme-aware rendering (light/dark mode)
 * - Multiple chart types (line, scatter, bar, area, step, box, heatmap)
 * - Logarithmic and linear axis scales
 *
 * The component uses Plotly.js for rendering and is optimized with memoization to prevent
 * unnecessary re-renders. It dynamically adapts layout and features based on visualization
 * type and configuration.
 *
 * @module components/visualizations/InteractivePlot
 */

import React, { useMemo } from 'react';
const Plot = React.lazy(() => import('react-plotly.js'));
import { PlotDataResponse, VisualizationConfig, StorylineEvent } from '@/types';
import { useStore } from '@/store';
import { Loading } from '@/components/common';
import { Data, Layout, Config, Shape, Annotations } from 'plotly.js';
import { CHART_COLORS, THEME_COLORS } from '@/lib/constants';

// Plotly.js doesn't include Magma, Inferno, or Plasma as built-in colorscales.
// Define them as custom color arrays so they work in heatmaps.
const CUSTOM_COLORSCALES: Record<string, [number, string][]> = {
  Magma: [
    [0, '#000004'], [0.125, '#180f3d'], [0.25, '#440f76'],
    [0.375, '#721f81'], [0.5, '#9e2f7f'], [0.625, '#cd4071'],
    [0.75, '#f1605d'], [0.875, '#feb078'], [1, '#fcfdbf'],
  ],
  Inferno: [
    [0, '#000004'], [0.125, '#1b0c41'], [0.25, '#4a0c6b'],
    [0.375, '#781c6d'], [0.5, '#a52c60'], [0.625, '#cf4446'],
    [0.75, '#ed6925'], [0.875, '#fb9b06'], [1, '#fcffa4'],
  ],
  Plasma: [
    [0, '#0d0887'], [0.125, '#46039f'], [0.25, '#7201a8'],
    [0.375, '#9c179e'], [0.5, '#bd3786'], [0.625, '#d8576b'],
    [0.75, '#ed7953'], [0.875, '#fb9f3a'], [1, '#f0f921'],
  ],
};

/** Resolve a colormap name to a Plotly colorscale value (string or custom array). */
function resolveColorscale(name: string | undefined): string | [number, string][] {
  if (!name) return 'RdBu';
  if (CUSTOM_COLORSCALES[name]) return CUSTOM_COLORSCALES[name];
  return name; // built-in Plotly.js name
}

/**
 * Props for the InteractivePlot component.
 *
 * @interface InteractivePlotProps
 * @property {PlotDataResponse} data - Plot data from backend including series, annotations, etc.
 * @property {VisualizationConfig} [config] - Visualization configuration (optional)
 * @property {boolean} [loading] - Whether data is currently loading (default: false)
 * @property {number} [height] - Plot height in pixels (default: 400)
 */
interface InteractivePlotProps {
  data: PlotDataResponse;
  config?: VisualizationConfig;
  loading?: boolean;
  height?: number;
}

/**
 * Interactive Plotly.js visualization component.
 *
 * Renders dynamic, interactive charts with support for multiple visualization types and
 * advanced features. The component automatically adapts to the configured visualization
 * type and applies appropriate rendering logic.
 *
 * Chart Types Supported:
 * - Standard: line, scatter, bar, area, step, box plot, line+scatter
 * - Analysis: correlation matrix (heatmap), PCA, FFT, root cause analysis
 *
 * Key Features:
 * - Dual Y-Axes: Supports left and right y-axes for multi-scale data
 * - Regression: Renders regression lines with configurable confidence intervals
 * - Limits: Draws threshold lines with optional shaded areas (above/below)
 * - Storyline: Overlays event markers on time-series plots
 * - Responsive: Auto-resizes on container changes with throttled updates
 * - Theme Integration: Adapts colors and styling based on light/dark theme
 * - Custom Colors: Respects user-defined color overrides from config
 * - Legend Labels: Displays custom variable names/labels if configured
 *
 * Performance Optimizations:
 * - Lazy-loads Plotly library to reduce initial bundle size
 * - Memoizes data transformation, layout, and config to prevent recalculation
 * - Uses ResizeObserver with requestAnimationFrame throttling
 * - Prevents updates during sidebar transitions to avoid jank
 *
 * Visualization Type Behaviors:
 * - Correlation: Renders heatmap with custom labels and 1px cell gaps
 * - PCA: Adds correlation circle, centers axes at origin, locks aspect ratio
 * - FFT: Standard line plot with frequency domain data
 * - Root Cause: Analysis-specific rendering with arrows and annotations
 * - Standard Plots: Full suite of series, regression, and axis controls
 *
 * @param {InteractivePlotProps} props - Component props
 * @returns {JSX.Element} Interactive Plotly chart or loading/empty state
 *
 * @example
 * ```tsx
 * <InteractivePlot
 *   data={plotResponse}
 *   config={visualizationConfig}
 *   loading={isLoading}
 *   height={600}
 * />
 * ```
 */
export const InteractivePlotComponent: React.FC<InteractivePlotProps> = ({
  data,
  config: vizConfig,
  loading = false,
  height = 400,
}) => {
  // Use individual selector instead of useStore() to prevent infinite re-renders
  const isDarkMode = useStore((state) => state.isDarkMode);
  const storylineEvents = useStore((state) => state.storylineEvents);
  const isStorylineEnabled = useStore((state) => state.isStorylineEnabled);

  // Refs for resizing - Moved to top
  const plotRef = React.useRef<any>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [revision, setRevision] = React.useState(0);


  // Convert series data to Plotly format
  const plotlyData: Data[] = useMemo(() => {
    // ... (existing logic, safe to run even if loading/no data, just returns empty or processes)
    if (!data) return [];

    // Correlation Matrix Handling
    if (vizConfig?.viz_type === 'correlation' && data.correlation_matrix) {
      // Helper to Map raw names to custom labels
      const getLabel = (name: string) => {
        const idx = vizConfig?.axis?.y_axis?.indexOf(name);
        if (idx !== undefined && idx !== -1 && vizConfig?.legend?.labels?.[idx]) {
          return vizConfig.legend.labels[idx];
        }
        return name;
      };

      return [{
        type: 'heatmap',
        x: data.correlation_matrix.x.map(getLabel),
        y: data.correlation_matrix.y.map(getLabel),
        z: data.correlation_matrix.z,
        colorscale: resolveColorscale(vizConfig?.style?.colormap),
        zmin: -1,
        zmax: 1,
        hoverongaps: false,
        xgap: 1,  // Add 1px gap between cells horizontally
        ygap: 1,  // Add 1px gap between cells vertically
      } as Data];
    }

    if (!data.series) {
      console.warn('InteractivePlot: No series data found', data);
      return [];
    }



    const regularTraces: Data[] = [];
    const ciTraces: Data[] = [];

    data.series.forEach((series) => {

      // ... existing series processing ...
      const x = series.data.map((d) => d.x);
      const y = series.data.map((d) => d.y);
      if (x.length > 0) {

      } else {
        console.warn(`  Series ${series.name} has NO data points.`);
      }

      // Find the y_axis column this series corresponds to.
      // series.name might be a custom legend label (not the column name),
      // so also check by matching legend labels to find the original column.
      let seriesIndex = vizConfig?.axis?.y_axis?.indexOf(series.name) ?? -1;
      let matchedCol: string | undefined = seriesIndex >= 0 ? vizConfig?.axis?.y_axis?.[seriesIndex] : undefined;

      if (seriesIndex < 0 && vizConfig?.axis?.y_axis) {
        vizConfig.axis.y_axis.forEach((col, i) => {
          const label = vizConfig?.legend?.labels?.[i];
          if (label && label === series.name) {
            seriesIndex = i;
            matchedCol = col;
          }
        });
      }

      // If the series corresponds to a selected variable, use the frontend standard color palette
      // This ensures it matches the "default" shown in the ConfigurationPanel color picker
      const defaultColor = seriesIndex >= 0
        ? CHART_COLORS[seriesIndex % CHART_COLORS.length]
        : series.color; // Fallback to backend color for derived series (like Regression or CI)

      // Look up custom color by column name (primary, matches how SeriesList stores it)
      // then by series.name (fallback for derived series)
      const finalColor = (matchedCol && vizConfig?.style?.custom_colors?.[matchedCol])
        || vizConfig?.style?.custom_colors?.[series.name]
        || defaultColor;

      let displayName = series.name;
      if (seriesIndex >= 0 && vizConfig?.legend?.labels?.[seriesIndex]) {
        displayName = vizConfig.legend.labels[seriesIndex];
      } else if (vizConfig?.axis?.y_axis) {
        vizConfig.axis.y_axis.forEach((col, i) => {
          const label = vizConfig?.legend?.labels?.[i];
          if (label) {
            if (series.name === `Reg: ${col}`) displayName = `Reg: ${label}`;
            else if (series.name.startsWith(`Reg: ${col} |`)) displayName = series.name.replace(`Reg: ${col}`, `Reg: ${label}`);
            else if (series.name === `Trend (${col})`) displayName = `Trend (${label})`;
          }
        });
      }

      // Detect trendlines/regression lines by name pattern
      const isTrendline = series.name.startsWith('Trend (') || series.name.startsWith('Reg:') || series.name.includes('Regression');
      // Internal series (like PCA circle) start with underscore - hide from legend
      const isInternalSeries = series.name.startsWith('_');

      // Resolve line style: from backend response > vizConfig series_configs > defaults
      const lineDash = series.line_dash
        || (matchedCol && vizConfig?.series_configs?.[matchedCol]?.line_dash)
        || 'solid';
      const lineWidth = series.line_width
        ?? (matchedCol && vizConfig?.series_configs?.[matchedCol]?.line_width)
        ?? 2;

      const baseTrace: any = {
        x,
        y,
        name: displayName,
        line: {
          color: finalColor,
          width: isTrendline ? 2 : lineWidth,
          dash: isTrendline ? 'dot' : (lineDash === 'solid' ? undefined : lineDash)
        },
        marker: { color: finalColor },
        hoverinfo: isInternalSeries ? 'skip' : 'name+x+y',
        showlegend: !isInternalSeries,
      };

      // Resolve marker symbol: from backend response > vizConfig series_configs > default
      let markerSymbol = series.marker_symbol
        || (matchedCol && vizConfig?.series_configs?.[matchedCol]?.marker_symbol)
        || 'circle';

      // Resolve filled/unfilled: append -open for unfilled markers
      const markerFilled = series.marker_filled ?? (matchedCol && vizConfig?.series_configs?.[matchedCol]?.marker_filled) ?? true;
      if (!markerFilled && !markerSymbol.includes('-open')) {
        markerSymbol = `${markerSymbol}-open`;
      }

      // Resolve custom marker size (null = auto-calculated per trace type)
      const customMarkerSize = series.marker_size
        ?? (matchedCol && vizConfig?.series_configs?.[matchedCol]?.marker_size)
        ?? null;

      // Assign Y-Axis
      if (series.y_axis_id === 'right') {
        baseTrace.yaxis = 'y2';
      }

      // Special handling for Confidence Intervals - use render_type instead of name parsing
      const isCI = series.render_type === 'ci_lower' || series.render_type === 'ci_upper';
      if (isCI) {
        // Ensure CI follows the main series axis
        if (series.y_axis_id === 'right') {
          baseTrace.yaxis = 'y2';
        }

        // Skip if user disabled CI
        if (vizConfig?.regression?.show_confidence_interval === false) {
          return;
        }

        baseTrace.mode = 'lines';
        baseTrace.type = 'scatter';
        baseTrace.line = { width: 0, color: 'transparent' }; // Hide the boundary line
        baseTrace.showlegend = false;

        // fill='tonexty' must be on Upper (fills down to previous trace Lower)
        if (series.render_type === 'ci_upper') {
          baseTrace.fill = 'tonexty';
          baseTrace.fillcolor = finalColor; // Backend sends rgba(..., 0.2)
        }

        ciTraces.push(baseTrace);
        return;
      }

      const normalizedType = series.type.toLowerCase();
      switch (normalizedType) {
        case 'scatter':
          // Dynamic marker size based on data points count to prevent dense overlap
          const validPointsCount = series.data.filter((d) => d.y !== null && d.y !== undefined).length;
          let markerSize = 6;
          if (validPointsCount < 50) markerSize = 9;
          else if (validPointsCount < 100) markerSize = 8;
          else if (validPointsCount < 300) markerSize = 7;
          else if (validPointsCount < 1000) markerSize = 6;
          else markerSize = 5;

          regularTraces.push({
            ...baseTrace,
            type: 'scatter',
            mode: 'markers',
            marker: { ...baseTrace.marker, size: customMarkerSize ?? markerSize, symbol: markerSymbol },
          } as Data);
          break;
        case 'bar':
          regularTraces.push({
            ...baseTrace,
            type: 'bar',
          } as Data);
          break;
        case 'area':
          regularTraces.push({
            ...baseTrace,
            type: 'scatter',
            mode: 'lines',
            connectgaps: true, // Connect gaps for area
            fill: vizConfig?.style?.enable_stacking ? 'tonexty' : 'tozeroy',
            stackgroup: vizConfig?.style?.enable_stacking ? 'one' : undefined,
            fillcolor: finalColor && finalColor.startsWith('#')
              ? `${finalColor}${vizConfig?.style?.enable_stacking ? '80' : '33'}`
              : undefined,
          } as Data);
          break;
        case 'step':
          regularTraces.push({
            ...baseTrace,
            type: 'scatter',
            mode: 'lines',
            connectgaps: true, // Connect gaps for step
            line: { ...baseTrace.line, shape: 'hv' },
          } as Data);
          break;
        case 'line':
        default:
          regularTraces.push({
            ...baseTrace,
            type: 'scatter',
            mode: 'lines',
            connectgaps: true, // Connect gaps for standard line
          } as Data);
          break;
        case 'box':
          const boxData = series.data[0] as unknown as Record<string, unknown>;
          regularTraces.push({
            type: 'box',
            name: displayName,
            y: [boxData.low, boxData.q1, boxData.median, boxData.q3, boxData.high],
            marker: { color: series.color },
          } as Data);
          break;
        case 'line+scatter':
          const scatterCount = series.data.filter((d) => d.y !== null && d.y !== undefined).length;
          const autoLineScatterSize = scatterCount < 50 ? 14 : scatterCount < 100 ? 12 : scatterCount < 300 ? 10 : scatterCount < 1000 ? 7 : 5;
          regularTraces.push({
            ...baseTrace,
            type: 'scatter',
            mode: 'lines+markers',
            connectgaps: true, // Connect gaps for line+scatter
            marker: { ...baseTrace.marker, size: customMarkerSize ?? autoLineScatterSize, symbol: markerSymbol },
          } as Data);
          break;

      }
    });

    if (data.regression_line) {
      // Logic for main regression line (global)
      // Check if it should be on right axis? Usually global regression is for the first series or explicit.
      // If it's a dedicated regression plot, likely left.
      // If we move to per-series regression, data.regression_line might be deprecated or just one of many.
      // But for backward compat:
      regularTraces.push({
        x: data.regression_line.data.map((d) => d.x),
        y: data.regression_line.data.map((d) => d.y),
        name: data.regression_line.name,
        type: 'scatter',
        mode: 'lines',
        line: {
          color: data.regression_line.color || THEME_COLORS.warning,
          dash: 'dash',
          width: 2,
        },
      } as Data);
    }

    // --- Limit Lines as Traces (for Legend) ---
    const limitTraces: Data[] = [];
    if (regularTraces.length > 0) {
      // Determine X range to draw horizontal lines
      // We'll use the first trace's X as a reference, or find min/max
      // For simplicity, we can use the first trace's X values if they exist
      // Or we can just use 2 points [min_x, max_x] if we can determine them.
      // Plotly is smart enough to handle [min, max] for lines if axes are set,
      // but safe bet is to just use the layout range or similar.
      // ACTUALLY: The best way for a horizontal line across the WHOLE axis in Plotly
      // that SHOWS IN LEGEND is to use a trace, but identifying the 'x' range can be tricky if dynamic.
      // A common reliable trick: Use x=[x_min, x_max] from data.

      // Type assertion used here because Plotly Data types are complex unions
      // and 'x' access is not guaranteed on all types without narrowing.
      let xRef = (regularTraces[0] as any).x as any[];
      if (!xRef || xRef.length === 0) {
        // Try to find any trace with data
        const t = regularTraces.find(t => ((t as any).x as any[])?.length > 0);
        if (t) xRef = (t as any).x as any[];
      }

      if (xRef && xRef.length > 0) {
        // Find min and max for X.
        // If strings (categories), take first and last.
        // If numbers/dates, take min and max.
        const x0 = xRef[0];
        const x1 = xRef[xRef.length - 1];
        // We'll create a 2-point line
        const xLimit = [x0, x1];


        if (vizConfig?.limits?.thresholds) {
          vizConfig.limits.thresholds.forEach((threshold) => {
            limitTraces.push({
              x: xLimit,
              y: [threshold.value, threshold.value],
              mode: 'lines',
              type: 'scatter',
              name: threshold.label || `Limit ${threshold.value}`,
              line: { color: threshold.color || THEME_COLORS.danger, width: 2, dash: 'dash' },
              yaxis: threshold.y_axis_id === 'right' ? 'y2' : 'y',
              hoverinfo: 'name+y',
              showlegend: true,
            } as any);
          });
        }
      }
    }

    // --- Storyline Events Trace ---
    // (Removed during revert)

    // Return CI traces (bg), then Limits, then Regular (fg), then Regression
    const finalTraces = [...ciTraces, ...limitTraces, ...regularTraces];
    if (finalTraces.length > 0) {
    }
    return finalTraces;
  }, [data, vizConfig]);

  const layout: Partial<Layout> = useMemo(() => {
    try {
      if (!data) return {};

      // Check if we need right axis
      const hasRightAxis = data.series?.some(s => s.y_axis_id === 'right');

      const shapes: Partial<Shape>[] = [];
      const annotations: Partial<Annotations>[] = [];

      // ... (rest of layout logic)

      // Calculate Y-Range for "Smart Shading" for BOTH axes
      let yMaxLeft = -Infinity, yMinLeft = Infinity;
      let yMaxRight = -Infinity, yMinRight = Infinity;

      // 1. Check Manual Ranges
      if (vizConfig?.axis?.enable_y_axis_range) {
        if (vizConfig.axis.y_axis_max != null) yMaxLeft = vizConfig.axis.y_axis_max;
        if (vizConfig.axis.y_axis_min != null) yMinLeft = vizConfig.axis.y_axis_min;
      }
      if (vizConfig?.axis?.enable_y2_axis_range) {
        if (vizConfig.axis.y2_axis_max != null) yMaxRight = vizConfig.axis.y2_axis_max;
        if (vizConfig.axis.y2_axis_min != null) yMinRight = vizConfig.axis.y2_axis_min;
      }

      // 2. Scan Data for missing bounds
      if (data.series) {
        data.series.forEach(s => {
          if (s.data && s.data.length > 0) {
            const isRight = s.y_axis_id === 'right';
            const yValues = s.data.map(d => d.y);
            const sMax = Math.max(...yValues);
            const sMin = Math.min(...yValues);

            if (isRight) {
              if (yMaxRight === -Infinity || !vizConfig?.axis?.enable_y2_axis_range) yMaxRight = Math.max(yMaxRight, sMax);
              if (yMinRight === Infinity || !vizConfig?.axis?.enable_y2_axis_range) yMinRight = Math.min(yMinRight, sMin);
            } else {
              if (yMaxLeft === -Infinity || !vizConfig?.axis?.enable_y_axis_range) yMaxLeft = Math.max(yMaxLeft, sMax);
              if (yMinLeft === Infinity || !vizConfig?.axis?.enable_y_axis_range) yMinLeft = Math.min(yMinLeft, sMin);
            }
          }
        });
      }

      // 3. Fallbacks
      if (yMaxLeft === -Infinity) yMaxLeft = 100;
      if (yMinLeft === Infinity) yMinLeft = 0;
      if (yMaxRight === -Infinity) yMaxRight = 10; // Default smaller for secondary
      if (yMinRight === Infinity) yMinRight = 0;

      // 4. Calculate Effectives
      const rangeLeft = Math.abs(yMaxLeft - yMinLeft) || 10;
      const effectiveYMaxLeft = yMaxLeft + rangeLeft * 0.5;
      const effectiveYMinLeft = yMinLeft - rangeLeft * 0.5;

      const rangeRight = Math.abs(yMaxRight - yMinRight) || 10;
      const effectiveYMaxRight = yMaxRight + rangeRight * 0.5;
      const effectiveYMinRight = yMinRight - rangeRight * 0.5;

      const thresholds = vizConfig?.limits?.thresholds;
      if (thresholds) {
        thresholds.forEach((threshold) => {
          const isRight = threshold.y_axis_id === 'right';
          const effMax = isRight ? effectiveYMaxRight : effectiveYMaxLeft;
          const effMin = isRight ? effectiveYMinRight : effectiveYMinLeft;

          if (threshold.show_shaded_area) {
            let y0 = threshold.value;
            let y1 = threshold.value;

            const range = isRight ? rangeRight : rangeLeft;
            const span = range || 10;

            if (threshold.shaded_area_direction === 'up') {
              y1 = Math.max(effMax, threshold.value) + span;
            } else {
              y0 = Math.min(effMin, threshold.value) - span;
            }

            shapes.push({
              type: 'rect',
              xref: 'paper',
              x0: 0,
              x1: 1,
              yref: isRight ? 'y2' : 'y',
              y0: y0,
              y1: y1,
              fillcolor: threshold.color || THEME_COLORS.danger,
              opacity: threshold.shaded_area_opacity || 0.1,
              line: { width: 0 },
              layer: 'below',
            });
          } else {
            // Add Line Shape if not shaded area (since we removed them from traces logic, or are they dual?)
            // Actually, previously we said limit lines are traces. 
            // NOTE: If they are traces, they appear in Legend. 
            // The shapes here are for SHADED AREAS.
          }
        });
      }

      // --- Storyline Events as Vertical Markers (Lines Only) ---
      // Markers are handled in traces now
      const isDateTimeXAxis = vizConfig?.axis?.x_axis === 'Index';
      if (isStorylineEnabled && isDateTimeXAxis && storylineEvents && storylineEvents.length > 0 && data.series?.length > 0) {
        // Get the x-axis date range from the first series with data
        const firstSeriesWithData = data.series.find(s => s.data && s.data.length > 0);
        if (firstSeriesWithData) {
          const xValues = firstSeriesWithData.data.map(d => d.x);
          const xDates = xValues
            .map(x => typeof x === 'string' ? new Date(x).getTime() : null)
            .filter((t): t is number => t !== null && !isNaN(t));

          if (xDates.length > 0) {
            const xMin = Math.min(...xDates);
            const xMax = Math.max(...xDates);

            // Default color for events without custom color
            const defaultEventColor = isDarkMode ? '#818cf8' : '#6366f1'; // Indigo

            // Track event number for labeling
            let eventNumber = 0;

            storylineEvents.forEach((event: StorylineEvent) => {
              const eventTime = new Date(event.date).getTime();

              // Only show events within the visible x-axis range (with small padding)
              const rangePadding = (xMax - xMin) * 0.02;
              if (eventTime >= xMin - rangePadding && eventTime <= xMax + rangePadding) {
                eventNumber++;
                const eventDateStr = new Date(event.date).toISOString();

                // Use custom color or default
                const eventColor = event.color || defaultEventColor;
                const eventColorWithAlpha = eventColor + '99'; // ~60% opacity for line

                // Vertical dashed line
                shapes.push({
                  type: 'line',
                  xref: 'x',
                  yref: 'paper', // Use paper coordinates for full height
                  x0: eventDateStr,
                  x1: eventDateStr,
                  y0: 0,
                  y1: 1,
                  line: {
                    color: eventColorWithAlpha,
                    width: 1.5,
                    dash: 'dot',
                  },
                  layer: 'below',
                });

                // Numbered marker annotation at top (positioned below title)
                annotations.push({
                  x: eventDateStr,
                  y: 1,
                  xref: 'x',
                  yref: 'paper',
                  text: `<b>${eventNumber}</b>`,
                  showarrow: false,
                  font: {
                    color: '#ffffff',
                    size: 11,
                  },
                  bgcolor: eventColor,
                  bordercolor: eventColor,
                  borderwidth: 1,
                  borderpad: 3,
                  xanchor: 'center',
                  yanchor: 'top',
                  hovertext: `${eventNumber}. ${event.title}\n${new Date(event.date).toLocaleDateString()}`,
                });
              }
            });
          }
        }
      }

      if ((data.annotations?.length ?? 0) > 0) {
        data.annotations!.forEach((ann) => {
          if (ann.type === 'arrow') {
            const varIndex = vizConfig?.axis?.y_axis?.indexOf(ann.label) ?? -1;
            const defaultColor = varIndex >= 0
              ? CHART_COLORS[varIndex % CHART_COLORS.length]
              : THEME_COLORS.danger;
            const arrowColor = vizConfig?.style?.custom_colors?.[ann.label] || defaultColor;

            shapes.push({
              type: 'line', x0: ann.x0, y0: ann.y0, x1: ann.x1, y1: ann.y1,
              line: { color: arrowColor, width: 3 },
            });

            annotations.push({
              x: ann.x1 * 1.3, y: ann.y1 * 1.3, text: ann.label || '',
              showarrow: false, font: { color: arrowColor, size: 12, weight: 'bold' },
              bgcolor: isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)',
              borderpad: 2,
            });
          }
        });
      }

      const gridColor = isDarkMode ? '#334155' : '#e2e8f0';
      const textColor = isDarkMode ? '#f1f5f9' : '#0f172a';
      const mutedText = isDarkMode ? '#94a3b8' : '#64748b';

      const yaxisConfig: Record<string, unknown> = {
        title: { text: vizConfig?.viz_type === 'correlation' ? undefined : (vizConfig?.axis?.y_label ?? data.y_label) },
        gridcolor: gridColor,
        tickfont: { color: mutedText },
        titlefont: { color: mutedText },
        automargin: true,
        // scaleanchor/ratio commented out as per previous state
      };

      // Apply Axis Scales (if not PCA/Corr/FFT — those have their own scale controls)
      if (!['pca', 'correlation', 'fft'].includes(vizConfig?.viz_type || '')) {
        if (vizConfig?.axis?.y_axis_scale && vizConfig.axis.y_axis_scale !== 'linear') {
          (yaxisConfig as any).type = vizConfig.axis.y_axis_scale;
        }
      }
      // FFT has its own scale settings stored on the fft config object
      if (vizConfig?.viz_type === 'fft') {
        if (vizConfig.fft?.y_axis_scale && vizConfig.fft.y_axis_scale !== 'linear') {
          (yaxisConfig as any).type = vizConfig.fft.y_axis_scale;
        }
      }

      if (vizConfig?.axis?.enable_y_axis_range) {
        const axis = vizConfig.axis;
        const isLog = (yaxisConfig as any).type === 'log';

        let min = axis?.y_axis_min;
        let max = axis?.y_axis_max;

        // Convert to log10 if log scale and values are valid > 0
        if (isLog) {
          if (min != null) min = min > 0 ? Math.log10(min) : undefined;
          if (max != null) max = max > 0 ? Math.log10(max) : undefined;
        }

        if (min != null && max != null) {
          yaxisConfig.range = [min, max];
        } else if (min != null) {
          yaxisConfig.range = [min, null];
          yaxisConfig.autorange = false;
        } else if (max != null) {
          yaxisConfig.range = [null, max];
          yaxisConfig.autorange = false;
        }
      }

      const yaxis2Config: Record<string, unknown> = hasRightAxis ? {
        title: { text: vizConfig?.axis?.y2_label ?? "Secondary Axis", font: { color: mutedText } },
        overlaying: 'y',
        side: 'right',
        gridcolor: 'transparent',
        tickfont: { color: mutedText },
        titlefont: { color: mutedText },
        automargin: true,
        showgrid: false,
      } : {}; // Empty object if unused, will be filtered out

      if (hasRightAxis && vizConfig?.axis?.enable_y2_axis_range) {
        const axis = vizConfig.axis;
        if (axis.y2_axis_min != null && axis.y2_axis_max != null) {
          yaxis2Config.range = [axis.y2_axis_min, axis.y2_axis_max];
        } else if (axis.y2_axis_min != null) {
          yaxis2Config.range = [axis.y2_axis_min, null];
          yaxis2Config.autorange = false;
        } else if (axis.y2_axis_max != null) {
          yaxis2Config.range = [null, axis.y2_axis_max];
          yaxis2Config.autorange = false;
        }
      }

      // PCA correlation circle special handling
      const isPCA = vizConfig?.viz_type === 'pca';
      if (isPCA) {
        // Add white circle shape (filled) for correlation circle interior
        shapes.push({
          type: 'circle',
          xref: 'x',
          yref: 'y',
          x0: -1,
          y0: -1,
          x1: 1,
          y1: 1,
          fillcolor: isDarkMode ? '#1e293b' : 'white',
          line: { color: isDarkMode ? '#475569' : '#888888', width: 2 },
          layer: 'below',
        });
      }

      const finalLayout: Partial<Layout> = {
        title: {
          text: vizConfig?.title ?? data.title,
          font: { size: 16, color: textColor },
        },
        xaxis: {
          title: {
            text: vizConfig?.viz_type === 'correlation' ? undefined : (vizConfig?.axis?.x_label ?? data.x_label),
            font: { color: mutedText },
          },
          gridcolor: gridColor,
          tickfont: { color: mutedText },
          showticklabels: !data.series?.some(s => s.type === 'box'),
          // PCA: center at 0 with range [-1.3, 1.3] for padding
          ...(isPCA ? { range: [-1.3, 1.3], zeroline: true, zerolinecolor: gridColor, scaleanchor: 'y', scaleratio: 1 } : {}),
          // Manual X-Range (override PCA/auto if set, though confusing for PCA)
          ...((!isPCA && vizConfig?.axis?.enable_x_axis_range && (vizConfig.axis.x_axis_min != null || vizConfig.axis.x_axis_max != null)) ? {
            range: [vizConfig.axis.x_axis_min ?? null, vizConfig.axis.x_axis_max ?? null],
            autorange: false
          } : {}),
          // Apply X Scale - ONLY if not Index (Date) to avoid breaking date axes with 'linear' type
          ...(!['pca', 'correlation', 'fft'].includes(vizConfig?.viz_type || '') && vizConfig?.axis?.x_axis_scale && vizConfig.axis.x_axis !== 'Index' ? { type: vizConfig.axis.x_axis_scale as any } : {}),
          // FFT has its own x-axis scale setting (frequency axis is always numeric, never date)
          ...(vizConfig?.viz_type === 'fft' && vizConfig.fft?.x_axis_scale && vizConfig.fft.x_axis_scale !== 'linear' ? { type: vizConfig.fft.x_axis_scale as any } : {}),
        },
        yaxis: {
          ...yaxisConfig,
          // PCA: center at 0 with range [-1.3, 1.3] for padding
          ...(isPCA ? { range: [-1.3, 1.3], zeroline: true, zerolinecolor: gridColor } : {}),
          // Ensure autorange is set to true if no range is specified, needed for log toggle to work smoothly
          ...(!isPCA && !vizConfig?.axis?.enable_y_axis_range ? { autorange: true } : {})
        },
        ...(yaxis2Config ? { yaxis2: yaxis2Config } : {}), // Only add if defined

        // PCA: grey background
        plot_bgcolor: isPCA ? (isDarkMode ? '#334155' : '#e2e8f0') : 'transparent',
        paper_bgcolor: 'transparent',
        font: { color: textColor },
        legend: {
          bgcolor: 'transparent',
          font: { color: mutedText },
          orientation: 'h' as const,
          y: -0.25,
          x: 0.5,
          xanchor: 'center' as const,
          yanchor: 'top' as const,
        },
        margin: {
          t: 50,
          r: hasRightAxis ? 60 : 20,
          b: vizConfig?.viz_type === 'correlation' ? 100 : 100,
          l: vizConfig?.viz_type === 'correlation' ? 150 : 60,
        },
        shapes,
        annotations,
        hovermode: 'closest' as const,
        height: height, // Explicitly set height to prevent 0-height blank plots
        autosize: true,
      };

      // Filter out any undefined keys just in case (shallow)
      Object.keys(finalLayout).forEach(key => (finalLayout as any)[key] === undefined && delete (finalLayout as any)[key]);

      return finalLayout;
    } catch (err) {
      console.error("Layout calculation failed:", err);
      return { title: { text: "Layout Error" } };
    }
  }, [data, isDarkMode, vizConfig, storylineEvents, isStorylineEnabled, height]);

  // Plotly config (Memoized)
  const plotlyConfig: Partial<Config> = useMemo(() => ({
    displayModeBar: 'hover',
    displaylogo: false,
    responsive: true,
    toImageButtonOptions: {
      format: 'svg',
      filename: data?.title ? data.title.toLowerCase().replace(/\s+/g, '_') : 'plot_export'
    },
    modeBarButtons: [[
      'zoom2d', 'pan2d', 'resetScale2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d', 'toggleHover', 'toImage',
    ]],
  }), [data?.title]);

  // Handle container resize
  React.useEffect(() => {
    if (!containerRef.current) return;

    let resizeFrame: number;

    const resizeObserver = new ResizeObserver(() => {
      // Defer resize if sidebar is transitioning to prevent jank
      if (useStore.getState().isSidebarTransitioning) return;

      // Throttle resize events with requestAnimationFrame to prevent
      // "ResizeObserver loop limit exceeded" and "Maximum update depth" errors
      if (resizeFrame) cancelAnimationFrame(resizeFrame);

      resizeFrame = requestAnimationFrame(() => {
        setRevision(prev => prev + 1);
      });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
    };
  }, []);

  // Force update when sidebar transition ends (snap to final size)
  const isSidebarTransitioning = useStore((state) => state.isSidebarTransitioning);
  React.useEffect(() => {
    if (!isSidebarTransitioning) {
      // Force a resize update when transition ends
      setRevision(prev => prev + 1);
      // Trigger a window resize event to ensure other listeners catch up
      window.dispatchEvent(new Event('resize'));
    }
  }, [isSidebarTransitioning]);

  // --- Render Conditionals ---
  // Hooks must be before these

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <Loading size="lg" />
      </div>
    );
  }

  const hasData = data && (data.series.length > 0 || (data.annotations && (data.annotations?.length ?? 0) > 0) || !!data.correlation_matrix || !!data.root_cause_analysis);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center text-gray-500 dark:text-gray-400" style={{ height }}>
        No data to display. Select Y-axis variables.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      {/* Wrapper without forced aspect ratio */}
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <React.Suspense fallback={<div className="flex items-center justify-center" style={{ height: '100%' }}><Loading size="lg" /></div>}>
          <Plot
            ref={plotRef}
            key={`${vizConfig?.viz_type}-${vizConfig?.axis?.x_axis_scale}-${vizConfig?.axis?.y_axis_scale}-${vizConfig?.fft?.x_axis_scale}-${vizConfig?.fft?.y_axis_scale}`}
            data={plotlyData}
            layout={{
              ...layout,
            }}
            config={plotlyConfig}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler={true}
            revision={revision}
          />
        </React.Suspense>
      </div>
    </div>
  );
};

// Memoize to prevent re-renders when parent re-renders with same props
export const InteractivePlot = React.memo(InteractivePlotComponent);
