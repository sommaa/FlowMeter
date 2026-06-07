/**
 * Root cause analysis visualization component.
 *
 * This component renders interactive visualizations for root cause analysis results,
 * helping users identify which variables are most likely causing changes in a target
 * variable. The analysis combines multiple statistical methods:
 *
 * - **Pearson Correlation**: Measures linear relationships
 * - **Cross-Correlation**: Finds optimal lag/lead relationships
 * - **Mutual Information**: Captures non-linear dependencies
 * - **Granger Causality**: Tests if one variable helps predict another
 *
 * Three visualization modes are supported:
 * 1. **Ranking**: Horizontal bar chart showing composite scores for each variable
 * 2. **Correlation vs Lag**: Scatter plot showing correlation strength vs time lag
 * 3. **Method Breakdown**: Grouped bar chart comparing individual method contributions
 *
 * Features:
 * - Color-coded Granger causality results (Cause, Effect, Feedback, Not significant)
 * - Interactive hover tooltips with detailed statistics
 * - Responsive resizing with ResizeObserver
 * - Theme-aware colors (light/dark mode)
 * - Synchronized resize behavior with sidebar transitions
 *
 * The resize pattern matches InteractivePlot for consistent behavior across charts.
 *
 * @module components/visualizations/RootCauseAnalysis
 */

import React, { useMemo } from 'react';
const Plot = React.lazy(() => import('react-plotly.js'));
import { PlotDataResponse, VisualizationConfig } from '@/types';
import { useStore } from '@/store';
import { Loading } from '@/components/common';
import { Data, Layout, Config } from 'plotly.js';

/**
 * Props for the RootCauseAnalysis component.
 *
 * @interface RootCauseAnalysisProps
 * @property {PlotDataResponse} data - Plot data containing root cause analysis results
 * @property {VisualizationConfig} [config] - Visualization configuration (optional)
 * @property {number} [height] - Chart height in pixels (default: 500)
 */
interface RootCauseAnalysisProps {
    data: PlotDataResponse;
    config?: VisualizationConfig;
    height?: number;
}

/**
 * Color mapping for Granger causality types.
 *
 * - **CAUSE**: Green - Variable causes changes in target
 * - **EFFECT**: Red - Variable is affected by target
 * - **FEEDBACK**: Orange - Bidirectional causality
 * - **NONE/n/a**: Gray - No significant causal relationship
 *
 * @constant {Record<string, string>}
 */
const GRANGER_COLORS: Record<string, string> = {
    CAUSE: '#22c55e',
    EFFECT: '#ef4444',
    FEEDBACK: '#f59e0b',
    NONE: '#6b7280',
    'n/a': '#6b7280',
};

/**
 * Human-readable labels for Granger causality types.
 *
 * Maps internal causality type codes to display-friendly labels.
 *
 * @constant {Record<string, string>}
 */
const GRANGER_LABELS: Record<string, string> = {
    CAUSE: 'Cause',
    EFFECT: 'Effect',
    FEEDBACK: 'Feedback',
    NONE: 'Not significant',
    'n/a': 'Not significant',
};

