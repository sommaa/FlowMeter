import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KPISettings } from '../KPISettings';
import { VisualizationConfig } from '@/types';

const makeConfig = (overrides: any = {}): VisualizationConfig => ({
    id: 'test-1',
    title: 'Test',
    viz_type: 'kpi',
    axis: { x_axis: 'Index', y_axis: [], enable_y_axis_range: false, multi_axis_plot_type: 'Line' },
    style: { color_index: 0, alpha: 1, enable_stacking: false, custom_colors: {} },
    legend: { labels: [] },
    regression: { added: false, degree: 1, remove_outliers: false, show_confidence_interval: false, model_type: 'linear' },
    formula: { plot_type: 'Line', add_regression: false, regression_degree: 1, regression_remove_outliers: false },
    limits: { thresholds: [] },
    pca: { components: 2, show_loadings: true },
    fft: { window_type: 'hann', detrend: 'linear', frequency_unit: 'hz', normalize: false, x_axis_scale: 'linear', y_axis_scale: 'log', overlap: 0.5 },
    root_cause: { max_lag: 10, top_n: 5, methods: [], significance_threshold: 0.05, min_correlation: 0.1, include_variables: [], result_plot: 'ranking' },
    kpi: {
        metrics: [],
        columns_per_row: 3,
        compact: false,
        ...overrides.kpi,
    },
    ...overrides,
} as any);

const numericColumns = ['power', 'flow', 'temp'];

describe('KPISettings', () => {
    it('returns null when viz_type is not kpi', () => {
        const { container } = render(
            <KPISettings
                config={makeConfig({ viz_type: 'universal' })}
                numericColumns={numericColumns}
                onUpdate={vi.fn()}
                onOpenFormula={vi.fn()}
            />
        );
        expect(container.innerHTML).toBe('');
    });

    it('renders header and Add Metric button when no metrics', () => {
        render(
            <KPISettings
                config={makeConfig()}
                numericColumns={numericColumns}
                onUpdate={vi.fn()}
                onOpenFormula={vi.fn()}
            />
        );
        expect(screen.getByText('KPI / Summary')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /add metric/i })).toBeInTheDocument();
        expect(screen.getByText(/no metrics yet/i)).toBeInTheDocument();
    });

    it('adding a metric calls onUpdate with a new metric in the list', () => {
        const onUpdate = vi.fn();
        render(
            <KPISettings
                config={makeConfig()}
                numericColumns={numericColumns}
                onUpdate={onUpdate}
                onOpenFormula={vi.fn()}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: /add metric/i }));
        expect(onUpdate).toHaveBeenCalledTimes(1);
        const payload = onUpdate.mock.calls[0][0];
        expect(payload.kpi.metrics).toHaveLength(1);
        expect(payload.kpi.metrics[0].operation).toBe('avg');
        expect(payload.kpi.metrics[0].id).toBeTruthy();
    });

    it('deletes a metric when trash button clicked', () => {
        const onUpdate = vi.fn();
        const cfg = makeConfig({
            kpi: {
                metrics: [
                    { id: 'a', label: 'A', operation: 'sum', column: 'power', decimals: 2 },
                    { id: 'b', label: 'B', operation: 'avg', column: 'flow', decimals: 2 },
                ],
                columns_per_row: 3,
                compact: false,
            },
        });
        render(
            <KPISettings
                config={cfg}
                numericColumns={numericColumns}
                onUpdate={onUpdate}
                onOpenFormula={vi.fn()}
            />
        );
        const deleteButtons = screen.getAllByTitle(/delete metric/i);
        fireEvent.click(deleteButtons[0]);
        expect(onUpdate).toHaveBeenCalled();
        const payload = onUpdate.mock.calls[0][0];
        expect(payload.kpi.metrics).toHaveLength(1);
        expect(payload.kpi.metrics[0].id).toBe('b');
    });

    it('reorders metrics with move-down button', () => {
        const onUpdate = vi.fn();
        const cfg = makeConfig({
            kpi: {
                metrics: [
                    { id: 'a', label: 'A', operation: 'sum', column: 'power', decimals: 2 },
                    { id: 'b', label: 'B', operation: 'avg', column: 'flow', decimals: 2 },
                ],
                columns_per_row: 3,
                compact: false,
            },
        });
        render(
            <KPISettings
                config={cfg}
                numericColumns={numericColumns}
                onUpdate={onUpdate}
                onOpenFormula={vi.fn()}
            />
        );
        const moveDownButtons = screen.getAllByTitle(/move down/i);
        fireEvent.click(moveDownButtons[0]);
        expect(onUpdate).toHaveBeenCalled();
        const payload = onUpdate.mock.calls[0][0];
        expect(payload.kpi.metrics.map((m: any) => m.id)).toEqual(['b', 'a']);
    });

    it('calls onOpenFormula with metric id when editing a formula metric', () => {
        const onOpenFormula = vi.fn();
        const cfg = makeConfig({
            kpi: {
                metrics: [
                    { id: 'm-1', label: 'Custom', operation: 'formula', formula: '', decimals: 2 },
                ],
                columns_per_row: 3,
                compact: false,
            },
        });
        render(
            <KPISettings
                config={cfg}
                numericColumns={numericColumns}
                onUpdate={vi.fn()}
                onOpenFormula={onOpenFormula}
            />
        );
        fireEvent.click(screen.getByText(/click to edit/i));
        expect(onOpenFormula).toHaveBeenCalledWith('m-1');
    });
});
