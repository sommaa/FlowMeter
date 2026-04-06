import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RegressionSettings } from '../RegressionSettings';
import { VisualizationConfig } from '@/types';

const makeConfig = (overrides: any = {}): VisualizationConfig => ({
    id: 'test-1',
    title: 'Test',
    viz_type: 'regression',
    axis: { x_axis: 'Index', y_axis: ['Temperature'] },
    style: { custom_colors: {} },
    legend: { labels: [] },
    regression: {
        predictors: [],
        added: true,
        degree: 1,
        model_type: 'linear',
        remove_outliers: false,
        show_confidence_interval: true,
        line_color: '#f59e0b',
        ...overrides.regression,
    },
    formula: { input: undefined, x_formula: undefined, add_regression: false, regression_degree: 1 },
    limits: { thresholds: [] },
    series_configs: {},
    pca: { components: 2, show_loadings: true },
    fft: { window_type: 'hann', detrend: 'linear', frequency_unit: 'hz', normalize: false, x_axis_scale: 'linear', y_axis_scale: 'linear', overlap: 0.5 },
    root_cause: { target_variable: '', methods: ['pearson'], max_lag: 10, top_n: 5, min_correlation: 0.3, include_variables: [] },
    ...overrides,
} as any);

const numericColumns = ['Temperature', 'Pressure', 'Flow', 'Level'];

describe('RegressionSettings', () => {
    it('renders when viz_type is regression', () => {
        const onUpdate = vi.fn();
        render(<RegressionSettings config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} onOpenFormula={vi.fn()} />);
        expect(screen.getByText('Regression Model')).toBeTruthy();
    });

    it('returns null when viz_type is not regression', () => {
        const onUpdate = vi.fn();
        const { container } = render(
            <RegressionSettings config={makeConfig({ viz_type: 'universal' })} numericColumns={numericColumns} onUpdate={onUpdate} onOpenFormula={vi.fn()} />
        );
        expect(container.innerHTML).toBe('');
    });

    it('renders model type selector', () => {
        const onUpdate = vi.fn();
        render(<RegressionSettings config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} onOpenFormula={vi.fn()} />);
        expect(screen.getByText('Model Type')).toBeTruthy();
    });

    it('renders predictor selection for standard models', () => {
        const onUpdate = vi.fn();
        render(<RegressionSettings config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} onOpenFormula={vi.fn()} />);
        expect(screen.getByText('Predictors (X)')).toBeTruthy();
    });

    it('renders polynomial degree for linear model', () => {
        const onUpdate = vi.fn();
        render(<RegressionSettings config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} onOpenFormula={vi.fn()} />);
        expect(screen.getByText('Polynomial Degree')).toBeTruthy();
    });

    it('hides polynomial degree for random_forest', () => {
        const onUpdate = vi.fn();
        render(<RegressionSettings config={makeConfig({ regression: { model_type: 'random_forest', predictors: [], added: true, degree: 1 } })} numericColumns={numericColumns} onUpdate={onUpdate} onOpenFormula={vi.fn()} />);
        expect(screen.queryByText('Polynomial Degree')).toBeNull();
    });

    it('shows regularization for ridge model', () => {
        const onUpdate = vi.fn();
        render(<RegressionSettings config={makeConfig({ regression: { model_type: 'ridge', predictors: [], added: true, degree: 1, alpha: 1.0 } })} numericColumns={numericColumns} onUpdate={onUpdate} onOpenFormula={vi.fn()} />);
        expect(screen.getByText('Regularization Strength (Alpha)')).toBeTruthy();
    });

    it('shows L1 ratio for elastic_net model', () => {
        const onUpdate = vi.fn();
        render(<RegressionSettings config={makeConfig({ regression: { model_type: 'elastic_net', predictors: [], added: true, degree: 1, alpha: 1.0, l1_ratio: 0.5 } })} numericColumns={numericColumns} onUpdate={onUpdate} onOpenFormula={vi.fn()} />);
        expect(screen.getByText('L1 Ratio')).toBeTruthy();
    });

    it('renders confidence interval checkbox', () => {
        const onUpdate = vi.fn();
        render(<RegressionSettings config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} onOpenFormula={vi.fn()} />);
        expect(screen.getByText('Show Confidence Interval')).toBeTruthy();
    });

    it('shows random forest settings for RF model', () => {
        const onUpdate = vi.fn();
        render(<RegressionSettings config={makeConfig({ regression: { model_type: 'random_forest', predictors: [], added: true, degree: 1 } })} numericColumns={numericColumns} onUpdate={onUpdate} onOpenFormula={vi.fn()} />);
        expect(screen.getByText('Random Forest Settings')).toBeTruthy();
    });

    it('shows regression equation when provided', () => {
        const onUpdate = vi.fn();
        render(<RegressionSettings config={makeConfig()} numericColumns={numericColumns} onUpdate={onUpdate} onOpenFormula={vi.fn()} regressionEquation="y = 2x + 1" />);
        expect(screen.getByText('Regression Equation')).toBeTruthy();
    });

    it('shows custom formula editor for custom model type', () => {
        const onUpdate = vi.fn();
        render(<RegressionSettings config={makeConfig({ regression: { model_type: 'custom', predictors: [], added: true, degree: 1 } })} numericColumns={numericColumns} onUpdate={onUpdate} onOpenFormula={vi.fn()} />);
        // When model_type is 'custom', the Parameters and Initial Guesses inputs appear
        expect(screen.getByText('Parameters')).toBeTruthy();
        expect(screen.getByText('Initial Guesses')).toBeTruthy();
    });
});
