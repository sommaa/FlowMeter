import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormulaSettings } from '../FormulaSettings';
import { VisualizationConfig } from '@/types';

const makeConfig = (overrides: any = {}): VisualizationConfig => ({
    id: 'test-1',
    title: 'Test',
    viz_type: 'formula',
    axis: { x_axis: 'Index', y_axis: [] },
    style: { custom_colors: {}, ...overrides.style },
    legend: { labels: [], ...overrides.legend },
    regression: { predictors: [], added: false, degree: 1 },
    formula: {
        input: undefined,
        x_formula: undefined,
        add_regression: false,
        regression_degree: 1,
        result_configs: {},
        ...overrides.formula,
    },
    limits: { thresholds: [] },
    series_configs: {},
    pca: { components: 2, show_loadings: true },
    fft: { window_type: 'hann', detrend: 'linear', frequency_unit: 'hz', normalize: false, x_axis_scale: 'linear', y_axis_scale: 'linear', overlap: 0.5 },
    root_cause: { target_variable: '', methods: ['pearson'], max_lag: 10, top_n: 5, min_correlation: 0.3, include_variables: [] },
    ...overrides,
} as any);

describe('FormulaSettings', () => {
    it('renders when viz_type is formula', () => {
        const onUpdate = vi.fn();
        render(<FormulaSettings config={makeConfig()} onUpdate={onUpdate} onOpenFormula={vi.fn()} />);
        expect(screen.getByText('Formula')).toBeTruthy();
    });

    it('returns null when viz_type is not formula', () => {
        const onUpdate = vi.fn();
        const { container } = render(
            <FormulaSettings config={makeConfig({ viz_type: 'universal' })} onUpdate={onUpdate} onOpenFormula={vi.fn()} />
        );
        expect(container.innerHTML).toBe('');
    });

    it('shows empty state when no formula input', () => {
        const onUpdate = vi.fn();
        render(<FormulaSettings config={makeConfig()} onUpdate={onUpdate} onOpenFormula={vi.fn()} />);
        expect(screen.getByText('Click to edit formula')).toBeTruthy();
    });

    it('shows formula preview when formula exists', () => {
        const onUpdate = vi.fn();
        render(<FormulaSettings config={makeConfig({ formula: { input: "result = col['Temp'] * 2" } })} onUpdate={onUpdate} onOpenFormula={vi.fn()} />);
        expect(screen.getByText("result = col['Temp'] * 2")).toBeTruthy();
    });

    it('calls onOpenFormula when clicking formula button', () => {
        const onOpenFormula = vi.fn();
        render(<FormulaSettings config={makeConfig()} onUpdate={vi.fn()} onOpenFormula={onOpenFormula} />);
        fireEvent.click(screen.getByText('Click to edit formula'));
        expect(onOpenFormula).toHaveBeenCalled();
    });

    it('detects single result variable', () => {
        const onUpdate = vi.fn();
        render(<FormulaSettings config={makeConfig({ formula: { input: "result = col['Temp'] * 2" } })} onUpdate={onUpdate} onOpenFormula={vi.fn()} />);
        // The collapsed SeriesCard for 'result' shows the key name as header text
        expect(screen.getByText('result')).toBeTruthy();
    });

    it('detects multiple result variables', () => {
        const onUpdate = vi.fn();
        render(<FormulaSettings config={makeConfig({ formula: { input: "result1 = col['Temp']\nresult2 = col['Press']" } })} onUpdate={onUpdate} onOpenFormula={vi.fn()} />);
        expect(screen.getByText('result1')).toBeTruthy();
        expect(screen.getByText('result2')).toBeTruthy();
    });

    it('falls back to result when no matches found', () => {
        const onUpdate = vi.fn();
        render(<FormulaSettings config={makeConfig({ formula: { input: "x = 5" } })} onUpdate={onUpdate} onOpenFormula={vi.fn()} />);
        expect(screen.getByText('result')).toBeTruthy();
    });
});
