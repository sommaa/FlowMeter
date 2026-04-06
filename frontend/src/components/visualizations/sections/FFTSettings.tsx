/**
 * FFT settings section for frequency spectrum analysis configuration.
 *
 * This component provides comprehensive controls for Fast Fourier Transform (FFT)
 * analysis settings, allowing users to configure:
 * - Window functions for spectral leakage reduction
 * - Detrending to remove DC offset or linear trends
 * - Window size and overlap for spectral resolution vs noise reduction tradeoff
 * - Frequency unit conversion (Hz, CPM, CPH)
 * - Power normalization
 * - Axis scaling (linear or logarithmic)
 *
 * FFT analysis converts time-domain signals into frequency-domain representations,
 * revealing dominant frequencies, periodic patterns, and spectral characteristics.
 *
 * @module components/visualizations/sections/FFTSettings
 */

import React from 'react';
import { VisualizationConfig } from '@/types';
import { Select, DebouncedInput, Checkbox, Divider } from '@/components/common';

/**
 * Props for the FFTSettings component.
 *
 * @interface FFTSettingsProps
 * @property {VisualizationConfig} config - Current visualization configuration
 * @property {(updates: Partial<VisualizationConfig>) => void} onUpdate - Callback for config updates
 */
interface FFTSettingsProps {
    config: VisualizationConfig;
    onUpdate: (updates: Partial<VisualizationConfig>) => void;
}

/**
 * Window function options for FFT analysis.
 *
 * Window functions reduce spectral leakage by tapering signal edges:
 * - **Hann**: Good general-purpose window with moderate leakage reduction
 * - **Hamming**: Similar to Hann, slightly better stopband attenuation
 * - **Blackman**: Excellent leakage reduction, wider main lobe
 * - **Bartlett**: Triangular window, linear rolloff
 * - **Flat Top**: Best amplitude accuracy, poor frequency resolution
 * - **Boxcar (Rectangular)**: No windowing, maximum leakage but best resolution
 *
 * @constant {Array<{value: string, label: string}>}
 */
const WINDOW_TYPES = [
    { value: 'hann', label: 'Hann (Default)' },
    { value: 'hamming', label: 'Hamming' },
    { value: 'blackman', label: 'Blackman' },
    { value: 'bartlett', label: 'Bartlett' },
    { value: 'flattop', label: 'Flat Top' },
    { value: 'boxcar', label: 'Boxcar (Rectangular)' },
];

/**
 * Detrending options for FFT preprocessing.
 *
 * Detrending removes low-frequency components before FFT:
 * - **Linear**: Removes linear trend (best-fit line)
 * - **Constant**: Removes DC offset (mean value)
 * - **None**: No detrending (use if signal already centered)
 *
 * @constant {Array<{value: string, label: string}>}
 */
const DETREND_TYPES = [
    { value: 'linear', label: 'Linear (Remove Trend)' },
    { value: 'constant', label: 'Constant (Remove Mean)' },
    { value: 'none', label: 'None' },
];

/**
 * Frequency unit conversion options.
 *
 * Converts frequency axis to different units:
 * - **Hz**: Hertz (cycles per second) - standard SI unit
 * - **CPM**: Cycles per minute - common in mechanical engineering
 * - **CPH**: Cycles per hour - useful for slow phenomena
 *
 * @constant {Array<{value: string, label: string}>}
 */
const FREQ_UNITS = [
    { value: 'hz', label: 'Hz (Hertz)' },
    { value: 'cpm', label: 'CPM (Cycles/Min)' },
    { value: 'cph', label: 'CPH (Cycles/Hour)' },
];

/**
 * Axis scale options for FFT display.
 *
 * @constant {Array<{value: string, label: string}>}
 */
const AXIS_SCALES = [
    { value: 'linear', label: 'Linear' },
    { value: 'log', label: 'Logarithmic' },
];

