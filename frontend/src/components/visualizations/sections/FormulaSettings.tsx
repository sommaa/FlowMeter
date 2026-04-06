/**
 * Formula settings section for custom formula configuration.
 *
 * This component provides controls for formula-based visualizations where users
 * can define custom calculated columns using Python expressions. It includes:
 * - Formula editor preview with click-to-edit functionality
 * - Automatic detection of result variables from formula
 * - Per-result configuration (chart type, axis, color, regression)
 * - Legend label customization for each result
 *
 * The component parses the formula to detect result variables (result, result1, result2, etc.)
 * and dynamically generates configuration cards for each one. Users can configure how
 * each result is displayed independently.
 *
 * @module components/visualizations/sections/FormulaSettings
 */

import React, { useMemo } from 'react';
import { VisualizationConfig } from '@/types';
import { SeriesCard } from '../controls/SeriesCard';
import { CHART_COLORS } from '@/lib/constants';
import { Maximize2 } from 'lucide-react';

const COLORS = CHART_COLORS;

/**
 * Props for the FormulaSettings component.
 *
 * @interface FormulaSettingsProps
 * @property {VisualizationConfig} config - Current visualization configuration
 * @property {(updates: Partial<VisualizationConfig>) => void} onUpdate - Callback for config updates
 * @property {() => void} onOpenFormula - Callback to open formula editor modal
 */
interface FormulaSettingsProps {
    config: VisualizationConfig;
    onUpdate: (updates: Partial<VisualizationConfig>) => void;
    onOpenFormula: () => void;
}

/**
 * Formula settings component for custom formula visualization configuration.
 *
 * Renders only when viz_type is 'formula'. Provides an interface for:
 *
 * **Formula Editor**:
 * - Click-to-edit preview panel showing current formula
 * - Truncated display (3 lines max) with full formula in modal
 * - Visual hover effect indicating editability
 * - Opens FormulaEditorModal on click
 *
 * **Result Detection**:
 * - Automatically parses formula to find result variables
 * - Regex pattern: `/\b(result\d*)\s*=/g` matches:
 *   - result = ...
 *   - result1 = ...
 *   - result2 = ...
 *   - etc.
 * - Falls back to ['result'] if no matches found
 * - Sorts and deduplicates detected results
 *
 * **Per-Result Configuration**:
 * - Each result gets its own SeriesCard
 * - Configurable properties:
 *   - Chart type (line, scatter, bar, area, step, line+scatter)
 *   - Y-axis assignment (left or right)
 *   - Per-result regression toggle
 *   - Custom color
 *   - Custom legend label
 * - Configuration stored in config.formula.result_configs
 * - Default: line chart on left axis
 *
 * **Color Management**:
 * - Colors cycle through CHART_COLORS palette
 * - Custom colors stored in config.style.custom_colors
 * - Syncs between result_configs and custom_colors on change
 *
 * **Legend Labels**:
 * - Default to result variable names if not customized
 * - Stored in config.legend.labels (index-aligned)
 * - Auto-populates array on change (fills gaps with empty strings)
 *
 * **No Delete Function**:
 * - Result variables cannot be deleted from UI
 * - They are derived from formula input
 * - To remove a result, user must edit the formula itself
 *
 * Formula Syntax:
 * ```python
 * # Single result
 * result = col['Temperature'] * 1.8 + 32
 *
 * # Multiple results
 * result1 = col['Flow'] * col['Pressure']
 * result2 = col['Temperature'] - col['SetPoint']
 * ```
 *
 * @param {FormulaSettingsProps} props - Component props
 * @returns {JSX.Element | null} Formula configuration UI or null if not formula type
 *
 * @example
 * ```tsx
 * <FormulaSettings
 *   config={{
 *     viz_type: 'formula',
 *     formula: {
 *       input: "result1 = col['Temp'] * 1.8 + 32\nresult2 = col['Pressure'] * 0.1",
 *       result_configs: {
 *         result1: { type: 'line', y_axis_id: 'left', show_regression: false },
 *         result2: { type: 'scatter', y_axis_id: 'right', show_regression: true }
 *       }
 *     },
 *     legend: { labels: ['Temperature (°F)', 'Pressure (bar)'] },
 *     style: { custom_colors: { result1: '#ff6b6b' } }
 *   }}
 *   onUpdate={(updates) => updateConfig(updates)}
 *   onOpenFormula={() => setFormulaModalOpen(true)}
 * />
 * ```
 */
