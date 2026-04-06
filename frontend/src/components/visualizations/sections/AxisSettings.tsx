/**
 * Axis settings section for visualization configuration.
 *
 * This comprehensive component provides controls for all axis-related settings:
 * - Custom axis labels (X, Y, Y2)
 * - Axis scales (linear, logarithmic)
 * - Reference/threshold lines with shaded regions
 * - Manual axis range limits (X, Y, Y2)
 * - Datetime range selection for time-series data
 *
 * The component adapts to visualization types and disables incompatible options
 * (e.g., log scale disabled for PCA/correlation, disabled during area stacking).
 *
 * Reference Lines:
 * Reference lines (thresholds) can be added to mark important values on the chart.
 * Each threshold supports:
 * - Value and axis assignment (left/right)
 * - Custom label and color
 * - Optional shaded area (above/below the line)
 * - Configurable shading opacity
 *
 * @module components/visualizations/sections/AxisSettings
 */

import React from 'react';
import { Trash2 } from 'lucide-react';
import {
    DebouncedInput,
    DebouncedColorPicker,
    Button,
    Checkbox,
    NumberInput,
    Divider,
    Select,
    SimpleTooltip
} from '@/components/common';
import { VisualizationConfig } from '@/types';
import { DebouncedOpacityInput } from '../controls/DebouncedOpacityInput';

/**
 * Props for the AxisSettings component.
 *
 * @interface AxisSettingsProps
 * @property {VisualizationConfig} config - Current visualization configuration
 * @property {(updates: Partial<VisualizationConfig>) => void} onUpdate - Callback for config updates
 */
interface AxisSettingsProps {
    config: VisualizationConfig;
    onUpdate: (updates: Partial<VisualizationConfig>) => void;
}

/**
 * Axis settings component for comprehensive axis configuration.
 *
 * Provides a full suite of axis customization options organized into logical sections:
 *
 * **Axis Labels**:
 * - Custom text labels for X-axis, Y-axis (left), and Y2-axis (right)
 * - Falls back to "Auto" if not specified
 * - Debounced input to prevent excessive updates
 *
 * **Axis Scales**:
 * - Linear or logarithmic scales for X and Y axes
 * - Disabled for PCA, correlation, and FFT visualizations
 * - X-axis scale disabled when x_axis is "Index" (datetime)
 * - Both scales disabled when area stacking is enabled
 * - Helpful tooltip explains why scales are disabled
 *
 * **Reference Lines (Thresholds)**:
 * - Add unlimited threshold lines to mark important values
 * - Each threshold includes:
 *   - Numeric value and y-axis assignment (left/right)
 *   - Custom label text
 *   - Color picker for line color
 *   - Optional shaded area above or below the line
 *   - Opacity slider for shading (0.0 - 1.0)
 * - Lines appear in legend and on hover
 * - Delete button removes individual thresholds
 * - Empty state when no thresholds added
 *
 * **X-Axis Range**:
 * - Optional manual min/max limits for x-axis
 * - Datetime picker when x_axis is "Index" (time-series)
 * - Number inputs for numeric x-axes
 * - Enable checkbox toggles range limiting
 *
 * **Y-Axis Range**:
 * - Optional manual min/max limits for left y-axis
 * - Number inputs with "Auto" placeholder
 * - Enable checkbox toggles range limiting
 * - Useful for zooming or standardizing scales across plots
 *
 * **Secondary Y-Axis Range**:
 * - Optional manual min/max limits for right y-axis
 * - Same controls as primary y-axis
 * - Only applies when series use right axis assignment
 *
 * Logarithmic Scale Behavior:
 * When log scale is enabled, manual ranges are converted to log10 space internally.
 * Values must be positive for log scale to work correctly.
 *
 * Threshold Shading Use Cases:
 * - Safety zones: Shade red above a maximum safe value
 * - Operating ranges: Shade green within normal operating limits
 * - Warning regions: Shade yellow/orange approaching critical thresholds
 * - Historical baselines: Shade area around historical average
 *
 * @param {AxisSettingsProps} props - Component props
 * @returns {JSX.Element} Comprehensive axis configuration controls
 *
 * @example
 * ```tsx
 * <AxisSettings
 *   config={{
 *     axis: {
 *       x_label: 'Time (hours)',
 *       y_label: 'Temperature (°C)',
 *       y2_label: 'Pressure (bar)',
 *       x_axis_scale: 'linear',
 *       y_axis_scale: 'log',
 *       enable_y_axis_range: true,
 *       y_axis_min: 0,
 *       y_axis_max: 100
 *     },
 *     limits: {
 *       thresholds: [
 *         {
 *           id: 'uuid-1',
 *           value: 80,
 *           label: 'Max Safe Temp',
 *           color: '#ff0000',
 *           y_axis_id: 'left',
 *           show_shaded_area: true,
 *           shaded_area_direction: 'up',
 *           shaded_area_opacity: 0.15
 *         }
 *       ]
 *     }
 *   }}
 *   onUpdate={(updates) => updateConfig(updates)}
 * />
 * ```
 */
