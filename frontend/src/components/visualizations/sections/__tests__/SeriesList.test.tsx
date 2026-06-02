import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeriesList } from '../SeriesList';
import { VisualizationConfig } from '@/types';

const makeConfig = (overrides: any = {}): VisualizationConfig => ({
    id: 'test-1',
    title: 'Test',
    viz_type: 'universal',
    axis: { x_axis: 'Index', y_axis: [], ...overrides.axis },
    style: { custom_colors: {}, ...overrides.style },
    legend: { labels: [], ...overrides.legend },
    regression: { predictors: [], added: false, degree: 1 },
    formula: { input: undefined, x_formula: undefined, add_regression: false, regression_degree: 1 },
    limits: { thresholds: [] },
    series_configs: { ...overrides.series_configs },
    pca: { components: 2, show_loadings: true },
    fft: { window_type: 'hann', detrend: 'linear', frequency_unit: 'hz', normalize: false, x_axis_scale: 'linear', y_axis_scale: 'linear', overlap: 0.5 },
    root_cause: { target_variable: '', methods: ['pearson'], max_lag: 10, top_n: 5, min_correlation: 0.3, include_variables: [] },
    ...overrides,
} as any);

const numericColumns = ['Temperature', 'Pressure', 'Flow', 'Level'];

describe('SeriesList', () => {
    it('renders for universal viz type', () => {
        const onUpdate = vi.fn();
        render(<SeriesList config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} />);
        expect(screen.getByText('Add Series')).toBeTruthy();
    });

    it('returns null for formula viz type', () => {
        const onUpdate = vi.fn();
        const { container } = render(
            <SeriesList config={makeConfig({ viz_type: 'formula' })} numericColumns={numericColumns} onUpdate={onUpdate} />
        );
        expect(container.innerHTML).toBe('');
    });

    it('returns null for root_cause viz type', () => {
        const onUpdate = vi.fn();
        const { container } = render(
            <SeriesList config={makeConfig({ viz_type: 'root_cause' })} numericColumns={numericColumns} onUpdate={onUpdate} />
        );
        expect(container.innerHTML).toBe('');
    });

    it('shows empty state when no series selected', () => {
        const onUpdate = vi.fn();
        render(<SeriesList config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} />);
        expect(screen.getByText('No series selected. Add a variable to plot.')).toBeTruthy();
    });

    it('renders series cards for selected variables', () => {
        const onUpdate = vi.fn();
        render(<SeriesList config={makeConfig({ axis: { x_axis: 'Index', y_axis: ['Temperature', 'Pressure'] } })} numericColumns={numericColumns} onUpdate={onUpdate} />);
        // Cards start collapsed, showing the series name as header text
        expect(screen.getByText('Temperature')).toBeTruthy();
        expect(screen.getByText('Pressure')).toBeTruthy();
    });

    it('shows stack areas toggle for area viz type', () => {
        const onUpdate = vi.fn();
        render(<SeriesList config={makeConfig({ viz_type: 'area', axis: { x_axis: 'Index', y_axis: ['Temperature'] } })} numericColumns={numericColumns} onUpdate={onUpdate} />);
        expect(screen.getByText('Stack Areas')).toBeTruthy();
    });

    it('hides stack areas toggle for non-area types', () => {
        const onUpdate = vi.fn();
        render(<SeriesList config={makeConfig({ viz_type: 'universal', axis: { x_axis: 'Index', y_axis: ['Temperature'] } })} numericColumns={numericColumns} onUpdate={onUpdate} />);
        expect(screen.queryByText('Stack Areas')).toBeNull();
    });

    it('shows placeholder for regression type', () => {
        const onUpdate = vi.fn();
        render(<SeriesList config={makeConfig({ viz_type: 'regression' })} numericColumns={numericColumns} onUpdate={onUpdate} />);
        // SearchableSelect renders button with placeholder as span text
        expect(screen.getByText('Select target variable...')).toBeTruthy();
    });
});
