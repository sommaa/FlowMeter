import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createStorylineSlice, StorylineSlice } from '../storylineSlice';
import { StorylineEvent } from '@/types';

// Mock uuid to produce predictable IDs
vi.mock('uuid', () => ({
  v4: vi.fn(),
}));

import { v4 as uuidv4 } from 'uuid';

type TestStore = StorylineSlice;

const createTestStore = () =>
  create<TestStore>((set, get, api) => ({
    ...createStorylineSlice(set as any, get as any, api as any),
  }));

describe('storylineSlice', () => {
  let store: ReturnType<typeof createTestStore>;
  let uuidCounter: number;

  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    vi.mocked(uuidv4).mockImplementation(() => `uuid-${++uuidCounter}`);
    store = createTestStore();
  });

  describe('initial state', () => {
    it('has empty storylineEvents array', () => {
      expect(store.getState().storylineEvents).toEqual([]);
    });

    it('has isStorylineOpen false', () => {
      expect(store.getState().isStorylineOpen).toBe(false);
    });

    it('has isStorylineEnabled true by default', () => {
      expect(store.getState().isStorylineEnabled).toBe(true);
    });
  });

  describe('addStorylineEvent', () => {
    it('adds an event with a generated id', () => {
      store.getState().addStorylineEvent({
        date: '2024-06-15',
        title: 'Maintenance',
        description: 'Scheduled maintenance window',
      });

      const events = store.getState().storylineEvents;
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('uuid-1');
      expect(events[0].title).toBe('Maintenance');
      expect(events[0].date).toBe('2024-06-15');
      expect(events[0].description).toBe('Scheduled maintenance window');
    });

    it('sorts events by date after adding', () => {
      store.getState().addStorylineEvent({
        date: '2024-06-15',
        title: 'Second',
        description: 'Middle event',
      });
      store.getState().addStorylineEvent({
        date: '2024-01-01',
        title: 'First',
        description: 'Earliest event',
      });
      store.getState().addStorylineEvent({
        date: '2024-12-31',
        title: 'Third',
        description: 'Latest event',
      });

      const events = store.getState().storylineEvents;
      expect(events[0].title).toBe('First');
      expect(events[1].title).toBe('Second');
      expect(events[2].title).toBe('Third');
    });

    it('preserves optional color field', () => {
      store.getState().addStorylineEvent({
        date: '2024-03-01',
        title: 'Colored Event',
        description: 'Has a color',
        color: '#ff0000',
      });

      expect(store.getState().storylineEvents[0].color).toBe('#ff0000');
    });
  });

  describe('updateStorylineEvent', () => {
    it('updates an existing event by id', () => {
      store.getState().addStorylineEvent({
        date: '2024-06-15',
        title: 'Original',
        description: 'Original description',
      });

      store.getState().updateStorylineEvent('uuid-1', { title: 'Updated' });

      const events = store.getState().storylineEvents;
      expect(events[0].title).toBe('Updated');
      expect(events[0].description).toBe('Original description'); // Unchanged
    });

    it('re-sorts events after date update', () => {
      store.getState().addStorylineEvent({
        date: '2024-01-01',
        title: 'First',
        description: 'A',
      });
      store.getState().addStorylineEvent({
        date: '2024-12-31',
        title: 'Second',
        description: 'B',
      });

      // Move "First" to after "Second" by changing its date
      store.getState().updateStorylineEvent('uuid-1', { date: '2025-01-01' });

      const events = store.getState().storylineEvents;
      expect(events[0].title).toBe('Second');
      expect(events[1].title).toBe('First');
    });

    it('does not modify events with different ids', () => {
      store.getState().addStorylineEvent({
        date: '2024-01-01',
        title: 'Keep',
        description: 'A',
      });
      store.getState().addStorylineEvent({
        date: '2024-06-01',
        title: 'Change',
        description: 'B',
      });

      store.getState().updateStorylineEvent('uuid-2', { title: 'Changed' });

      const events = store.getState().storylineEvents;
      expect(events[0].title).toBe('Keep');
      expect(events[1].title).toBe('Changed');
    });
  });

  describe('removeStorylineEvent', () => {
    it('removes an event by id', () => {
      store.getState().addStorylineEvent({
        date: '2024-01-01',
        title: 'Remove Me',
        description: 'A',
      });
      store.getState().addStorylineEvent({
        date: '2024-06-01',
        title: 'Keep Me',
        description: 'B',
      });

      store.getState().removeStorylineEvent('uuid-1');

      const events = store.getState().storylineEvents;
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('Keep Me');
    });

    it('does nothing when id does not exist', () => {
      store.getState().addStorylineEvent({
        date: '2024-01-01',
        title: 'Keep',
        description: 'A',
      });

      store.getState().removeStorylineEvent('nonexistent');
      expect(store.getState().storylineEvents).toHaveLength(1);
    });
  });

  describe('setStorylineOpen', () => {
    it('opens the storyline panel', () => {
      store.getState().setStorylineOpen(true);
      expect(store.getState().isStorylineOpen).toBe(true);
    });

    it('closes the storyline panel', () => {
      store.getState().setStorylineOpen(true);
      store.getState().setStorylineOpen(false);
      expect(store.getState().isStorylineOpen).toBe(false);
    });
  });

  describe('setStorylineEnabled', () => {
    it('disables storyline display on charts', () => {
      store.getState().setStorylineEnabled(false);
      expect(store.getState().isStorylineEnabled).toBe(false);
    });

    it('re-enables storyline display on charts', () => {
      store.getState().setStorylineEnabled(false);
      store.getState().setStorylineEnabled(true);
      expect(store.getState().isStorylineEnabled).toBe(true);
    });
  });

  describe('setStorylineEvents', () => {
    it('replaces all storyline events', () => {
      store.getState().addStorylineEvent({
        date: '2024-01-01',
        title: 'Old',
        description: 'Old event',
      });

      const newEvents: StorylineEvent[] = [
        { id: 'new-1', date: '2024-03-01', title: 'New 1', description: 'First new' },
        { id: 'new-2', date: '2024-09-01', title: 'New 2', description: 'Second new' },
      ];

      store.getState().setStorylineEvents(newEvents);

      const events = store.getState().storylineEvents;
      expect(events).toEqual(newEvents);
      expect(events).toHaveLength(2);
    });

    it('can set events to empty array', () => {
      store.getState().addStorylineEvent({
        date: '2024-01-01',
        title: 'Event',
        description: 'Will be cleared',
      });

      store.getState().setStorylineEvents([]);
      expect(store.getState().storylineEvents).toEqual([]);
    });
  });
});