export const AxisSettings: React.FC<AxisSettingsProps> = ({ config, onUpdate }) => {
    return (
        <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">
                Axis Labels
            </h4>
            <DebouncedInput
                label="X-Axis Label"
                value={config.axis.x_label || ''}
                onChange={(value) => onUpdate({ axis: { ...config.axis, x_label: value } })}
                placeholder="Auto"
                debounceMs={500}
            />
            <DebouncedInput
                label="Y-Axis Label"
                value={config.axis.y_label || ''}
                onChange={(value) => onUpdate({ axis: { ...config.axis, y_label: value } })}
                placeholder="Auto"
                debounceMs={500}
            />
            <DebouncedInput
                label="Y-Axis Label (Right)"
                value={config.axis.y2_label || ''}
                onChange={(value) => onUpdate({ axis: { ...config.axis, y2_label: value } })}
                placeholder="Auto"
                debounceMs={500}
            />

            <Divider />

            {/* Axis Scales */}
            {!['pca', 'correlation', 'fft'].includes(config.viz_type) && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-slate-600 dark:text-gray-400">
                            Axis Scales
                        </h4>
                        {config.style?.enable_stacking && (
                            <SimpleTooltip content="Logarithmic scale is disabled when stacking is enabled.">
                                <span className="text-xs text-amber-500 cursor-help flex items-center gap-1">
                                    (Disabled by Stacking)
                                </span>
                            </SimpleTooltip>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Select
                            label="X-Axis Scale"
                            value={config.axis.x_axis_scale || 'linear'}
                            options={[
                                { value: 'linear', label: 'Linear' },
                                { value: 'log', label: 'Logarithmic' }
                            ]}
                            onChange={(e) => onUpdate({ axis: { ...config.axis, x_axis_scale: e.target.value as any } })}
                            disabled={!!config.style?.enable_stacking || config.axis.x_axis === 'Index'}
                        />
                        <Select
                            label="Y-Axis Scale"
                            value={config.axis.y_axis_scale || 'linear'}
                            options={[
                                { value: 'linear', label: 'Linear' },
                                { value: 'log', label: 'Logarithmic' }
                            ]}
                            onChange={(e) => onUpdate({ axis: { ...config.axis, y_axis_scale: e.target.value as any } })}
                            disabled={!!config.style?.enable_stacking}
                        />
                    </div>
                </div>
            )}

            <Divider />

            {/* Thresholds / Limits */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-slate-600 dark:text-gray-400">
                        Reference Lines
                    </h4>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                            const newThresholds = [
                                ...(config.limits.thresholds || []),
                                {
                                    id: crypto.randomUUID(),
                                    value: 0,
                                    label: 'Limit',
                                    color: '#ff0000',
                                    line_style: 'dashed' as const,
                                    y_axis_id: 'left' as const,
                                    show_shaded_area: false,
                                    shaded_area_opacity: 0.1,
                                    shaded_area_direction: 'up' as const
                                }
                            ];
                            onUpdate({ limits: { thresholds: newThresholds } });
                        }}
                        icon={<span className="text-lg leading-none">+</span>}
                        className="h-7 px-2 text-xs"
                    >
                        Add Line
                    </Button>
                </div>

                <div className="space-y-3">
                    {(config.limits.thresholds || []).map((threshold, index) => (
                        <div key={index} className="relative p-3 bg-muted/30 rounded-lg border border-border space-y-3">
                            <Button
                                size="sm"
                                variant="ghost"
                                className="absolute right-1 top-1 h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                    const newThresholds = (config.limits.thresholds || []).filter((_, i) => i !== index);
                                    onUpdate({ limits: { thresholds: newThresholds } });
                                }}
                                title="Remove Threshold"
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>

                            <div className="flex flex-col gap-3">
                                {/* Row 1: Value and Axis */}
                                <div className="flex gap-3 items-end pr-6">
                                    <div className="flex-1">
                                        <NumberInput
                                            label="Value"
                                            value={threshold.value}
                                            onChange={(e) => {
                                                const newThresholds = [...(config.limits.thresholds || [])];
                                                newThresholds[index] = { ...threshold, value: parseFloat(e.target.value) };
                                                onUpdate({ limits: { thresholds: newThresholds } });
                                            }}
                                        />
                                    </div>
                                    <div className="w-24 space-y-1">
                                        <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Axis</span>
                                        <select
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            value={threshold.y_axis_id || 'left'}
                                            onChange={(e) => {
                                                const newThresholds = [...(config.limits.thresholds || [])];
                                                newThresholds[index] = { ...threshold, y_axis_id: e.target.value as any };
                                                onUpdate({ limits: { thresholds: newThresholds } });
                                            }}
                                        >
                                            <option value="left">Left</option>
                                            <option value="right">Right</option>
                                        </select>
                                    </div>
                                </div>
                                {/* Row 2: Label and Controls */}
                                <div className="flex gap-3 items-end">
                                    <div className="flex-1">
                                        <DebouncedInput
                                            label="Label"
                                            value={threshold.label}
                                            onChange={(value) => {
                                                const newThresholds = [...(config.limits.thresholds || [])];
                                                newThresholds[index] = { ...threshold, label: value };
                                                onUpdate({ limits: { thresholds: newThresholds } });
                                            }}
                                            debounceMs={300}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 pb-0.5">
                                        <div className="flex flex-col gap-1 items-center">
                                            <span className="text-[10px] font-medium text-muted-foreground uppercase opacity-0 h-4">.</span>
                                            <DebouncedColorPicker
                                                value={threshold.color}
                                                onChange={(value) => {
                                                    const newThresholds = [...(config.limits.thresholds || [])];
                                                    newThresholds[index] = { ...threshold, color: value };
                                                    onUpdate({ limits: { thresholds: newThresholds } });
                                                }}
                                                className="w-10 h-10 p-0 border-0 rounded ring-1 ring-border"
                                                title="Line Color"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Shaded Area Options */}
                            <div className="flex items-center gap-4 pt-1 border-t border-border/50 mt-2">
                                <label className="flex items-center gap-2">
                                    <Checkbox
                                        checked={threshold.show_shaded_area}
                                        onChange={(e) => {
                                            const newThresholds = [...(config.limits.thresholds || [])];
                                            newThresholds[index] = { ...threshold, show_shaded_area: e.target.checked };
                                            onUpdate({ limits: { thresholds: newThresholds } });
                                        }}
                                        className="border-input"
                                    />
                                    <span className="text-xs text-foreground">Shaded Area</span>
                                </label>

                                {threshold.show_shaded_area && (
                                    <>
                                        <div className="flex bg-muted rounded-md p-0.5 border border-border">
                                            <button
                                                className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${threshold.shaded_area_direction === 'up' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                                onClick={() => {
                                                    const newThresholds = [...(config.limits.thresholds || [])];
                                                    newThresholds[index] = { ...threshold, shaded_area_direction: 'up' };
                                                    onUpdate({ limits: { thresholds: newThresholds } });
                                                }}
                                                title="Shade Above"
                                            >
                                                Above
                                            </button>
                                            <button
                                                className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${threshold.shaded_area_direction === 'down' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                                onClick={() => {
                                                    const newThresholds = [...(config.limits.thresholds || [])];
                                                    newThresholds[index] = { ...threshold, shaded_area_direction: 'down' };
                                                    onUpdate({ limits: { thresholds: newThresholds } });
                                                }}
                                                title="Shade Below"
                                            >
                                                Below
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-2 flex-1 justify-end">
                                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">Opacity:</span>
                                            <DebouncedOpacityInput
                                                value={threshold.shaded_area_opacity}
                                                onChange={(val) => {
                                                    const newThresholds = [...(config.limits.thresholds || [])];
                                                    newThresholds[index] = { ...threshold, shaded_area_opacity: val };
                                                    onUpdate({ limits: { thresholds: newThresholds } });
                                                }}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}

                    {(config.limits.thresholds || []).length === 0 && (
                        <div className="text-center py-4 border border-dashed border-border rounded-lg text-xs text-muted-foreground">
                            No thresholds added.
                        </div>
                    )}
                </div>
            </div>

            <Divider />

            {/* X-Axis Range Options — hidden for types with auto-generated X-axes */}
            {/* Protected types that shouldn't show X-axis range options
            Box plot x-axis is categorical (variable names), so numeric range doesn't make sense
            FFT x-axis is frequency, handled by its own controls */}
            {!['box', 'fft'].includes(config.viz_type) && (
                <div className="space-y-3">
                    <h4 className="text-sm font-medium text-slate-600 dark:text-gray-400">
                        X-Axis Range
                    </h4>
                    <label className="flex items-center gap-2">
                        <Checkbox
                            checked={config.axis.enable_x_axis_range || false}
                            onChange={(e) =>
                                onUpdate({ axis: { ...config.axis, enable_x_axis_range: e.target.checked } })
                            }
                            className="border-input"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                            Set X-Axis Limits
                        </span>
                    </label>
                    {config.axis.enable_x_axis_range && (
                        <div className="grid grid-cols-2 gap-2">
                            {config.axis.x_axis === 'Index' && !['hist', 'box', 'fft'].includes(config.viz_type) ? (
                                <>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                            Min (Date/Time)
                                        </label>
                                        <input
                                            type="datetime-local"
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                                            value={config.axis.x_axis_min?.toString() ?? ''}
                                            onChange={(e) =>
                                                onUpdate({
                                                    axis: { ...config.axis, x_axis_min: e.target.value || undefined },
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                            Max (Date/Time)
                                        </label>
                                        <input
                                            type="datetime-local"
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                                            value={config.axis.x_axis_max?.toString() ?? ''}
                                            onChange={(e) =>
                                                onUpdate({
                                                    axis: { ...config.axis, x_axis_max: e.target.value || undefined },
                                                })
                                            }
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <NumberInput
                                        label="Min"
                                        value={typeof config.axis.x_axis_min === 'number' ? config.axis.x_axis_min : undefined}
                                        onChange={(e) =>
                                            onUpdate({
                                                axis: { ...config.axis, x_axis_min: e.target.value ? parseFloat(e.target.value) : undefined },
                                            })
                                        }
                                        placeholder="Auto"
                                    />
                                    <NumberInput
                                        label="Max"
                                        value={typeof config.axis.x_axis_max === 'number' ? config.axis.x_axis_max : undefined}
                                        onChange={(e) =>
                                            onUpdate({
                                                axis: { ...config.axis, x_axis_max: e.target.value ? parseFloat(e.target.value) : undefined },
                                            })
                                        }
                                        placeholder="Auto"
                                    />
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            <Divider />
            <div className="space-y-3">
                <h4 className="text-sm font-medium text-slate-600 dark:text-gray-400">
                    Y-Axis Range
                </h4>
                <label className="flex items-center gap-2">
                    <Checkbox
                        checked={config.axis.enable_y_axis_range}
                        onChange={(e) =>
                            onUpdate({ axis: { ...config.axis, enable_y_axis_range: e.target.checked } })
                        }
                        className="border-input"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                        Set Y-Axis Limits
                    </span>
                </label>
                {config.axis.enable_y_axis_range && (
                    <div className="grid grid-cols-2 gap-2">
                        <NumberInput
                            label="Min"
                            value={config.axis.y_axis_min ?? ''}
                            onChange={(e) =>
                                onUpdate({
                                    axis: { ...config.axis, y_axis_min: e.target.value ? parseFloat(e.target.value) : undefined },
                                })
                            }
                            placeholder="Auto"
                        />
                        <NumberInput
                            label="Max"
                            value={config.axis.y_axis_max ?? ''}
                            onChange={(e) =>
                                onUpdate({
                                    axis: { ...config.axis, y_axis_max: e.target.value ? parseFloat(e.target.value) : undefined },
                                })
                            }
                            placeholder="Auto"
                        />
                    </div>
                )}
            </div>

            {/* Secondary Y-Axis Range Options */}
            <div className="space-y-3 pt-4 border-t border-border">
                <h4 className="text-sm font-medium text-slate-600 dark:text-gray-400">
                    Secondary Y-Axis Range
                </h4>
                <label className="flex items-center gap-2">
                    <Checkbox
                        checked={config.axis.enable_y2_axis_range || false}
                        onChange={(e) =>
                            onUpdate({ axis: { ...config.axis, enable_y2_axis_range: e.target.checked } })
                        }
                        className="border-input"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                        Enable Manual Range (Right)
                    </span>
                </label>

                {config.axis.enable_y2_axis_range && (
                    <div className="grid grid-cols-2 gap-4">
                        <NumberInput
                            label="Min (Right)"
                            value={config.axis.y2_axis_min ?? ''}
                            onChange={(e) =>
                                onUpdate({
                                    axis: { ...config.axis, y2_axis_min: e.target.value ? parseFloat(e.target.value) : undefined },
                                })
                            }
                            placeholder="Auto"
                        />
                        <NumberInput
                            label="Max (Right)"
                            value={config.axis.y2_axis_max ?? ''}
                            onChange={(e) =>
                                onUpdate({
                                    axis: { ...config.axis, y2_axis_max: e.target.value ? parseFloat(e.target.value) : undefined },
                                })
                            }
                            placeholder="Auto"
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
