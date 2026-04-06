import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GeneralSettings } from '../GeneralSettings';
import { VisualizationConfig } from '@/types';

const makeConfig = (overrides: Partial<VisualizationConfig> = {}): VisualizationConfig => ({
    id: 'test-1',
    title: 'Test',
    viz_type: 'universal',
    axis: { x_axis: 'Index', y_axis: [], ...overrides.axis },
    style: { custom_colors: {}, ...overrides.style },
    legend: { labels: [], ...overrides.legend },
    regression: { predictors: [], added: false, degree: 1, ...overrides.regression },
    formula: { input: undefined, x_formula: undefined, add_regression: false, regression_degree: 1, ...overrides.formula },
    limits: { thresholds: [] },
    series_configs: {},
    pca: { components: 2, show_loadings: true },
    fft: { window_type: 'hann', detrend: 'linear', frequency_unit: 'hz', normalize: false, x_axis_scale: 'linear', y_axis_scale: 'linear', overlap: 0.5 },
    root_cause: { target_variable: '', methods: ['pearson'], max_lag: 10, top_n: 5, min_correlation: 0.3, include_variables: [] },
    ...overrides,
} as any);

const xAxisOptions = [
    { value: 'Index', label: 'Timestamp' },
    { value: 'Custom Formula', label: 'Custom Formula' },
    { value: 'Temperature', label: 'Temperature' },
];

describe('GeneralSettings', () => {
    it('renders visualization type selector', () => {
        const onUpdate = vi.fn();
        render(<GeneralSettings config={makeConfig()} xAxisOptions={xAxisOptions} onUpdate={onUpdate} />);
        expect(screen.getByText('Visualization Type')).toBeTruthy();
    });

    it('shows x-axis selector for universal type', () => {
        const onUpdate = vi.fn();
        render(<GeneralSettings config={makeConfig({ viz_type: 'universal' })} xAxisOptions={xAxisOptions} onUpdate={onUpdate} />);
        expect(screen.getByText('X-Axis')).toBeTruthy();
    });

    it('hides x-axis selector for histogram type', () => {
        const onUpdate = vi.fn();
        render(<GeneralSettings config={makeConfig({ viz_type: 'hist' })} xAxisOptions={xAxisOptions} onUpdate={onUpdate} />);
        expect(screen.queryByText('X-Axis')).toBeNull();
    });

    it('hides x-axis selector for box type', () => {
        const onUpdate = vi.fn();
        render(<GeneralSettings config={makeConfig({ viz_type: 'box' })} xAxisOptions={xAxisOptions} onUpdate={onUpdate} />);
        expect(screen.queryByText('X-Axis')).toBeNull();
    });

    it('hides x-axis selector for pca type', () => {
        const onUpdate = vi.fn();
        render(<GeneralSettings config={makeConfig({ viz_type: 'pca' })} xAxisOptions={xAxisOptions} onUpdate={onUpdate} />);
        expect(screen.queryByText('X-Axis')).toBeNull();
    });

    it('shows colormap selector for correlation type', () => {
        const onUpdate = vi.fn();
        render(<GeneralSettings config={makeConfig({ viz_type: 'correlation' })} xAxisOptions={xAxisOptions} onUpdate={onUpdate} />);
        expect(screen.getByText('Colormap')).toBeTruthy();
    });

    it('hides colormap for non-correlation types', () => {
        const onUpdate = vi.fn();
        render(<GeneralSettings config={makeConfig({ viz_type: 'universal' })} xAxisOptions={xAxisOptions} onUpdate={onUpdate} />);
        expect(screen.queryByText('Colormap')).toBeNull();
    });

    it('shows x-axis for formula type', () => {
        const onUpdate = vi.fn();
        render(<GeneralSettings config={makeConfig({ viz_type: 'formula' })} xAxisOptions={xAxisOptions} onUpdate={onUpdate} />);
        expect(screen.getByText('X-Axis')).toBeTruthy();
    });
});