export const FormulaSettings: React.FC<FormulaSettingsProps> = ({ config, onUpdate, onOpenFormula }) => {
    // Detect formula result variables
    const formulaResultKeys = useMemo(() => {
        if (!config.formula.input) return ['result'];
        const matches = config.formula.input.match(/\b(result\d*)\s*=/g);

        if (!matches || matches.length === 0) return ['result'];

        const keys = matches.map(m => m.split('=')[0].trim());
        const uniqueKeys = Array.from(new Set(keys)).sort();

        return uniqueKeys;
    }, [config.formula.input]);

    if (config.viz_type !== 'formula') return null;

    return (
        <>
            {/* Formula preview - click to edit */}
            <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300">
                    Formula
                </label>
                <button
                    type="button"
                    onClick={onOpenFormula}
                    className="w-full text-left p-3 bg-muted/50 dark:bg-muted/30 border border-border rounded-lg hover:border-muted-foreground/30 transition-colors group"
                >
                    {config.formula.input ? (
                        <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3 overflow-hidden">
                            {config.formula.input}
                        </pre>
                    ) : (
                        <div className="text-xs text-muted-foreground text-center">
                            Click to edit formula
                        </div>
                    )}
                    <div className="flex items-center gap-1 mt-2 text-xs text-primary/80 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Maximize2 className="w-3 h-3" />
                        <span>Click to edit</span>
                    </div>
                </button>
            </div>

            {/* Formula Results - Per-Result Configuration */}
            <div className="space-y-4 mt-4">
                {formulaResultKeys.map((key, index) => {
                    const resultConfig = config.formula.result_configs?.[key] || {
                        type: 'line' as const,
                        y_axis_id: 'left' as const,
                        show_regression: false,
                        remove_outliers: false,
                        color: COLORS[index % COLORS.length]
                    };

                    return (
                        <SeriesCard
                            key={key}
                            title={key}
                            legendLabel={config.legend.labels?.[index] || ''}
                            seriesConfig={resultConfig}
                            vizType={config.viz_type}
                            index={index}
                            color={config.style.custom_colors?.[key] || resultConfig.color || COLORS[index % COLORS.length]}
                            onUpdateSeries={(updates) => {
                                const newConfigs = {
                                    ...config.formula.result_configs,
                                    [key]: { ...resultConfig, ...updates }
                                };
                                onUpdate({
                                    formula: { ...config.formula, result_configs: newConfigs }
                                });
                            }}
                            onUpdateLegend={(value) => {
                                const newLabels = [...(config.legend.labels || [])];
                                while (newLabels.length <= index) newLabels.push('');
                                newLabels[index] = value;
                                onUpdate({ legend: { ...config.legend, labels: newLabels } });
                            }}
                            onUpdateColor={(value) => {
                                const newCustomColors = { ...config.style.custom_colors, [key]: value };
                                const newConfigs = {
                                    ...config.formula.result_configs,
                                    [key]: { ...resultConfig, color: value }
                                };
                                onUpdate({
                                    style: { ...config.style, custom_colors: newCustomColors },
                                    formula: { ...config.formula, result_configs: newConfigs }
                                });
                            }}
                            onDelete={() => {
                                // Cannot delete formula results directly as they are derived from input
                            }}
                        />
                    );
                })}
            </div>
        </>
    );
};
