/**
 * Configuration panel for visualization settings.
 *
 * Provides a comprehensive interface for configuring all aspects of a visualization,
 * including chart type, axes, data series, regression analysis, FFT analysis, root cause
 * analysis, formulas, and notes. The panel intelligently shows/hides sections based on
 * the selected visualization type.
 *
 * @module components/visualizations/ConfigurationPanel
 */

import React from 'react';
import { Cpu, MessageSquare } from 'lucide-react';
import { VisualizationConfig } from '@/types';
import { Divider, DebouncedTextArea } from '@/components/common';

import { GeneralSettings } from './sections/GeneralSettings';
import { SeriesList } from './sections/SeriesList';
import { AxisSettings } from './sections/AxisSettings';
import { RegressionSettings } from './sections/RegressionSettings';
import { FormulaSettings } from './sections/FormulaSettings';
import { FFTSettings } from './sections/FFTSettings';
import { RootCauseSettings } from './sections/RootCauseSettings';
import { KPISettings } from './sections/KPISettings';

/**
 * Props for the ConfigurationPanel component.
 *
 * @interface ConfigurationPanelProps
 * @property {VisualizationConfig} config - Current visualization configuration
 * @property {string[]} numericColumns - List of numeric column names from the dataset
 * @property {string[]} allColumns - List of all column names from the dataset
 * @property {string[]} [datetimeColumns] - List of datetime column names (optional)
 * @property {(updates: Partial<VisualizationConfig>) => void} onUpdate - Callback when config changes
 * @property {() => void} onOpenFormula - Callback to open the formula editor modal
 * @property {string} [regressionEquation] - Current regression equation if available (optional)
 * @property {boolean} [stacked] - Whether to use stacked layout (default: false)
 */
interface ConfigurationPanelProps {
    config: VisualizationConfig;
    numericColumns: string[];
    allColumns: string[];
    datetimeColumns?: string[];
    onUpdate: (updates: Partial<VisualizationConfig>) => void;
    onOpenFormula: (kpiMetricId?: string) => void;
    regressionEquation?: string;
    stacked?: boolean;
}

/**
 * Configuration panel component for visualization settings.
 *
 * Renders a sidebar panel containing all configuration options for a visualization.
 * The panel is organized into logical sections and adapts based on the visualization
 * type. For example, correlation, PCA, and root cause analysis types hide standard
 * plot controls since they have dedicated settings.
 *
 * Layout adapts to screen size:
 * - Desktop (lg+): 384px wide sidebar with right border
 * - Mobile/Tablet: Full width with bottom border, 400px height when stacked
 *
 * Section organization:
 * 1. General Settings - Always shown (chart type, x-axis selection)
 * 2. Type-specific Settings - Conditionally shown based on viz_type
 *    - Root Cause Analysis settings
 *    - FFT (Fast Fourier Transform) settings
 *    - Custom Formula settings
 * 3. Standard Plot Settings - Hidden for analysis-only types
 *    - Series List (y-axis variables)
 *    - Regression Settings
 *    - Axis Settings (labels, ranges, scales)
 * 4. Notes - Always shown (freeform text notes)
 *
 * @param {ConfigurationPanelProps} props - Component props
 * @returns {JSX.Element} Configuration panel with sections
 *
 * @example
 * ```tsx
 * <ConfigurationPanel
 *   config={plotConfig}
 *   numericColumns={['temperature', 'pressure', 'flow_rate']}
 *   allColumns={['timestamp', 'temperature', 'pressure', 'flow_rate', 'status']}
 *   datetimeColumns={['timestamp']}
 *   onUpdate={(updates) => setConfig({...config, ...updates})}
 *   onOpenFormula={() => setFormulaModalOpen(true)}
 *   regressionEquation="y = 2.5x + 1.3"
 *   stacked={false}
 * />
 * ```
 */
export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({
    config,
    numericColumns,
    allColumns,
    datetimeColumns = [],
    onUpdate,
    onOpenFormula,
    regressionEquation,
    stacked = false,
}) => {
    // Use actual datetime column name for Index label
    const indexLabel = datetimeColumns.length > 0 ? datetimeColumns[0] : 'Index';

    const xAxisOptions = [
        { value: 'Index', label: indexLabel },
        { value: 'Custom Formula', label: 'Custom Formula' },
        ...allColumns
            .filter(col => col !== indexLabel)
            .map((col) => ({ value: col, label: col })),
    ];

    // Analysis-only types have their own dedicated settings and don't need
    // standard plot controls (series, axis, regression, formula, etc.)
    const ANALYSIS_ONLY_TYPES = ['correlation', 'pca', 'root_cause', 'kpi'];
    const showPlotSettings = !ANALYSIS_ONLY_TYPES.includes(config.viz_type);

    // FFT needs variable selection (SeriesList) but not regression/axis controls
    const showRegressionAndAxis = showPlotSettings && config.viz_type !== 'fft';

    const containerClasses = React.useMemo(() => {
        if (stacked) {
            return "w-full p-4 h-[400px] border-b border-border space-y-4 flex-shrink-0 lg:max-h-none scrollbar-thin lg:overflow-y-auto";
        }
        return "w-full lg:w-96 p-4 max-h-[400px] lg:max-h-[600px] border-b lg:border-b-0 lg:border-r border-border space-y-4 flex-shrink-0 overflow-y-auto scrollbar-thin";
    }, [stacked]);

    return (
        <div className={containerClasses}>
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
                <Cpu className="w-4 h-4 text-muted-foreground" />
                Configuration
            </h3>

            {/* 1. General Settings (Type, X-Axis) — always shown */}
            <GeneralSettings
                config={config}
                xAxisOptions={xAxisOptions}
                onUpdate={onUpdate}
            />

            {/* 2. Type-specific settings (each component self-guards on viz_type) */}
            <RootCauseSettings config={config} numericColumns={numericColumns} onUpdate={onUpdate} />
            <FFTSettings config={config} onUpdate={onUpdate} />
            <FormulaSettings config={config} onUpdate={onUpdate} onOpenFormula={() => onOpenFormula()} />
            <KPISettings
                config={config}
                numericColumns={numericColumns}
                onUpdate={onUpdate}
                onOpenFormula={(metricId) => onOpenFormula(metricId)}
            />

            {/* 3. Standard plot settings — hidden for analysis-only types */}
            {showPlotSettings && (
                <>
                    <SeriesList
                        config={config}
                        numericColumns={numericColumns}
                        onUpdate={onUpdate}
                    />
                    {showRegressionAndAxis && (
                        <>
                            <RegressionSettings
                                config={config}
                                numericColumns={numericColumns}
                                onUpdate={onUpdate}
                                onOpenFormula={onOpenFormula}
                                regressionEquation={regressionEquation}
                            />
                            <Divider />
                            <AxisSettings
                                config={config}
                                onUpdate={onUpdate}
                            />
                        </>
                    )}
                </>
            )}

            {/* 4. Notes — always shown */}
            <Divider />
            <div className="space-y-2">
                <h4 className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    Notes
                </h4>
                <DebouncedTextArea
                    value={config.notes || ''}
                    onChange={(value) => onUpdate({ notes: value })}
                    placeholder="Add notes for this visualization..."
                    rows={3}
                    debounceMs={500}
                />
            </div>

        </div>
    );
};