/**
 * Root cause analysis visualization component.
 *
 * Renders one of three chart types based on configuration:
 *
 * **Ranking Mode** (default):
 * - Horizontal bar chart sorted by composite score
 * - Bars colored by Granger causality type
 * - Hover shows detailed statistics (score, pearson, lag, MI, granger)
 * - Legend displays causality type meanings
 *
 * **Correlation vs Lag Mode**:
 * - Scatter plot: X-axis = lag in samples, Y-axis = |Pearson correlation|
 * - Point size proportional to composite score
 * - Points grouped and colored by Granger causality type
 * - Shows which variables lead/lag the target and by how much
 *
 * **Method Breakdown Mode**:
 * - Grouped bar chart comparing top 10 variables
 * - Separate bars for Pearson, Cross-Correlation, Mutual Information
 * - Allows comparison of individual method contributions
 * - Helps identify which analysis method is most informative
 *
 * Composite Score Calculation:
 * The backend combines multiple methods into a single score:
 * - Pearson correlation (absolute value)
 * - Cross-correlation at optimal lag
 * - Normalized mutual information
 * - Weights can be adjusted in backend configuration
 *
 * Granger Causality Interpretation:
 * - Tests if past values of X help predict future values of Y
 * - "CAUSE" means X → Y (X helps predict target)
 * - "EFFECT" means Y → X (target helps predict X)
 * - "FEEDBACK" means both X → Y and Y → X
 * - "NONE" means neither direction is significant
 *
 * Performance:
 * - Lazy-loads Plotly library
 * - Memoizes chart data and layout calculations
 * - Uses ResizeObserver with requestAnimationFrame throttling
 * - Skips resize during sidebar transitions to prevent jank
 *
 * @param {RootCauseAnalysisProps} props - Component props
 * @returns {JSX.Element | null} Plotly chart or null if no data
 *
 * @example
 * ```tsx
 * <RootCauseAnalysis
 *   data={{
 *     root_cause_analysis: {
 *       target_variable: 'Temperature',
 *       ranking: [
 *         { variable: 'Pressure', score: 85.2, pearson: 0.89, lag_samples: 5, granger_type: 'CAUSE' },
 *         { variable: 'Flow', score: 62.3, pearson: -0.71, lag_samples: 0, granger_type: 'FEEDBACK' }
 *       ]
 *     }
 *   }}
 *   config={{ root_cause: { result_plot: 'ranking' } }}
 *   height={500}
 * />
 * ```
 */