/**
 * FFT settings component for frequency spectrum analysis configuration.
 *
 * Renders only when viz_type is 'fft'. Provides controls for:
 *
 * **Window Type**:
 * - Selects tapering function applied to signal before FFT
 * - Tradeoff: Leakage reduction vs frequency resolution
 * - Hann is good default for most applications
 *
 * **Detrending**:
 * - Removes DC offset or linear trends before FFT
 * - Linear detrending recommended for signals with drift
 * - Constant detrending removes mean (DC component)
 * - None if signal is already centered around zero
 *
 * **Window Size**:
 * - Number of samples per FFT window
 * - Larger = better frequency resolution, worse time localization
 * - Smaller = worse frequency resolution, better time localization
 * - Auto if undefined (uses entire signal or reasonable default)
 *
 * **Overlap**:
 * - Fraction of window overlap between consecutive FFTs (0.0 - 0.99)
 * - Higher overlap = smoother spectrum, more computation
 * - Common values: 0.5 (50%), 0.75 (75%)
 * - Default: 0.5
 *
 * **Frequency Unit**:
 * - Converts frequency axis to Hz, CPM, or CPH
 * - Does not affect calculation, only display
 *
 * **Normalize Power**:
 * - Divides power spectrum by total power
 * - Results in normalized spectrum summing to 1.0
 * - Useful for comparing spectra with different signal amplitudes
 *
 * **Display Scales**:
 * - X-Axis (Frequency): Linear or logarithmic scale
 * - Y-Axis (Power): Linear or logarithmic scale
 * - Log-log scale useful for wide frequency/power ranges
 * - Log Y-axis (Power) common for visualizing weak peaks
 *
 * FFT Use Cases:
 * - Identify dominant frequencies in periodic signals
 * - Detect vibration modes in mechanical systems
 * - Analyze harmonic content in electrical signals
 * - Find hidden periodicities in noisy data
 * - Monitor frequency shifts over time
 *
 * @param {FFTSettingsProps} props - Component props
 * @returns {JSX.Element | null} FFT configuration UI or null if not FFT type
 *
 * @example
 * ```tsx
 * <FFTSettings
 *   config={{
 *     viz_type: 'fft',
 *     fft: {
 *       window_type: 'hann',
 *       window_size: 1024,
 *       overlap: 0.5,
 *       detrend: 'linear',
 *       frequency_unit: 'hz',
 *       normalize: true,
 *       x_axis_scale: 'linear',
 *       y_axis_scale: 'log'
 *     }
 *   }}
 *   onUpdate={(updates) => updateConfig(updates)}
 * />
 * ```
 */
export const FFTSettings: React.FC<FFTSettingsProps> = ({ config, onUpdate }) => {
    if (config.viz_type !== 'fft') return null;

    const { fft } = config;

    const updateFFT = (updates: Partial<typeof fft>) => {
        onUpdate({ fft: { ...fft, ...updates } });
    };

    return (
        <div className="space-y-4">
            <Divider />
            <h4 className="text-sm font-medium text-foreground">FFT Analysis Settings</h4>

            <div className="grid grid-cols-2 gap-3">
                <Select
                    label="Window Type"
                    options={WINDOW_TYPES}
                    value={fft.window_type}
                    onChange={(e) => updateFFT({ window_type: e.target.value })}
                />

                <Select
                    label="Detrending"
                    options={DETREND_TYPES}
                    value={fft.detrend}
                    onChange={(e) => updateFFT({ detrend: e.target.value })}
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <DebouncedInput
                    label="Window Size (Samples)"
                    type="number"
                    value={fft.window_size?.toString() || ''}
                    placeholder="Auto"
                    onChange={(val) => {
                        const num = parseInt(val);
                        updateFFT({ window_size: isNaN(num) ? undefined : num });
                    }}
                />

                <DebouncedInput
                    label="Overlap (0.0 - 0.99)"
                    type="number"
                    step="0.1"
                    min="0"
                    max="0.99"
                    value={fft.overlap?.toString() || '0.5'}
                    onChange={(val) => {
                        const num = parseFloat(val);
                        if (!isNaN(num) && num >= 0 && num < 1) {
                            updateFFT({ overlap: num });
                        }
                    }}
                />
            </div>

            <div className="space-y-3">
                <Select
                    label="Frequency Unit"
                    options={FREQ_UNITS}
                    value={fft.frequency_unit}
                    onChange={(e) => updateFFT({ frequency_unit: e.target.value })}
                />

                <div className="flex items-center space-x-2 pt-2">
                    <Checkbox
                        id="fft-normalize"
                        checked={fft.normalize}
                        onChange={(e) => updateFFT({ normalize: e.target.checked })}
                    />
                    <label
                        htmlFor="fft-normalize"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                        Normalize Power (Divide by Total)
                    </label>
                </div>
            </div>

            <Divider className="my-2" />
            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Display</h5>

            <div className="grid grid-cols-2 gap-3">
                <Select
                    label="X-Axis Scale"
                    options={AXIS_SCALES}
                    value={fft.x_axis_scale}
                    onChange={(e) => updateFFT({ x_axis_scale: e.target.value })}
                />

                <Select
                    label="Y-Axis Scale"
                    options={AXIS_SCALES}
                    value={fft.y_axis_scale}
                    onChange={(e) => updateFFT({ y_axis_scale: e.target.value })}
                />
            </div>
        </div>
    );
};
