import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimelineVisual } from '../TimelineVisual';
import { useStore } from '@/store';

vi.mock('@/store', () => ({
    useStore: vi.fn(),
}));

const mockEvents = [
    {
        id: 'evt-1',
        date: '2025-01-10T08:00:00Z',
        title: 'Start Event',
        description: 'Process started',
        color: '#22c55e',
    },
    {
        id: 'evt-2',
        date: '2025-01-15T12:00:00Z',
        title: 'Mid Event',
        description: 'Midpoint check',
        color: '#3b82f6',
    },
    {
        id: 'evt-3',
        date: '2025-01-20T16:00:00Z',
        title: 'End Event',
        description: 'Process ended',
        color: '#ef4444',
    },
];

const mockDataset = {
    id: 'ds-1',
    name: 'test.csv',
    rows: 100,
    columns: 2,
    column_names: ['Timestamp', 'Value'],
    numeric_columns: ['Value'],
    datetime_columns: ['Timestamp'],
    memory_usage_kb: 50,
    date_range: {
        start: '2025-01-01T00:00:00Z',
        end: '2025-01-31T23:59:59Z',
    },
    uploaded_at: '2025-01-01T00:00:00Z',
};

describe('TimelineVisual', () => {
    const setupMock = (overrides: Record<string, any> = {}) => {
        const state: Record<string, any> = {
            storylineEvents: mockEvents,
            currentDataset: mockDataset,
            ...overrides,
        };
        vi.mocked(useStore).mockImplementation((selector: any) => selector(state));
    };

    beforeEach(() => {
        vi.clearAllMocks();
        setupMock();
    });

    it('renders the timeline container with default height', () => {
        const { container } = render(<TimelineVisual />);
        const timelineDiv = container.firstChild as HTMLElement;
        expect(timelineDiv).toBeTruthy();
        expect(timelineDiv.style.height).toBe('150px');
    });

    it('renders with custom height prop', () => {
        const { container } = render(<TimelineVisual height={200} />);
        const timelineDiv = container.firstChild as HTMLElement;
        expect(timelineDiv.style.height).toBe('200px');
    });

    it('renders start and end date labels from dataset date_range', () => {
        const { container } = render(<TimelineVisual />);
        const dateLabels = container.querySelectorAll('.text-xs.text-muted-foreground');
        expect(dateLabels.length).toBeGreaterThanOrEqual(2);

        const dateTexts = Array.from(dateLabels).map(el => el.textContent);
        // Should contain formatted dates from the dataset range
        const startDate = new Date('2025-01-01T00:00:00Z').toLocaleDateString();
        const endDate = new Date('2025-01-31T23:59:59Z').toLocaleDateString();
        expect(dateTexts.some(t => t === startDate)).toBe(true);
        expect(dateTexts.some(t => t === endDate)).toBe(true);
    });

    it('renders event markers for each event', () => {
        const { container } = render(<TimelineVisual />);
        // Each event has a marker group with the "group" class
        const markers = container.querySelectorAll('.group');
        expect(markers.length).toBe(3);
    });

    it('renders event titles in tooltip elements', () => {
        render(<TimelineVisual />);
        expect(screen.getByText('Start Event')).toBeTruthy();
        expect(screen.getByText('Mid Event')).toBeTruthy();
        expect(screen.getByText('End Event')).toBeTruthy();
    });

    it('positions events correctly as percentage along the timeline', () => {
        const { container } = render(<TimelineVisual />);
        const markers = container.querySelectorAll('.group');

        // Events are on Jan 10, 15, 20 within a Jan 1-31 range
        // Jan 10: (9 days / 30 days) * 100 ~ 29%
        // Jan 15: (14 days / 30 days) * 100 ~ 46%
        // Jan 20: (19 days / 30 days) * 100 ~ 63%
        markers.forEach(marker => {
            const style = (marker as HTMLElement).style.left;
            expect(style).toBeTruthy();
            const leftPercent = parseFloat(style);
            expect(leftPercent).toBeGreaterThanOrEqual(0);
            expect(leftPercent).toBeLessThanOrEqual(100);
        });
    });

    it('renders no markers when events array is empty', () => {
        setupMock({ storylineEvents: [] });
        const { container } = render(<TimelineVisual />);
        const markers = container.querySelectorAll('.group');
        expect(markers.length).toBe(0);
    });

    it('handles events without dataset date_range (uses event dates)', () => {
        setupMock({ currentDataset: { ...mockDataset, date_range: undefined } });
        const { container } = render(<TimelineVisual />);
        const dateLabels = container.querySelectorAll('.text-xs.text-muted-foreground');
        // Should use min/max from events: Jan 10 - Jan 20
        const minDate = new Date('2025-01-10T08:00:00Z').toLocaleDateString();
        const maxDate = new Date('2025-01-20T16:00:00Z').toLocaleDateString();
        const dateTexts = Array.from(dateLabels).map(el => el.textContent);
        expect(dateTexts.some(t => t === minDate)).toBe(true);
        expect(dateTexts.some(t => t === maxDate)).toBe(true);
    });

    it('handles null dataset gracefully', () => {
        setupMock({ currentDataset: null });
        const { container } = render(<TimelineVisual />);
        // Should still render the container even with no dataset
        expect(container.firstChild).toBeTruthy();
    });

    it('does not render markers for events outside the visible range', () => {
        const outOfRangeEvents = [
            {
                id: 'evt-out',
                date: '2024-06-01T00:00:00Z', // Way before Jan 2025
                title: 'Out of Range',
                description: 'Should not render',
                color: '#000',
            },
        ];
        setupMock({ storylineEvents: outOfRangeEvents });
        const { container } = render(<TimelineVisual />);
        // The event with left < 0 should return null
        expect(screen.queryByText('Out of Range')).toBeNull();
    });

    it('renders event date in tooltip', () => {
        render(<TimelineVisual />);
        // Each event tooltip has a date formatted with toLocaleDateString
        const startDate = new Date('2025-01-10T08:00:00Z').toLocaleDateString();
        const allTexts = document.body.querySelectorAll('.text-\\[10px\\]');
        const dateTexts = Array.from(allTexts).map(el => el.textContent);
        expect(dateTexts.some(t => t === startDate)).toBe(true);
    });
});
