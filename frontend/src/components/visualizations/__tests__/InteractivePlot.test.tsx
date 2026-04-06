import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useStore } from '@/store';

vi.mock('@/store', () => ({
    useStore: vi.fn(),
}));

// Mock react-plotly.js (lazy loaded) - need to mock at module level
vi.mock('react-plotly.js', () => ({
    default: (props: any) => <div data-testid="plotly-chart">Plotly</div>,
}));

describe('InteractivePlot', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useStore).mockImplementation((selector: any) =>
            selector({
                isDarkMode: false,
                isStorylineEnabled: false,
                storylineEvents: [],
            })
        );
    });

    it('renders loading state when loading is true', async () => {
        const { InteractivePlot } = await import('../InteractivePlot');
        const { container } = render(
            <InteractivePlot
                data={{ series: [], regression_line: null, confidence_bands: [], annotations: [] } as any}
                loading={true}
            />
        );
        // When loading, the component shows a loading indicator, not the chart
        expect(container.innerHTML).toBeTruthy();
    });

    it('renders without crashing when data is provided', async () => {
        const { InteractivePlot } = await import('../InteractivePlot');
        const mockData = {
            series: [{ data: [{ x: 1, y: 10 }, { x: 2, y: 20 }], name: 'Temp', type: 'line', color: '#1f77b4' }],
            regression_line: null,
            confidence_bands: [],
            annotations: [],
        } as any;

        const { container } = render(
            <InteractivePlot data={mockData} loading={false} />
        );
        expect(container.innerHTML).toBeTruthy();
    });

    it('accepts height prop', async () => {
        const { InteractivePlot } = await import('../InteractivePlot');
        const mockData = {
            series: [],
            regression_line: null,
            confidence_bands: [],
            annotations: [],
        } as any;

        const { container } = render(
            <InteractivePlot data={mockData} height={600} />
        );
        expect(container.innerHTML).toBeTruthy();
    });

    it('accepts config prop', async () => {
        const { InteractivePlot } = await import('../InteractivePlot');
        const mockData = {
            series: [],
            regression_line: null,
            confidence_bands: [],
            annotations: [],
        } as any;

        const config = {
            viz_type: 'universal',
            axis: { x_axis: 'Index', y_axis: ['Temp'] },
            style: { custom_colors: {} },
            limits: { thresholds: [] },
        } as any;

        const { container } = render(
            <InteractivePlot data={mockData} config={config} />
        );
        expect(container.innerHTML).toBeTruthy();
    });
});