export const RootCauseAnalysis: React.FC<RootCauseAnalysisProps> = ({
    data,
    config: vizConfig,
    height = 500,
}) => {
    const isDarkMode = useStore((state) => state.isDarkMode);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const plotRef = React.useRef<any>(null);
    const [revision, setRevision] = React.useState(0);

    // Derive view data up front. The early return that depends on it lives below
    // all the hooks so that hooks always run in the same order (rules-of-hooks).
    const rca = data.root_cause_analysis;
    const ranking = rca?.ranking || [];

    const resultPlot = vizConfig?.root_cause?.result_plot || 'ranking';

    const textColor = isDarkMode ? '#f1f5f9' : '#0f172a';
    const mutedText = isDarkMode ? '#94a3b8' : '#64748b';
    const gridColor = isDarkMode ? '#334155' : '#e2e8f0';

    const plotlyConfig: Partial<Config> = useMemo(() => ({
        displayModeBar: false,
        responsive: true,
    }), []);

    // ───────────────────── Chart builders ─────────────────────

    // 1. RANKING — horizontal bar chart of composite scores
    const buildRankingChart = useMemo((): { data: Data[]; layout: Partial<Layout> } => {
        const items = [...ranking].reverse();
        return {
            data: [{
                type: 'bar',
                orientation: 'h',
                y: items.map(r => r.variable),
                x: items.map(r => r.score),
                marker: {
                    color: items.map(r => GRANGER_COLORS[r.granger_type || 'n/a'] || GRANGER_COLORS['n/a']),
                    line: { width: 0 },
                },
                text: items.map(r => r.score.toFixed(1)),
                textposition: 'outside',
                textfont: { color: mutedText, size: 10 },
                hovertext: items.map(r => {
                    const lines = [`<b>${r.variable}</b>`, `Score: ${r.score.toFixed(1)}`];
                    if (r.pearson !== undefined) lines.push(`Pearson: ${r.pearson.toFixed(3)}`);
                    if (r.lag_samples !== undefined) lines.push(`Lag: ${r.lag_samples}${r.is_leader ? ' (leads ▲)' : ''}`);
                    if (r.mutual_info_norm !== undefined) lines.push(`MI (norm): ${r.mutual_info_norm.toFixed(3)}`);
                    const gt = r.granger_type || 'n/a';
                    if (gt !== 'n/a') lines.push(`Granger: ${gt}`);
                    return lines.join('<br>');
                }),
                hoverinfo: 'text',
            } as Data],
            layout: {
                margin: { l: 10, r: 50, t: 28, b: 30 },
                title: { text: `Root Cause → ${rca?.target_variable}`, font: { size: 12, color: mutedText }, x: 0.01, xanchor: 'left' },
                xaxis: {
                    title: { text: 'Score', font: { color: mutedText, size: 10 } },
                    gridcolor: gridColor,
                    tickfont: { color: mutedText, size: 9 },
                    zeroline: false,
                },
                yaxis: { tickfont: { color: textColor, size: 10 }, automargin: true },
                bargap: 0.25,
            },
        };
    }, [ranking, mutedText, textColor, gridColor, rca?.target_variable]);

    // 2. CORRELATION vs LAG — scatter plot
    const buildCorrelationLagChart = useMemo((): { data: Data[]; layout: Partial<Layout> } => {
        // Group by Granger type for separate traces (legend)
        const groups: Record<string, typeof ranking> = {};
        for (const r of ranking) {
            const gt = r.granger_type || 'n/a';
            if (!groups[gt]) groups[gt] = [];
            groups[gt].push(r);
        }

        const traces: Data[] = Object.entries(groups).map(([gt, items]) => ({
            type: 'scatter' as const,
            mode: 'markers' as const,
            name: GRANGER_LABELS[gt] || gt,
            x: items.map(r => r.lag_samples ?? 0),
            y: items.map(r => Math.abs(r.pearson ?? 0)),
            marker: {
                color: GRANGER_COLORS[gt] || GRANGER_COLORS['n/a'],
                size: items.map(r => Math.max(8, Math.min(30, r.score * 0.6))),
                opacity: 0.85,
                line: { width: 1, color: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' },
            },
            hovertext: items.map(r => {
                const lines = [`<b>${r.variable}</b>`, `Score: ${r.score.toFixed(1)}`];
                lines.push(`|Pearson|: ${Math.abs(r.pearson ?? 0).toFixed(3)}`);
                lines.push(`Lag: ${r.lag_samples ?? 0}${r.is_leader ? ' (leads ▲)' : ''}`);
                if (r.mutual_info_norm !== undefined) lines.push(`MI: ${r.mutual_info_norm.toFixed(3)}`);
                lines.push(`Granger: ${gt}`);
                return lines.join('<br>');
            }),
            hoverinfo: 'text',
        } as Data));

        return {
            data: traces,
            layout: {
                margin: { l: 55, r: 20, t: 28, b: 50 },
                title: { text: `Correlation vs Lag → ${rca?.target_variable}`, font: { size: 12, color: mutedText }, x: 0.01, xanchor: 'left' },
                xaxis: {
                    title: { text: 'Lag (samples)', font: { color: mutedText, size: 11 } },
                    gridcolor: gridColor,
                    tickfont: { color: mutedText },
                    zeroline: true,
                    zerolinecolor: gridColor,
                },
                yaxis: {
                    title: { text: '|Pearson|', font: { color: mutedText, size: 11 } },
                    gridcolor: gridColor,
                    tickfont: { color: mutedText },
                    range: [0, 1.05],
                },
                legend: {
                    bgcolor: 'transparent',
                    font: { color: mutedText, size: 10 },
                    orientation: 'h' as const,
                    y: -0.2,
                    x: 0.5,
                    xanchor: 'center' as const,
                },
                hovermode: 'closest' as const,
            },
        };
    }, [ranking, mutedText, textColor, gridColor, rca?.target_variable, isDarkMode]);

    // 3. METHOD BREAKDOWN — grouped bar showing per-method contributions
    const buildMethodBreakdown = useMemo((): { data: Data[]; layout: Partial<Layout> } => {
        const topN = ranking.slice(0, 10);
        const variables = topN.map(r => r.variable);

        const methods: { key: string; label: string; color: string }[] = [
            { key: 'pearson_abs', label: 'Pearson |r|', color: '#6366f1' },
            { key: 'xcorr_abs', label: 'Cross-Corr', color: '#06b6d4' },
            { key: 'mutual_info_norm', label: 'Mutual Info', color: '#f59e0b' },
        ];

        const traces: Data[] = methods.map(m => ({
            type: 'bar',
            name: m.label,
            x: variables,
            y: topN.map(r => {
                const val = (r as any)[m.key];
                return val !== undefined ? val : 0;
            }),
            marker: { color: m.color },
            hovertext: topN.map(r => {
                const val = (r as any)[m.key];
                return `<b>${r.variable}</b><br>${m.label}: ${val !== undefined ? val.toFixed(3) : 'n/a'}<br>Score: ${r.score.toFixed(1)}`;
            }),
            hoverinfo: 'text',
        } as Data));

        return {
            data: traces,
            layout: {
                margin: { l: 50, r: 20, t: 28, b: 80 },
                title: { text: `Method Breakdown → ${rca?.target_variable}`, font: { size: 12, color: mutedText }, x: 0.01, xanchor: 'left' },
                barmode: 'group',
                xaxis: {
                    tickfont: { color: mutedText, size: 9 },
                    tickangle: -35,
                },
                yaxis: {
                    title: { text: 'Normalized Value', font: { color: mutedText, size: 11 } },
                    gridcolor: gridColor,
                    tickfont: { color: mutedText },
                },
                legend: {
                    bgcolor: 'transparent',
                    font: { color: mutedText, size: 10 },
                    orientation: 'h' as const,
                    y: -0.35,
                    x: 0.5,
                    xanchor: 'center' as const,
                },
            },
        };
    }, [ranking, mutedText, gridColor, rca?.target_variable]);

    // ───────────────────── Select active chart ─────────────────────

    const activeChart = useMemo(() => {
        switch (resultPlot) {
            case 'correlation_lag': return buildCorrelationLagChart;
            case 'method_breakdown': return buildMethodBreakdown;
            default: return buildRankingChart;
        }
    }, [resultPlot, buildRankingChart, buildCorrelationLagChart, buildMethodBreakdown]);

    const chartLayout: Partial<Layout> = useMemo(() => ({
        ...activeChart.layout,
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: textColor, size: 11 },
        autosize: true,
    }), [activeChart.layout, textColor]);

    // ───────────────────── Resize handling ─────────────────────

    React.useEffect(() => {
        if (!containerRef.current) return;
        let resizeFrame: number;
        const resizeObserver = new ResizeObserver(() => {
            if (useStore.getState().isSidebarTransitioning) return;
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

    const isSidebarTransitioning = useStore((state) => state.isSidebarTransitioning);
    React.useEffect(() => {
        if (!isSidebarTransitioning) {
            setRevision(prev => prev + 1);
            window.dispatchEvent(new Event('resize'));
        }
    }, [isSidebarTransitioning]);

    // All hooks above run unconditionally; bail out here now that they're registered.
    if (!rca || ranking.length === 0) return null;

    // ───────────────────── Legend (only for ranking mode) ─────────────────────

    const showGrangerLegend = resultPlot === 'ranking';

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height,
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <div style={{ width: '100%', height: '100%', position: 'relative', flex: 1 }}>
                <React.Suspense fallback={<div className="flex items-center justify-center" style={{ height: '100%' }}><Loading size="lg" /></div>}>
                    <Plot
                        ref={plotRef}
                        data={activeChart.data}
                        layout={chartLayout}
                        config={plotlyConfig}
                        style={{ width: '100%', height: '100%' }}
                        useResizeHandler={true}
                        revision={revision}
                    />
                </React.Suspense>
            </div>
            {showGrangerLegend && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 14,
                    padding: '4px 0 2px',
                    fontSize: 10,
                    color: mutedText,
                    flexShrink: 0,
                }}>
                    {[
                        { color: '#22c55e', label: 'Cause' },
                        { color: '#f59e0b', label: 'Feedback' },
                        { color: '#ef4444', label: 'Effect' },
                        { color: '#6b7280', label: 'Not significant' },
                    ].map(item => (
                        <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{
                                width: 8,
                                height: 8,
                                borderRadius: 2,
                                background: item.color,
                                display: 'inline-block',
                            }} />
                            {item.label}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};
