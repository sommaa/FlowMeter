import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RootCauseSettings } from '../RootCauseSettings';
import { VisualizationConfig } from '@/types';

const makeConfig = (overrides: any = {}): VisualizationConfig => ({
    id: 'test-1',
    title: 'Test',
    viz_type: 'root_cause',
    axis: { x_axis: 'Index', y_axis: [] },
    style: { custom_colors: {} },
    legend: { labels: [] },
    regression: { predictors: [], added: false, degree: 1 },
    formula: { input: undefined, x_formula: undefined, add_regression: false, regression_degree: 1 },
    limits: { thresholds: [] },
    series_configs: {},
    pca: { components: 2, show_loadings: true },
    fft: { window_type: 'hann', detrend: 'linear', frequency_unit: 'hz', normalize: false, x_axis_scale: 'linear', y_axis_scale: 'linear', overlap: 0.5 },
    root_cause: {
        target_variable: 'Temperature',
        methods: ['pearson', 'cross_corr'],
        max_lag: 10,
        top_n: 5,
        min_correlation: 0.3,
        include_variables: [],
        result_plot: 'ranking',
        ...overrides.root_cause,
    },
    ...overrides,
} as any);

const numericColumns = ['Temperature', 'Pressure', 'Flow', 'Level', 'Speed'];

describe('RootCauseSettings', () => {
    it('renders when viz_type is root_cause', () => {
        const onUpdate = vi.fn();
        render(<RootCauseSettings config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} />);
        expect(screen.getByText('Root Cause Analysis')).toBeTruthy();
    });

    it('returns null when viz_type is not root_cause', () => {
        const onUpdate = vi.fn();
        const { container } = render(
            <RootCauseSettings config={makeConfig({ viz_type: 'universal' })} numericColumns={numericColumns} onUpdate={onUpdate} />
        );
        expect(container.innerHTML).toBe('');
    });

    it('does not crash when a template viz has viz_type root_cause but no root_cause object', () => {
        const onUpdate = vi.fn();
        // Regression: RC templates can carry a root_cause viz with the config
        // object stripped. Previously this threw "rc is undefined" on open.
        const config = makeConfig({ root_cause: undefined });
        expect(config.root_cause).toBeUndefined();
        render(<RootCauseSettings config={config} numericColumns={numericColumns} onUpdate={onUpdate} />);
        // Falls back to DEFAULT_ROOT_CAUSE: panel renders, no target set so all
        // 5 columns are candidate variables.
        expect(screen.getByText('Root Cause Analysis')).toBeTruthy();
        expect(screen.getByText('Variables (5/5)')).toBeTruthy();
    });

    it('renders target variable selector', () => {
        const onUpdate = vi.fn();
        render(<RootCauseSettings config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} />);
        expect(screen.getByText('Target Variable')).toBeTruthy();
    });

    it('renders result plot selector', () => {
        const onUpdate = vi.fn();
        render(<RootCauseSettings config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} />);
        expect(screen.getByText('Result Plot')).toBeTruthy();
    });

    it('shows variable checkboxes excluding target', () => {
        const onUpdate = vi.fn();
        render(<RootCauseSettings config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} />);
        // Temperature is target, so 4 out of 5 should appear
        expect(screen.getByText('Pressure')).toBeTruthy();
        expect(screen.getByText('Flow')).toBeTruthy();
        expect(screen.getByText('Level')).toBeTruthy();
        expect(screen.getByText('Speed')).toBeTruthy();
    });

    it('shows variable count', () => {
        const onUpdate = vi.fn();
        render(<RootCauseSettings config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} />);
        // With empty include_variables, all 4 are selected
        expect(screen.getByText('Variables (4/4)')).toBeTruthy();
    });

    it('renders analysis method checkboxes', () => {
        const onUpdate = vi.fn();
        render(<RootCauseSettings config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} />);
        expect(screen.getByText('Pearson Correlation')).toBeTruthy();
        expect(screen.getByText('Cross-Correlation (Lag)')).toBeTruthy();
        expect(screen.getByText('Mutual Information')).toBeTruthy();
        expect(screen.getByText('Granger Causality')).toBeTruthy();
    });

    it('renders max lag input', () => {
        const onUpdate = vi.fn();
        render(<RootCauseSettings config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} />);
        expect(screen.getByText('Max Lag (Samples)')).toBeTruthy();
    });

    it('renders top N input', () => {
        const onUpdate = vi.fn();
        render(<RootCauseSettings config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} />);
        expect(screen.getByText('Top N Results')).toBeTruthy();
    });

    it('shows Select All / Deselect All toggle', () => {
        const onUpdate = vi.fn();
        render(<RootCauseSettings config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} />);
        expect(screen.getByText('Deselect All')).toBeTruthy();
    });
});
