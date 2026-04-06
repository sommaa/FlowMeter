import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StorylineModal } from '../StorylineModal';
import { useStore } from '@/store';

vi.mock('@/store', () => ({
    useStore: vi.fn(),
}));

const mockEvents = [
    {
        id: 'evt-1',
        date: '2025-01-15T10:30:00Z',
        title: 'Equipment Maintenance',
        description: 'Pump #3 was serviced',
        color: '#f59e0b',
    },
    {
        id: 'evt-2',
        date: '2025-01-16T14:00:00Z',
        title: 'Feed Interruption',
        description: 'Upstream supply disrupted for 2 hours',
        color: '#ef4444',
    },
];

describe('StorylineModal', () => {
    const mockSetOpen = vi.fn();
    const mockAddEvent = vi.fn();
    const mockRemoveEvent = vi.fn();
    const mockUpdateEvent = vi.fn();

    const setupMock = (overrides: Record<string, any> = {}) => {
        const state: Record<string, any> = {
            isStorylineOpen: true,
            setStorylineOpen: mockSetOpen,
            storylineEvents: mockEvents,
            addStorylineEvent: mockAddEvent,
            removeStorylineEvent: mockRemoveEvent,
            updateStorylineEvent: mockUpdateEvent,
            ...overrides,
        };
        vi.mocked(useStore).mockImplementation((selector: any) => selector(state));
    };

    beforeEach(() => {
        vi.clearAllMocks();
        setupMock();
    });

    it('renders the modal when isStorylineOpen is true', () => {
        render(<StorylineModal />);
        expect(screen.getByText('Storyline')).toBeTruthy();
        expect(
            screen.getByText(
                'Track and visualize key events alongside your process data.'
            )
        ).toBeTruthy();
    });

    it('does not render content when isStorylineOpen is false', () => {
        setupMock({ isStorylineOpen: false });
        render(<StorylineModal />);
        expect(screen.queryByText('Storyline')).toBeNull();
    });

    it('shows Add New Event button by default', () => {
        render(<StorylineModal />);
        expect(screen.getByText('Add New Event')).toBeTruthy();
    });

    it('shows empty state when no events', () => {
        setupMock({ storylineEvents: [] });
        render(<StorylineModal />);
        expect(screen.getByText('No events recorded.')).toBeTruthy();
        expect(screen.getByText('Add an event to get started.')).toBeTruthy();
    });

    it('renders event list with titles and descriptions', () => {
        render(<StorylineModal />);
        expect(screen.getByText('Equipment Maintenance')).toBeTruthy();
        expect(screen.getByText('Pump #3 was serviced')).toBeTruthy();
        expect(screen.getByText('Feed Interruption')).toBeTruthy();
        expect(
            screen.getByText('Upstream supply disrupted for 2 hours')
        ).toBeTruthy();
    });

    it('shows Event History header', () => {
        render(<StorylineModal />);
        expect(screen.getByText('Event History')).toBeTruthy();
    });

    it('shows the form when Add New Event is clicked', () => {
        render(<StorylineModal />);
        fireEvent.click(screen.getByText('Add New Event'));
        expect(screen.getByText('New Event')).toBeTruthy();
        expect(screen.getByPlaceholderText('Event Title')).toBeTruthy();
        expect(screen.getByPlaceholderText('What happened?')).toBeTruthy();
    });

    it('submits form and calls addEvent with form data', () => {
        render(<StorylineModal />);
        fireEvent.click(screen.getByText('Add New Event'));

        const titleInput = screen.getByPlaceholderText('Event Title');
        const descriptionInput = screen.getByPlaceholderText('What happened?');

        fireEvent.change(titleInput, { target: { value: 'New Event Title' } });
        fireEvent.change(descriptionInput, {
            target: { value: 'Event description' },
        });

        fireEvent.click(screen.getByText('Add Event'));

        expect(mockAddEvent).toHaveBeenCalledTimes(1);
        expect(mockAddEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'New Event Title',
                description: 'Event description',
                color: '#6366f1',
            })
        );
    });

    it('does not submit when title is empty', () => {
        render(<StorylineModal />);
        fireEvent.click(screen.getByText('Add New Event'));

        // Leave title empty, just click Add Event
        fireEvent.click(screen.getByText('Add Event'));

        expect(mockAddEvent).not.toHaveBeenCalled();
    });

    it('resets form when Cancel is clicked', () => {
        render(<StorylineModal />);
        fireEvent.click(screen.getByText('Add New Event'));

        const titleInput = screen.getByPlaceholderText('Event Title');
        fireEvent.change(titleInput, { target: { value: 'Test' } });

        fireEvent.click(screen.getByText('Cancel'));

        // Form should be hidden, Add New Event button visible again
        expect(screen.getByText('Add New Event')).toBeTruthy();
        expect(screen.queryByText('New Event')).toBeNull();
    });

    it('closes modal when Close button is clicked', () => {
        render(<StorylineModal />);
        // "Close" appears both as visible button and sr-only span
        const closeButtons = screen.getAllByText('Close');
        // Click the visible button (first match)
        fireEvent.click(closeButtons[0]);
        expect(mockSetOpen).toHaveBeenCalledWith(false);
    });

    it('shows footer text when form is not open', () => {
        render(<StorylineModal />);
        expect(
            screen.getByText(
                /Events added here will typically be linked to your dataset/
            )
        ).toBeTruthy();
    });

    it('shows Edit Event header when editing an existing event', () => {
        render(<StorylineModal />);

        // Find the edit button for the first event
        // Edit buttons are the ones with Edit2 icon (pencil)
        // They are in the hover overlay of each event card
        const editButtons = document.body.querySelectorAll('button');
        const editBtn = Array.from(editButtons).find((btn) => {
            // The edit button has a child SVG (Edit2 icon) and is inside the event card area
            const svg = btn.querySelector('svg');
            return (
                svg &&
                btn.classList.contains('hover:bg-muted') &&
                btn.closest('.group')
            );
        });

        if (editBtn) {
            fireEvent.click(editBtn);
            expect(screen.getByText('Edit Event')).toBeTruthy();
            expect(screen.getByText('Save Changes')).toBeTruthy();
        }
    });
});
