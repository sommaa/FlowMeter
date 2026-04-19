import React, { useMemo } from 'react';
import { Plus, Trash2, GripVertical, Maximize2 } from 'lucide-react';
import { KPIMetric, KPIMetricPeriod, KPIOperation, KPIPeriodPreset, VisualizationConfig } from '@/types';
import {
    SearchableSelect,
    DebouncedInput,
    Checkbox,
    Divider,
    Select,
    CustomColorPicker,
    NumberInput,
    Button,
} from '@/components/common';
import { CHART_COLORS } from '@/lib/constants';

interface KPISettingsProps {
    config: VisualizationConfig;
    numericColumns: string[];
    onUpdate: (updates: Partial<VisualizationConfig>) => void;
    onOpenFormula: (metricId: string) => void;
}

const OPERATION_OPTIONS: { value: KPIOperation; label: string }[] = [
    { value: 'sum', label: 'Sum' },
    { value: 'avg', label: 'Average' },
    { value: 'min', label: 'Min' },
    { value: 'max', label: 'Max' },
    { value: 'median', label: 'Median' },
    { value: 'std', label: 'Std Dev' },
    { value: 'count', label: 'Count' },
    { value: 'first', label: 'First' },
    { value: 'last', label: 'Last' },
    { value: 'formula', label: 'Custom Formula' },
];

type PeriodOption = 'all' | KPIPeriodPreset | 'custom';

const PERIOD_OPTIONS: { value: PeriodOption; label: string }[] = [
    { value: 'all', label: 'All (global filter)' },
    { value: '12h', label: 'Last 12 hours' },
    { value: '24h', label: 'Last 24 hours' },
    { value: '7d', label: 'Last week' },
    { value: '30d', label: 'Last month' },
    { value: '90d', label: 'Last 90 days' },
    { value: '1y', label: 'Last year' },
    { value: 'custom', label: 'Custom range…' },
];

const periodToOption = (period: KPIMetricPeriod | null | undefined): PeriodOption => {
    if (!period || period.mode === 'all') return 'all';
    if (period.mode === 'preset' && period.preset) return period.preset;
    if (period.mode === 'custom') return 'custom';
    return 'all';
};

const optionToPeriod = (
    value: PeriodOption,
    existing: KPIMetricPeriod | null | undefined,
): KPIMetricPeriod | null => {
    if (value === 'all') return null;
    if (value === 'custom') {
        return {
            mode: 'custom',
            start: existing?.mode === 'custom' ? existing.start ?? null : null,
            end: existing?.mode === 'custom' ? existing.end ?? null : null,
        };
    }
    return { mode: 'preset', preset: value };
};

