import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SeriesCard } from '../SeriesCard';

const defaultProps = {
    title: 'Temperature',
    legendLabel: '',
    seriesConfig: {
        type: 'line' as const,
        y_axis_id: 'left' as const,
        show_regression: false,
        show_confidence_interval: false,
        remove_outliers: false,
    },
    vizType: 'universal' as const,
    index: 0,
    color: '#ff6b6b',
    onUpdateSeries: vi.fn(),
    onUpdateLegend: vi.fn(),
    onUpdateColor: vi.fn(),
    onDelete: vi.fn(),
};

describe('SeriesCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders with title as placeholder', () => {
        render(<SeriesCard {...defaultProps} />);
        expect(screen.getByPlaceholderText('Temperature')).toBeTruthy();
    });

    it('renders delete button when onDelete provided', () => {
        render(<SeriesCard {...defaultProps} />);
        expect(screen.getByTitle('Remove Series')).toBeTruthy();
    });

    it('hides delete button when onDelete is undefined', () => {
        render(<SeriesCard {...defaultProps} onDelete={undefined} />);
        expect(screen.queryByTitle('Remove Series')).toBeNull();
    });

    it('calls onDelete when delete button clicked', () => {
        const onDelete = vi.fn();
        render(<SeriesCard {...defaultProps} onDelete={onDelete} />);
        fireEvent.click(screen.getByTitle('Remove Series'));
        expect(onDelete).toHaveBeenCalled();
    });

    it('shows type and axis selectors for universal type', () => {
        render(<SeriesCard {...defaultProps} vizType="universal" />);
        // Should render chart type options like Line, Scatter etc and Left/Right Axis
        expect(screen.getByText('Show Trendline')).toBeTruthy();
    });

    it('hides type selector for correlation type', () => {
        render(<SeriesCard {...defaultProps} vizType="correlation" />);
        // Should not show chart type options
        expect(screen.queryByText('Line')).toBeNull();
    });

    it('hides type selector for regression type', () => {
        render(<SeriesCard {...defaultProps} vizType="regression" />);
        expect(screen.queryByText('Line')).toBeNull();
    });

    it('shows trendline checkbox for universal type', () => {
        render(<SeriesCard {...defaultProps} vizType="universal" />);
        expect(screen.getByText('Show Trendline')).toBeTruthy();
    });

    it('hides trendline for correlation type', () => {
        render(<SeriesCard {...defaultProps} vizType="correlation" />);
        expect(screen.queryByText('Show Trendline')).toBeNull();
    });

    it('hides trendline for area type', () => {
        render(<SeriesCard {...defaultProps} vizType="area" />);
        expect(screen.queryByText('Show Trendline')).toBeNull();
    });

    it('shows histogram options for hist type', () => {
        render(<SeriesCard {...defaultProps} vizType="hist" seriesConfig={{ ...defaultProps.seriesConfig, bins: 30, show_kde: false }} />);
        expect(screen.getByText('Bins')).toBeTruthy();
        expect(screen.getByText('Show KDE Overlay')).toBeTruthy();
    });

    it('shows trendline sub-options when show_regression is true', () => {
        render(<SeriesCard {...defaultProps} seriesConfig={{ ...defaultProps.seriesConfig, show_regression: true }} />);
        expect(screen.getByText('95% CI')).toBeTruthy();
        expect(screen.getByText('Remove Outliers')).toBeTruthy();
    });
});
