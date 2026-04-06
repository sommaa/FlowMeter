/**
 * Series list section for managing y-axis variables in visualizations.
 *
 * This component provides an interface for:
 * - Adding variables to the plot as data series
 * - Configuring individual series properties (chart type, axis, color, regression)
 * - Managing custom legend labels for each series
 * - Removing series from the plot
 * - Enabling area stacking for area charts
 *
 * Each series is rendered as a SeriesCard with collapsible controls for detailed configuration.
 * The component adapts its behavior based on visualization type - for example, regression
 * plots are limited to a single series (the target variable).
 *
 * @module components/visualizations/sections/SeriesList
 */

import React from 'react';
import { SearchableSelect, Checkbox } from '@/components/common';
import { VisualizationConfig } from '@/types';
import { SeriesCard } from '../controls/SeriesCard';
import { CHART_COLORS } from '@/lib/constants';

const COLORS = CHART_COLORS;

/**
 * Props for the SeriesList component.
 *
 * @interface SeriesListProps
 * @property {VisualizationConfig} config - Current visualization configuration
 * @property {string[]} numericColumns - Available numeric column names
 * @property {(updates: Partial<VisualizationConfig>) => void} onUpdate - Callback for config updates
 */
interface SeriesListProps {
    config: VisualizationConfig;
    numericColumns: string[];
    onUpdate: (updates: Partial<VisualizationConfig>) => void;
}

/**
 * Series list component for y-axis variable management.
 *
 * Renders a searchable dropdown for adding variables and a list of SeriesCard components
 * for each selected variable. The component is hidden for visualization types that don't
 * use traditional series (formula, root_cause).
 *
 * Features:
 * - **Add Series**: Searchable dropdown showing available variables (excludes already-added)
 * - **Series Cards**: Individual configuration for each series
 *   - Chart type (line, scatter, bar, area, step, line+scatter)
 *   - Y-axis assignment (left or right)
 *   - Per-series regression toggle
 *   - Custom legend label
 *   - Color picker
 *   - Delete button
 * - **Empty State**: Friendly message when no series selected
 * - **Stack Toggle**: Checkbox for area chart stacking (area type only)
 *
 * Regression Mode Behavior:
 * When viz_type is 'regression', only one series is allowed. Adding a new variable
 * replaces the current selection rather than appending to the list. This ensures
 * the regression analysis has a single, unambiguous target variable.
 *
 * Color Management:
 * - Default colors cycle through CHART_COLORS palette
 * - Custom colors stored in config.style.custom_colors
 * - Color changes sync to both series_configs and custom_colors
 * - Colors persist when reordering or modifying series
 *
 * Legend Labels:
 * - Default to column names if not customized
 * - Stored in config.legend.labels array (index-aligned with y_axis)
 * - Empty strings indicate no custom label (use default)
 * - Labels auto-populate array on change (fills gaps with empty strings)
 *
 * Series Configuration:
 * - Stored in config.series_configs object keyed by column name
 * - Default config used if none exists (line chart, left axis, no regression)
 * - Updates merge with existing config (preserves unchanged fields)
 *
 * @param {SeriesListProps} props - Component props
 * @returns {JSX.Element | null} Series management UI or null if visualization type doesn't support series
 *
 * @example
 * ```tsx
 * <SeriesList
 *   config={{
 *     viz_type: 'universal',
 *     axis: { y_axis: ['Temperature', 'Pressure'] },
 *     series_configs: {
 *       Temperature: { type: 'line', y_axis_id: 'left', show_regression: false },
 *       Pressure: { type: 'scatter', y_axis_id: 'right', show_regression: true }
 *     },
 *     legend: { labels: ['Temp (°C)', 'Press (bar)'] },
 *     style: { custom_colors: { Temperature: '#ff6b6b' } }
 *   }}
 *   numericColumns={['Temperature', 'Pressure', 'Flow', 'Level']}
 *   onUpdate={(updates) => updateConfig(updates)}
 * />
 * ```
 */
export const SeriesList: React.FC<SeriesListProps> = ({ config, numericColumns, onUpdate }) => {
    // Only show for types that support series list
    // 'formula' has its own dedicated section.
    const showSeriesList = !['formula', 'root_cause'].includes(config.viz_type);

    if (!showSeriesList) return null;

    return (
        <>
            <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">
                    Add Series
                </h4>
                <SearchableSelect
                    label=""
                    options={numericColumns
                        .filter(col => !config.axis.y_axis.includes(col))
                        .map((col) => ({
                            value: col,
                            label: col,
                        }))}
                    value=""
                    onChange={(e) => {
                        if (e.target.value) {
                            const isRegression = config.viz_type === 'regression';
                            onUpdate({
                                axis: {
                                    ...config.axis,
                                    y_axis: isRegression
                                        ? [e.target.value]
                                        : [...config.axis.y_axis, e.target.value]
                                }
                            });
                        }
                    }}
                    placeholder={config.viz_type === 'regression' ? "Select target variable..." : "Select variable to add..."}
                />
            </div>

            <div className="space-y-4 mt-4">
                {config.axis.y_axis.map((col, index) => {
                    const seriesConfig = config.series_configs?.[col] || {
                        type: 'line',
                        y_axis_id: 'left',
                        show_regression: false,
                        color: COLORS[index % COLORS.length]
                    };

                    return (
                        <SeriesCard
                            key={col}
                            title={col}
                            legendLabel={config.legend.labels?.[index] || ''}
                            seriesConfig={seriesConfig}
                            vizType={config.viz_type}
                            index={index}
                            color={config.style.custom_colors?.[col] || seriesConfig.color || COLORS[index % COLORS.length]}
                            onUpdateSeries={(updates) => {
                                const newConfigs = {
                                    ...config.series_configs,
                                    [col]: { ...seriesConfig, ...updates }
                                };
                                onUpdate({ series_configs: newConfigs });
                            }}
                            onUpdateLegend={(value) => {
                                const newLabels = [...(config.legend.labels || [])];
                                while (newLabels.length <= index) newLabels.push('');
                                newLabels[index] = value;
                                onUpdate({ legend: { ...config.legend, labels: newLabels } });
                            }}
                            onUpdateColor={(value) => {
                                const newCustomColors = { ...config.style.custom_colors, [col]: value };
                                const newConfigs = {
                                    ...config.series_configs,
                                    [col]: { ...seriesConfig, color: value }
                                };
                                onUpdate({
                                    style: { ...config.style, custom_colors: newCustomColors },
                                    series_configs: newConfigs
                                });
                            }}
                            onDelete={() => {
                                const newY = config.axis.y_axis.filter(c => c !== col);
                                onUpdate({ axis: { ...config.axis, y_axis: newY } });
                            }}
                        />
                    );
                })}
            </div>

            {config.axis.y_axis.length === 0 && (
                <div className="text-center p-4 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                    No series selected. Add a variable to plot.
                </div>
            )}

            {/* Stack Areas toggle - show for Area Chart */}
            {(config.viz_type === 'area') && (
                <label className="flex items-center gap-2 cursor-pointer group p-3 mt-3 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
                    <Checkbox
                        checked={config.style.enable_stacking}
                        onChange={(e) => onUpdate({ style: { ...config.style, enable_stacking: e.target.checked } })}
                        className="border-input w-4 h-4"
                    />
                    <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Stack Areas</span>
                </label>
            )}
        </>
    );
};
