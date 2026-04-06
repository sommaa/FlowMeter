import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FFTSettings } from '../FFTSettings';
import { VisualizationConfig } from '@/types';

const makeConfig = (overrides: any = {}): VisualizationConfig => ({
    id: 'test-1',
    title: 'Test',
    viz_type: 'fft',
    axis: { x_axis: 'Index', y_axis: [] },
    style: { custom_colors: {} },
    legend: { labels: [] },
    regression: { predictors: [], added: false, degree: 1 },
    formula: { input: undefined, x_formula: undefined, add_regression: false, regression_degree: 1 },
    limits: { thresholds: [] },
    series_configs: {},
    pca: { components: 2, show_loadings: true },
    fft: {
        window_type: 'hann',
        detrend: 'linear',
        frequency_unit: 'hz',
        normalize: false,
        x_axis_scale: 'linear',
        y_axis_scale: 'linear',
        overlap: 0.5,
        ...overrides.fft,
    },
    root_cause: { target_variable: '', methods: ['pearson'], max_lag: 10, top_n: 5, min_correlation: 0.3, include_variables: [] },
    ...overrides,
} as any);

describe('FFTSettings', () => {
    it('renders when viz_type is fft', () => {
        const onUpdate = vi.fn();
        render(<FFTSettings config={makeConfig()} onUpdate={onUpdate} />);
        expect(screen.getByText('FFT Analysis Settings')).toBeTruthy();
    });

    it('returns null when viz_type is not fft', () => {
        const onUpdate = vi.fn();
        const { container } = render(<FFTSettings config={makeConfig({ viz_type: 'universal' })} onUpdate={onUpdate} />);
        expect(container.innerHTML).toBe('');
    });

    it('renders window type selector', () => {
        const onUpdate = vi.fn();
        render(<FFTSettings config={makeConfig()} onUpdate={onUpdate} />);
        expect(screen.getByText('Window Type')).toBeTruthy();
    });

    it('renders detrending selector', () => {
        const onUpdate = vi.fn();
        render(<FFTSettings config={makeConfig()} onUpdate={onUpdate} />);
        expect(screen.getByText('Detrending')).toBeTruthy();
    });

    it('renders frequency unit selector', () => {
        const onUpdate = vi.fn();
        render(<FFTSettings config={makeConfig()} onUpdate={onUpdate} />);
        expect(screen.getByText('Frequency Unit')).toBeTruthy();
    });

    it('renders normalize checkbox', () => {
        const onUpdate = vi.fn();
        render(<FFTSettings config={makeConfig()} onUpdate={onUpdate} />);
        expect(screen.getByText('Normalize Power (Divide by Total)')).toBeTruthy();
    });

    it('renders axis scale selectors', () => {
        const onUpdate = vi.fn();
        render(<FFTSettings config={makeConfig()} onUpdate={onUpdate} />);
        expect(screen.getByText('X-Axis Scale')).toBeTruthy();
        expect(screen.getByText('Y-Axis Scale')).toBeTruthy();
    });

    it('renders window size input', () => {
        const onUpdate = vi.fn();
        render(<FFTSettings config={makeConfig()} onUpdate={onUpdate} />);
        expect(screen.getByText('Window Size (Samples)')).toBeTruthy();
    });
});
