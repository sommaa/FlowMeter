/**
 * General settings section for visualization configuration.
 *
 * This component provides the core configuration controls for a visualization:
 * - Visualization type selection (line, area, histogram, regression, etc.)
 * - X-axis variable selection
 * - Custom formula input for x-axis
 * - Colormap selection for heatmaps
 *
 * When visualization type changes, this component resets dependent configuration
 * fields to prevent invalid states and ensure clean transitions between chart types.
 *
 * @module components/visualizations/sections/GeneralSettings
 */

import React from 'react';
import { Select, SearchableSelect, DebouncedInput } from '@/components/common';
import { VisualizationConfig, VisualizationType } from '@/types';

/**
 * Available visualization types with clean, user-friendly labels.
 *
 * Types are organized from most common to specialized:
 * - General plotting: universal, area, histogram, box plot
 * - Analysis: regression, PCA, root cause
 * - Advanced: custom formula, correlation matrix, FFT
 *
 * @constant {Array<{value: VisualizationType, label: string}>}
 */
const VISUALIZATION_TYPES: { value: VisualizationType; label: string }[] = [
    { value: 'universal', label: 'General Plot' },
    { value: 'area', label: 'Area Chart' },
    { value: 'hist', label: 'Histogram' },
    { value: 'box', label: 'Box Plot' },
    { value: 'regression', label: 'Regression Analysis' },
    { value: 'pca', label: 'PCA Analysis' },

    { value: 'formula', label: 'Custom Formula' },
    { value: 'correlation', label: 'Correlation Matrix' },
    { value: 'fft', label: 'FFT Power Spectrum' },
    { value: 'root_cause', label: 'Root Cause Analysis' },
];

/**
 * Colormap options for correlation matrices and heatmaps.
 *
 * Includes both perceptually uniform (Viridis family) and diverging (RdBu)
 * colormaps for different data visualization needs.
 *
 * @constant {Array<{value: string, label: string}>}
 */
const COLORMAP_OPTIONS = [
    { value: 'RdBu', label: 'Red-Blue (Diverging)' },
    { value: 'Viridis', label: 'Viridis' },
    { value: 'Plasma', label: 'Plasma' },
    { value: 'Magma', label: 'Magma' },
    { value: 'Inferno', label: 'Inferno' },
    { value: 'Cividis', label: 'Cividis' },
    { value: 'Jet', label: 'Jet' },
    { value: 'Hot', label: 'Hot' },
    { value: 'Greys', label: 'Greys' },
    { value: 'YlGnBu', label: 'Yellow-Green-Blue' },
    { value: 'Blues', label: 'Blues' },
    { value: 'Reds', label: 'Reds' },
    { value: 'Earth', label: 'Earth' },
    { value: 'Electric', label: 'Electric' },
    { value: 'Blackbody', label: 'Blackbody' },
    { value: 'Portland', label: 'Portland' },
];

/**
 * Props for the GeneralSettings component.
 *
 * @interface GeneralSettingsProps
 * @property {VisualizationConfig} config - Current visualization configuration
 * @property {Array<{value: string, label: string}>} xAxisOptions - Available x-axis options
 * @property {(updates: Partial<VisualizationConfig>) => void} onUpdate - Callback for config updates
 */
interface GeneralSettingsProps {
    config: VisualizationConfig;
    xAxisOptions: { value: string; label: string }[];
    onUpdate: (updates: Partial<VisualizationConfig>) => void;
}

/**
 * General settings component for basic visualization configuration.
 *
 * Renders configuration controls that apply to most or all visualization types.
 * The component intelligently shows/hides fields based on the selected visualization type.
 *
 * Fields Shown:
 * - Visualization Type: Always shown
 * - Colormap: Shown only for correlation matrices
 * - X-Axis: Shown for most types except hist, box, pca, correlation, root_cause
 * - X Formula: Shown when x-axis is set to "Custom Formula"
 *
 * Reset Behavior:
 * When visualization type changes, the component resets:
 * - Y-axis selection to empty array
 * - X-axis to "Index"
 * - Custom colors to empty object
 * - Legend labels to empty array
 * - Regression settings to defaults
 * - Formula settings to defaults
 * - Date range to undefined
 * - Type-specific settings (PCA, FFT, root cause) to defaults
 *
 * This reset prevents inconsistent states where old configuration options persist
 * and cause errors with the new visualization type.
 *
 * X-Axis Options:
 * - Index: Uses the datetime column or row index
 * - Custom Formula: Allows Python expression for x-axis values
 * - Column Name: Uses specified column directly
 *
 * @param {GeneralSettingsProps} props - Component props
 * @returns {JSX.Element} Settings section with type and axis controls
 *
 * @example
 * ```tsx
 * <GeneralSettings
 *   config={visualizationConfig}
 *   xAxisOptions={[
 *     { value: 'Index', label: 'Timestamp' },
 *     { value: 'Custom Formula', label: 'Custom Formula' },
 *     { value: 'Temperature', label: 'Temperature' },
 *     { value: 'Pressure', label: 'Pressure' }
 *   ]}
 *   onUpdate={(updates) => updateVisualization(plotId, updates)}
 * />
 * ```
 */
