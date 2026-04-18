import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import KPIDisplay from '../KPIDisplay';
import { PlotDataResponse, VisualizationConfig } from '@/types';

const makeConfig = (metricsCount: number = 0): VisualizationConfig => ({
    id: 'test',
    title: 'Test',
    viz_type: 'kpi',
    axis: { x_axis: 'Index', y_axis: [], enable_y_axis_range: false, multi_axis_plot_type: 'Line' },
    style: { color_index: 0, alpha: 1, enable_stacking: false },
    legend: {},
    limits: { thresholds: [] },
    regression: { added: false, degree: 1, remove_outliers: false, show_confidence_interval: false, model_type: 'linear' },
    pca: { components: 2, show_loadings: false },
    formula: { plot_type: 'Line', add_regression: false, regression_degree: 1, regression_remove_outliers: false },
    fft: { overlap: 0.5, window_type: 'hann', detrend: 'linear', frequency_unit: 'hz', normalize: false, x_axis_scale: 'linear', y_axis_scale: 'log' },
    root_cause: { max_lag: 10, top_n: 5, methods: [], significance_threshold: 0.05, min_correlation: 0.1, include_variables: [], result_plot: 'ranking' },
    kpi: { metrics: Array.from({ length: metricsCount }, (_, i) => ({
        id: `m${i}`, label: `L${i}`, operation: 'sum', decimals: 2,
    })), columns_per_row: 3, compact: false },
});

const makeData = (values: Array<{ id: string; label: string; formatted: string; value: number | null; error?: string; color?: string }>): PlotDataResponse => ({
    title: 'Test',
    series: [],
    x_label: '',
    y_label: '',
    kpi: { values, columns_per_row: 3, compact: false, sample_count: 42 },
});

describe('KPIDisplay', () => {
    it('renders empty state when no values', () => {
        const data = makeData([]);
        render(<KPIDisplay data={data} config={makeConfig(0)} />);
        expect(screen.getByText(/add a metric to display/i)).toBeInTheDocument();
    });

    it('renders one card per metric with label and formatted value', () => {
        const data = makeData([
            { id: 'a', label: 'Total Flow', formatted: '1,234.5', value: 1234.5 },
            { id: 'b', label: 'Avg Temp', formatted: '22.0 °C', value: 22 },
        ]);
        render(<KPIDisplay data={data} config={makeConfig(2)} />);
        expect(screen.getByText('Total Flow')).toBeInTheDocument();
        expect(screen.getByText('1,234.5')).toBeInTheDocument();
        expect(screen.getByText('Avg Temp')).toBeInTheDocument();
        expect(screen.getByText('22.0 °C')).toBeInTheDocument();
    });

    it('shows sample count footer', () => {
        const data = makeData([{ id: 'a', label: 'X', formatted: '1', value: 1 }]);
        render(<KPIDisplay data={data} config={makeConfig(1)} />);
        expect(screen.getByText(/computed over 42 rows/i)).toBeInTheDocument();
    });

    it('surfaces per-metric errors', () => {
        const data = makeData([
            { id: 'bad', label: 'Bad', formatted: '—', value: null, error: 'Column missing' },
        ]);
        render(<KPIDisplay data={data} config={makeConfig(1)} />);
        // Error text appears at least once (once in line-clamp body; may also be title attr)
        expect(screen.getAllByText(/column missing/i).length).toBeGreaterThanOrEqual(1);
    });

    it('applies the metric color as inline style', () => {
        const data = makeData([
            { id: 'a', label: 'Styled', formatted: '9.9', value: 9.9, color: '#ff00aa' },
        ]);
        const { container } = render(<KPIDisplay data={data} config={makeConfig(1)} />);
        const styled = container.querySelector('[style*="color"]') as HTMLElement | null;
        expect(styled).not.toBeNull();
        // JSDOM normalizes hex to rgb(255, 0, 170)
        expect(styled?.getAttribute('style')).toMatch(/ff00aa|255,\s*0,\s*170/i);
    });

    it('clamps columns_per_row to a valid value', () => {
        const data = makeData([{ id: 'a', label: 'X', formatted: '1', value: 1 }]);
        const cfg = makeConfig(1);
        cfg.kpi.columns_per_row = 99;
        // Payload overrides config; render shouldn't crash
        render(<KPIDisplay data={{ ...data, kpi: { ...data.kpi!, columns_per_row: 99 } }} config={cfg} />);
        expect(screen.getByText('X')).toBeInTheDocument();
    });
});
