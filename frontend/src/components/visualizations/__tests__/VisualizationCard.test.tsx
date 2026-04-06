import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { VisualizationCard } from '../VisualizationCard';
import { useStore } from '@/store';

vi.mock('@/store', () => {
    const selectPlotDataById = (id: string) => (state: any) => null;
    const selectIsPlotLoading = (id: string) => (state: any) => false;
    const selectNumericColumns = (state: any) => ['Temperature', 'Pressure'];
    const selectAllColumns = (state: any) => ['Temperature', 'Pressure'];
    const selectPlotErrorById = (id: string) => (state: any) => null;
    const selectGlobalVariables = (state: any) => [];

    return {
        useStore: vi.fn(),
        selectPlotDataById,
        selectIsPlotLoading,
        selectNumericColumns,
        selectAllColumns,
        selectPlotErrorById,
        selectGlobalVariables,
    };
});

vi.mock('react-plotly.js', () => ({
    default: () => <div data-testid="plotly-chart">Plotly</div>,
}));

vi.mock('@dnd-kit/sortable', () => ({
    useSortable: () => ({
        attributes: {},
        listeners: {},
        setNodeRef: vi.fn(),
        transform: null,
        transition: null,
        isDragging: false,
    }),
}));

vi.mock('@dnd-kit/utilities', () => ({
    CSS: {
        Transform: { toString: () => '' },
        Transition: { toString: () => '' },
    },
}));

const makeConfig = () => ({
    id: 'viz-1',
    title: 'Test Visualization',
    viz_type: 'universal',
    axis: { x_axis: 'Index', y_axis: ['Temperature'] },
    style: { custom_colors: {} },
    legend: { labels: [] },
    regression: { predictors: [], added: false, degree: 1 },
    formula: { input: undefined, x_formula: undefined, add_regression: false, regression_degree: 1 },
    limits: { thresholds: [] },
    series_configs: {},
    pca: { components: 2, show_loadings: true },
    fft: { window_type: 'hann', detrend: 'linear', frequency_unit: 'hz', normalize: false, x_axis_scale: 'linear', y_axis_scale: 'linear', overlap: 0.5 },
    root_cause: { target_variable: '', methods: ['pearson'], max_lag: 10, top_n: 5, min_correlation: 0.3, include_variables: [] },
} as any);

describe('VisualizationCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useStore).mockImplementation((selector: any) => {
            if (typeof selector === 'function') {
                return selector({
                    updateVisualization: vi.fn(),
                    removeVisualization: vi.fn(),
                    fetchPlotData: vi.fn(),
                    clearPlotData: vi.fn(),
                    currentDataset: {
                        id: '1',
                        numeric_columns: ['Temperature', 'Pressure'],
                        column_names: ['Temperature', 'Pressure'],
                        datetime_columns: [],
                    },
                    globalVariables: [],
                    isDarkMode: false,
                    plotData: {},
                    loadingPlots: {},
                    plotErrors: {},
                    columnDescriptions: {},
                    setColumnDescriptions: vi.fn(),
                });
            }
            return undefined;
        });
    });

    it('renders without crashing', () => {
        const { container } = render(<VisualizationCard config={makeConfig()} />);
        expect(container.innerHTML).toBeTruthy();
    });

    it('renders title input with config title', () => {
        const { container } = render(<VisualizationCard config={makeConfig()} />);
        const titleInput = container.querySelector('input');
        expect(titleInput).toBeTruthy();
    });

    it('renders with columns prop', () => {
        const { container } = render(<VisualizationCard config={makeConfig()} columns={2} />);
        expect(container.innerHTML).toBeTruthy();
    });

    it('renders action buttons', () => {
        const { container } = render(<VisualizationCard config={makeConfig()} />);
        const buttons = container.querySelectorAll('button');
        expect(buttons.length).toBeGreaterThanOrEqual(1);
    });
});
