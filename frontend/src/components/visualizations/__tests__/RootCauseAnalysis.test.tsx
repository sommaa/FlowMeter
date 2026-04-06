import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useStore } from '@/store';

vi.mock('@/store', () => ({
    useStore: vi.fn(),
}));

vi.mock('react-plotly.js', () => ({
    default: (props: any) => <div data-testid="plotly-chart">Plotly</div>,
}));

describe('RootCauseAnalysis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useStore).mockImplementation((selector: any) =>
            selector({ isDarkMode: false })
        );
    });

    const makeRcaData = () => ({
        root_cause_analysis: {
            target_variable: 'Temperature',
            ranking: [
                { variable: 'Pressure', score: 85.2, pearson: 0.89, lag_samples: 5, granger_type: 'CAUSE' },
                { variable: 'Flow', score: 62.3, pearson: -0.71, lag_samples: 0, granger_type: 'FEEDBACK' },
            ],
        },
    } as any);

    it('renders without crashing with data', async () => {
        const { RootCauseAnalysis } = await import('../RootCauseAnalysis');
        const { container } = render(<RootCauseAnalysis data={makeRcaData()} />);
        expect(container.innerHTML).toBeTruthy();
    });

    it('returns null with empty data', async () => {
        const { RootCauseAnalysis } = await import('../RootCauseAnalysis');
        const emptyData = { root_cause_analysis: null } as any;
        const { container } = render(<RootCauseAnalysis data={emptyData} />);
        // Component returns null when no root_cause_analysis
        expect(container.innerHTML).toBe('');
    });

    it('accepts height prop', async () => {
        const { RootCauseAnalysis } = await import('../RootCauseAnalysis');
        const { container } = render(<RootCauseAnalysis data={makeRcaData()} height={600} />);
        expect(container.innerHTML).toBeTruthy();
    });

    it('accepts config prop', async () => {
        const { RootCauseAnalysis } = await import('../RootCauseAnalysis');
        const config = {
            viz_type: 'root_cause',
            root_cause: { result_plot: 'ranking', target_variable: 'Temp', methods: ['pearson'], max_lag: 10, top_n: 5, min_correlation: 0.3 },
        } as any;

        const { container } = render(<RootCauseAnalysis data={makeRcaData()} config={config} />);
        expect(container.innerHTML).toBeTruthy();
    });
});