export const GeneralSettings: React.FC<GeneralSettingsProps> = ({ config, xAxisOptions, onUpdate }) => {
    const showFormulaOptions = config.viz_type === 'formula';
    const showXAxisOptions = !showFormulaOptions && !['hist', 'box', 'pca', 'correlation', 'fft', 'root_cause'].includes(config.viz_type);

    return (
        <div className="space-y-3">
            {/* Visualization Type */}
            <Select
                label="Visualization Type"
                options={VISUALIZATION_TYPES}
                value={config.viz_type}
                onChange={(e) => {
                    const newType = e.target.value as VisualizationType;
                    // Reset fields to prevent bugs
                    onUpdate({
                        viz_type: newType,
                        axis: {
                            ...config.axis,
                            y_axis: [],
                            x_axis: 'Index',
                            x_label: undefined,
                            y_label: undefined,
                        },
                        style: {
                            ...config.style,
                            custom_colors: {},
                        },
                        legend: {
                            labels: [],
                        },
                        regression: {
                            ...config.regression,
                            predictors: [],
                            added: false,
                            degree: 1,
                        },
                        formula: {
                            ...config.formula,
                            add_regression: false,
                            regression_degree: 1,
                            input: undefined,
                            x_formula: undefined,
                        },
                        date_range: undefined,
                        pca: {
                            ...config.pca,
                            components: 2,
                            show_loadings: true
                        },
                        fft: {
                            ...config.fft,
                            window_size: undefined,
                            overlap: 0.5,
                            detrend: 'linear',
                            frequency_unit: 'hz'
                        },
                        root_cause: {
                            ...config.root_cause,
                            target_variable: undefined,
                        }
                    });
                }}
            />

            {config.viz_type === 'correlation' && (
                <Select
                    label="Colormap"
                    options={COLORMAP_OPTIONS}
                    value={config.style.colormap || 'RdBu'}
                    onChange={(e) => onUpdate({ style: { ...config.style, colormap: e.target.value } })}
                />
            )}

            {showXAxisOptions && (
                <>
                    <SearchableSelect
                        label="X-Axis"
                        options={xAxisOptions}
                        value={config.axis.x_axis}
                        onChange={(e) => onUpdate({ axis: { ...config.axis, x_axis: e.target.value } })}
                        placeholder="Search variables..."
                    />

                    {config.axis.x_axis === 'Custom Formula' && (
                        <DebouncedInput
                            label="X Formula"
                            value={config.formula.x_formula || ''}
                            onChange={(value) => onUpdate({ formula: { ...config.formula, x_formula: value } })}
                            placeholder="col['Time'] / 3600"
                            className="font-mono text-sm"
                            debounceMs={500}
                        />
                    )}
                </>
            )}

            {showFormulaOptions && (
                <>
                    <SearchableSelect
                        label="X-Axis"
                        options={xAxisOptions}
                        value={config.axis.x_axis}
                        onChange={(e) => onUpdate({ axis: { ...config.axis, x_axis: e.target.value } })}
                        placeholder="Search variables..."
                    />

                    {config.axis.x_axis === 'Custom Formula' && (
                        <DebouncedInput
                            label="X Formula"
                            value={config.formula.x_formula || ''}
                            onChange={(value) => onUpdate({ formula: { ...config.formula, x_formula: value } })}
                            placeholder="col['Time'] / 3600"
                            className="font-mono text-sm"
                            debounceMs={500}
                        />
                    )}
                </>
            )}
        </div>
    );
};
