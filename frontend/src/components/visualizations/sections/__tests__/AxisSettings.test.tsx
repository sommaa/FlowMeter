import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AxisSettings } from '../AxisSettings';
import { VisualizationConfig } from '@/types';

const makeConfig = (overrides: any = {}): VisualizationConfig => ({
    id: 'test-1',
    title: 'Test',
    viz_type: 'universal',
    axis: {
        x_axis: 'Index',
        y_axis: ['Temperature'],
        x_axis_scale: 'linear',
        y_axis_scale: 'linear',
        enable_y_axis_range: false,
        enable_x_axis_range: false,
        enable_y2_axis_range: false,
        ...overrides.axis,
    },
    style: { custom_colors: {}, ...overrides.style },
    legend: { labels: [] },
    regression: { predictors: [], added: false, degree: 1 },
    formula: { input: undefined, x_formula: undefined, add_regression: false, regression_degree: 1 },
    limits: { thresholds: [], ...overrides.limits },
    series_configs: {},
    pca: { components: 2, show_loadings: true },
    fft: { window_type: 'hann', detrend: 'linear', frequency_unit: 'hz', normalize: false, x_axis_scale: 'linear', y_axis_scale: 'linear', overlap: 0.5 },
    root_cause: { target_variable: '', methods: ['pearson'], max_lag: 10, top_n: 5, min_correlation: 0.3, include_variables: [] },
    ...overrides,
} as any);

describe('AxisSettings', () => {
    it('renders axis labels section', () => {
        const onUpdate = vi.fn();
        render(<AxisSettings config={makeConfig()} onUpdate={onUpdate} />);
        expect(screen.getByText('Axis Labels')).toBeTruthy();
    });

    it('renders X-Axis Label input', () => {
        const onUpdate = vi.fn();
        render(<AxisSettings config={makeConfig()} onUpdate={onUpdate} />);
        expect(screen.getByText('X-Axis Label')).toBeTruthy();
    });

    it('renders Y-Axis Label input', () => {
        const onUpdate = vi.fn();
        render(<AxisSettings config={makeConfig()} onUpdate={onUpdate} />);
        expect(screen.getByText('Y-Axis Label')).toBeTruthy();
    });

    it('shows axis scales for universal type', () => {
        const onUpdate = vi.fn();
        render(<AxisSettings config={makeConfig()} onUpdate={onUpdate} />);
        expect(screen.getByText('Axis Scales')).toBeTruthy();
    });

    it('hides axis scales for pca type', () => {
        const onUpdate = vi.fn();
        render(<AxisSettings config={makeConfig({ viz_type: 'pca' })} onUpdate={onUpdate} />);
        expect(screen.queryByText('Axis Scales')).toBeNull();
    });

    it('hides axis scales for correlation type', () => {
        const onUpdate = vi.fn();
        render(<AxisSettings config={makeConfig({ viz_type: 'correlation' })} onUpdate={onUpdate} />);
        expect(screen.queryByText('Axis Scales')).toBeNull();
    });

    it('shows reference lines section', () => {
        const onUpdate = vi.fn();
        render(<AxisSettings config={makeConfig()} onUpdate={onUpdate} />);
        expect(screen.getByText('Reference Lines')).toBeTruthy();
    });

    it('shows empty threshold message when no thresholds', () => {
        const onUpdate = vi.fn();
        render(<AxisSettings config={makeConfig()} onUpdate={onUpdate} />);
        expect(screen.getByText('No thresholds added.')).toBeTruthy();
    });

    it('shows add line button', () => {
        const onUpdate = vi.fn();
        render(<AxisSettings config={makeConfig()} onUpdate={onUpdate} />);
        expect(screen.getByText('Add Line')).toBeTruthy();
    });

    it('calls onUpdate when add line clicked', () => {
        const onUpdate = vi.fn();
        // Mock crypto.randomUUID
        const originalRandomUUID = crypto.randomUUID;
        crypto.randomUUID = vi.fn().mockReturnValue('test-uuid');

        render(<AxisSettings config={makeConfig()} onUpdate={onUpdate} />);
        fireEvent.click(screen.getByText('Add Line'));

        expect(onUpdate).toHaveBeenCalledWith({
            limits: {
                thresholds: expect.arrayContaining([
                    expect.objectContaining({ value: 0, label: 'Limit', color: '#ff0000' })
                ])
            }
        });

        crypto.randomUUID = originalRandomUUID;
    });

    it('renders Y-Axis Range section', () => {
        const onUpdate = vi.fn();
        render(<AxisSettings config={makeConfig()} onUpdate={onUpdate} />);
        expect(screen.getByText('Y-Axis Range')).toBeTruthy();
    });

    it('renders Secondary Y-Axis Range section', () => {
        const onUpdate = vi.fn();
        render(<AxisSettings config={makeConfig()} onUpdate={onUpdate} />);
        expect(screen.getByText('Secondary Y-Axis Range')).toBeTruthy();
    });

    it('hides x-axis range for box type', () => {
        const onUpdate = vi.fn();
        render(<AxisSettings config={makeConfig({ viz_type: 'box' })} onUpdate={onUpdate} />);
        expect(screen.queryByText('X-Axis Range')).toBeNull();
    });

    it('shows stacking disabled tooltip when stacking is enabled', () => {
        const onUpdate = vi.fn();
        render(<AxisSettings config={makeConfig({ style: { enable_stacking: true, custom_colors: {} } })} onUpdate={onUpdate} />);
        expect(screen.getByText('(Disabled by Stacking)')).toBeTruthy();
    });
});
