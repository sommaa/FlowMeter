/**
 * Storyline Slice - Zustand Store
 *
 * Manages timeline annotations and narrative events:
 * - Event creation and editing (maintenance, incidents, etc.)
 * - Timeline visualization markers
 * - Event categorization and color coding
 * - Export to HTML reports
 *
 * Storyline events provide context for data trends by marking
 * significant occurrences on the timeline (shutdowns, process
 * changes, equipment failures, etc.).
 */
import { StateCreator } from 'zustand';
import { StoreState } from './types';
// @ts-ignore
import { v4 as uuidv4 } from 'uuid';
import { StorylineEvent } from '@/types';

export interface StorylineSlice {
    storylineEvents: StorylineEvent[];
    isStorylineOpen: boolean;
    isStorylineEnabled: boolean; // Toggle for showing events on charts

    // Actions
    addStorylineEvent: (event: Omit<StorylineEvent, 'id'>) => void;
    updateStorylineEvent: (id: string, event: Partial<StorylineEvent>) => void;
    removeStorylineEvent: (id: string) => void;
    setStorylineOpen: (isOpen: boolean) => void;
    setStorylineEnabled: (enabled: boolean) => void; // Toggle chart visibility
    setStorylineEvents: (events: StorylineEvent[]) => void;
}

export const createStorylineSlice: StateCreator<
    StoreState,
    [],
    [],
    StorylineSlice
> = (set) => ({
    storylineEvents: [],
    isStorylineOpen: false,
    isStorylineEnabled: true, // Enabled by default

    addStorylineEvent: (event) =>
        set((state) => ({
            storylineEvents: [
                ...state.storylineEvents,
                { ...event, id: uuidv4() },
            ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        })),

    updateStorylineEvent: (id, updatedEvent) =>
        set((state) => ({
            storylineEvents: state.storylineEvents
                .map((event) => (event.id === id ? { ...event, ...updatedEvent } : event))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        })),

    removeStorylineEvent: (id) =>
        set((state) => ({
            storylineEvents: state.storylineEvents.filter((event) => event.id !== id),
        })),

    setStorylineOpen: (isOpen) => set({ isStorylineOpen: isOpen }),

    setStorylineEnabled: (enabled) => set({ isStorylineEnabled: enabled }),

    setStorylineEvents: (events) => set({ storylineEvents: events }),
});