const uuid = () =>
    (globalThis.crypto as { randomUUID?: () => string } | undefined)?.randomUUID?.() ??
    `kpi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const KPISettings: React.FC<KPISettingsProps> = ({
    config,
    numericColumns,
    onUpdate,
    onOpenFormula,
}) => {
    if (config.viz_type !== 'kpi') return null;

    const kpi = config.kpi;
    const columnOptions = useMemo(
        () => numericColumns.map(c => ({ value: c, label: c })),
        [numericColumns],
    );

    const updateKpi = (updates: Partial<typeof kpi>) => {
        onUpdate({ kpi: { ...kpi, ...updates } });
    };

    const updateMetric = (id: string, updates: Partial<KPIMetric>) => {
        updateKpi({
            metrics: kpi.metrics.map(m => (m.id === id ? { ...m, ...updates } : m)),
        });
    };

    const addMetric = () => {
        const newMetric: KPIMetric = {
            id: uuid(),
            label: `Metric ${kpi.metrics.length + 1}`,
            operation: 'avg',
            column: numericColumns[0],
            decimals: 2,
            color: CHART_COLORS[kpi.metrics.length % CHART_COLORS.length],
        };
        updateKpi({ metrics: [...kpi.metrics, newMetric] });
    };

    const deleteMetric = (id: string) => {
        updateKpi({ metrics: kpi.metrics.filter(m => m.id !== id) });
    };

    const moveMetric = (id: string, direction: -1 | 1) => {
        const idx = kpi.metrics.findIndex(m => m.id === id);
        const target = idx + direction;
        if (idx < 0 || target < 0 || target >= kpi.metrics.length) return;
        const next = [...kpi.metrics];
        [next[idx], next[target]] = [next[target], next[idx]];
        updateKpi({ metrics: next });
    };

    return (
        <div className="space-y-4">
            <Divider />
            <h4 className="text-sm font-medium text-foreground">KPI / Summary</h4>

            {/* Layout controls */}
            <div className="grid grid-cols-2 gap-3 items-end">
                <NumberInput
                    label="Columns per row"
                    value={kpi.columns_per_row}
                    min={1}
                    max={6}
                    step={1}
                    onChange={(e) => {
                        const num = parseInt(e.target.value);
                        if (!isNaN(num)) {
                            updateKpi({ columns_per_row: Math.max(1, Math.min(6, num)) });
                        }
                    }}
                />
                <label className="flex items-center gap-2 pb-2 cursor-pointer">
                    <Checkbox
                        id="kpi-compact"
                        checked={kpi.compact}
                        onChange={() => updateKpi({ compact: !kpi.compact })}
                    />
                    <span className="text-sm text-foreground">Compact cards</span>
                </label>
            </div>

            <Divider />

            {/* Metrics list */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Metrics ({kpi.metrics.length})
                    </p>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={addMetric}
                        className="h-7 text-xs gap-1"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add Metric
                    </Button>
                </div>

                {kpi.metrics.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border rounded-md">
                        No metrics yet. Click "Add Metric" to create one.
                    </p>
                )}

                <div className="space-y-3">
                    {kpi.metrics.map((metric, index) => {
                        const isFormula = metric.operation === 'formula';
                        return (
                            <div
                                key={metric.id}
                                className="p-3 rounded-lg border border-border bg-muted/20 space-y-3"
                            >
                                {/* Header: reorder + label + delete */}
                                <div className="flex items-center gap-2">
                                    <div className="flex flex-col">
                                        <button
                                            type="button"
                                            onClick={() => moveMetric(metric.id, -1)}
                                            disabled={index === 0}
                                            title="Move up"
                                            className="text-muted-foreground/60 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <GripVertical className="w-3 h-3 -mb-1" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => moveMetric(metric.id, 1)}
                                            disabled={index === kpi.metrics.length - 1}
                                            title="Move down"
                                            className="text-muted-foreground/60 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <GripVertical className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="flex-1">
                                        <DebouncedInput
                                            value={metric.label}
                                            onChange={(value) => updateMetric(metric.id, { label: value })}
                                            placeholder="Metric label"
                                            className="text-sm font-medium"
                                            debounceMs={300}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => deleteMetric(metric.id)}
                                        title="Delete metric"
                                        className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                {/* Operation + Column (or Formula button) */}
                                <div className="grid grid-cols-2 gap-2">
                                    <Select
                                        label="Operation"
                                        options={OPERATION_OPTIONS}
                                        value={metric.operation}
                                        onChange={(e) =>
                                            updateMetric(metric.id, {
                                                operation: e.target.value as KPIOperation,
                                            })
                                        }
                                    />
                                    {isFormula ? (
                                        <div className="space-y-1">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-gray-300">
                                                Formula
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => onOpenFormula(metric.id)}
                                                className="w-full h-9 px-3 text-left bg-muted/50 dark:bg-muted/30 border border-border rounded-md hover:border-muted-foreground/30 transition-colors flex items-center justify-between gap-2 group"
                                            >
                                                <span className="font-mono text-xs text-muted-foreground truncate">
                                                    {metric.formula?.trim() || 'Click to edit…'}
                                                </span>
                                                <Maximize2 className="w-3 h-3 text-primary/80 shrink-0" />
                                            </button>
                                        </div>
                                    ) : (
                                        <SearchableSelect
                                            label="Column"
                                            options={columnOptions}
                                            value={metric.column || ''}
                                            onChange={(e) =>
                                                updateMetric(metric.id, { column: e.target.value })
                                            }
                                            placeholder="Select column…"
                                        />
                                    )}
                                </div>

                                {/* Period: preset or custom range. Overrides the global date filter for this metric. */}
                                <div className="space-y-2">
                                    <Select
                                        label="Period"
                                        options={PERIOD_OPTIONS}
                                        value={periodToOption(metric.period)}
                                        onChange={(e) =>
                                            updateMetric(metric.id, {
                                                period: optionToPeriod(
                                                    e.target.value as PeriodOption,
                                                    metric.period,
                                                ),
                                            })
                                        }
                                    />
                                    {metric.period?.mode === 'custom' && (
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <label className="text-xs font-medium text-muted-foreground">Start</label>
                                                <input
                                                    type="datetime-local"
                                                    value={metric.period?.start ?? ''}
                                                    onChange={(e) =>
                                                        updateMetric(metric.id, {
                                                            period: {
                                                                mode: 'custom',
                                                                start: e.target.value || null,
                                                                end: metric.period?.end ?? null,
                                                            },
                                                        })
                                                    }
                                                    className="w-full h-9 px-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-medium text-muted-foreground">End</label>
                                                <input
                                                    type="datetime-local"
                                                    value={metric.period?.end ?? ''}
                                                    onChange={(e) =>
                                                        updateMetric(metric.id, {
                                                            period: {
                                                                mode: 'custom',
                                                                start: metric.period?.start ?? null,
                                                                end: e.target.value || null,
                                                            },
                                                        })
                                                    }
                                                    className="w-full h-9 px-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Formatting: unit + decimals + color */}
                                <div className="grid grid-cols-3 gap-2 items-end">
                                    <DebouncedInput
                                        label="Unit"
                                        value={metric.unit || ''}
                                        onChange={(value) =>
                                            updateMetric(metric.id, { unit: value || undefined })
                                        }
                                        placeholder="e.g. kWh"
                                        debounceMs={300}
                                    />
                                    <NumberInput
                                        label="Decimals"
                                        value={metric.decimals}
                                        min={0}
                                        max={10}
                                        step={1}
                                        onChange={(e) => {
                                            const num = parseInt(e.target.value);
                                            if (!isNaN(num)) {
                                                updateMetric(metric.id, {
                                                    decimals: Math.max(0, Math.min(10, num)),
                                                });
                                            }
                                        }}
                                    />
                                    <div className="space-y-1">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-gray-300">
                                            Color
                                        </label>
                                        <CustomColorPicker
                                            value={metric.color || CHART_COLORS[index % CHART_COLORS.length]}
                                            onChange={(value) =>
                                                updateMetric(metric.id, { color: value })
                                            }
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
