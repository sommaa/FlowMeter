import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createWorkspaceSlice, WorkspaceSlice } from '../workspaceSlice';
import { createDefaultReconciliationConfig } from '@/types';

// Minimal per-workspace state fields that the workspace slice reads/writes
interface WorkspaceScopeState {
  plantName: string;
  comments: string;
  currentDataset: any;
  isLoading: boolean;
  error: string | null;
  globalDateRange: any;
  reconciliationConfig: any;
  reconciliationResults: any;
  globalVariables: any[];
  columnDescriptions: Record<string, string>;
  aiGuidanceText: string;
  visualizations: any[];
  plotData: Record<string, any>;
  plotErrors: Record<string, any>;
  loadingPlots: Record<string, boolean>;
  visualizationColumns: number;
  vizCounter: number;
  storylineEvents: any[];
  setStorylineEvents: (events: any[]) => void;
}

type TestStore = WorkspaceSlice & WorkspaceScopeState;

const createTestStore = () =>
  create<TestStore>((set, get, api) => ({
    ...createWorkspaceSlice(set as any, get as any, api as any),
    // Provide root workspace state (represents the "active" workspace)
    plantName: 'My Plant',
    comments: '',
    currentDataset: null,
    isLoading: false,
    error: null,
    globalDateRange: null,
    reconciliationConfig: createDefaultReconciliationConfig(),
    reconciliationResults: null,
    globalVariables: [],
    columnDescriptions: {},
    aiGuidanceText: '',
    visualizations: [],
    plotData: {},
    plotErrors: {},
    loadingPlots: {},
    visualizationColumns: 2,
    vizCounter: 0,
    storylineEvents: [],
    setStorylineEvents: (events: any[]) => set({ storylineEvents: events }),
  }));

describe('workspaceSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createTestStore();
  });

  describe('initial state', () => {
    it('has empty workspaces map', () => {
      expect(store.getState().workspaces).toEqual({});
    });

    it('has one default workspace in meta', () => {
      const meta = store.getState().workspaceMeta;
      expect(meta).toHaveLength(1);
      expect(meta[0].id).toBe('default');
      expect(meta[0].name).toBe('Workspace 1');
    });

    it('has activeWorkspaceId set to default', () => {
      expect(store.getState().activeWorkspaceId).toBe('default');
    });
  });

  describe('addWorkspace', () => {
    it('adds a new workspace and switches to it', () => {
      store.getState().addWorkspace();
      const state = store.getState();

      expect(state.workspaceMeta).toHaveLength(2);
      expect(state.activeWorkspaceId).not.toBe('default');
      // New workspace should have "Workspace 2" as name
      expect(state.workspaceMeta[1].name).toBe('Workspace 2');
    });

    it('saves current workspace state before switching', () => {
      // Modify root state to simulate active workspace data
      store.setState({
        plantName: 'Active Plant',
        comments: 'Active comments',
      });

      store.getState().addWorkspace();
      const state = store.getState();

      // Previous workspace should be saved
      expect(state.workspaces['default']).toBeDefined();
      expect(state.workspaces['default'].plantName).toBe('Active Plant');
      expect(state.workspaces['default'].comments).toBe('Active comments');
    });

    it('resets root state for the new workspace', () => {
      store.setState({
        plantName: 'Old Plant',
        visualizations: [{ id: 'viz-1' }] as any,
      });

      store.getState().addWorkspace();
      const state = store.getState();

      // Root state should be fresh defaults
      expect(state.plantName).toBe('My Plant');
      expect(state.visualizations).toEqual([]);
    });

    it('generates unique workspace IDs', () => {
      // Date.now() may return same ms in rapid calls, so mock it
      let now = 1000;
      const spy = vi.spyOn(Date, 'now').mockImplementation(() => ++now);

      store.getState().addWorkspace();
      store.getState().addWorkspace();

      const ids = store.getState().workspaceMeta.map((w) => w.id);
      expect(new Set(ids).size).toBe(3);

      spy.mockRestore();
    });
  });

  describe('switchWorkspace', () => {
    it('does nothing when switching to the same workspace', () => {
      const originalState = store.getState();
      store.getState().switchWorkspace('default');
      expect(store.getState().activeWorkspaceId).toBe(originalState.activeWorkspaceId);
    });

    it('saves current state and loads target workspace state', () => {
      // Set some unique data in default workspace
      store.setState({ plantName: 'Default Plant', comments: 'Default comments' });

      // Create second workspace (automatically switches to it)
      store.getState().addWorkspace();
      const newWsId = store.getState().activeWorkspaceId;

      // Set data in new workspace
      store.setState({ plantName: 'New Plant', comments: 'New comments' });

      // Switch back to default
      store.getState().switchWorkspace('default');

      const state = store.getState();
      expect(state.activeWorkspaceId).toBe('default');
      expect(state.plantName).toBe('Default Plant');
      expect(state.comments).toBe('Default comments');

      // New workspace should be saved
      expect(state.workspaces[newWsId]).toBeDefined();
      expect(state.workspaces[newWsId].plantName).toBe('New Plant');
    });

    it('restores all workspace-scoped fields', () => {
      store.setState({
        plantName: 'Plant A',
        comments: 'Comments A',
        globalVariables: [{ name: 'x', formula: 'a+b' }],
        visualizationColumns: 3,
      });

      store.getState().addWorkspace();
      const ws2Id = store.getState().activeWorkspaceId;

      store.getState().switchWorkspace('default');
      const state = store.getState();

      expect(state.plantName).toBe('Plant A');
      expect(state.globalVariables).toHaveLength(1);
      expect(state.visualizationColumns).toBe(3);
    });
  });

  describe('removeWorkspace', () => {
    it('does not remove the last workspace', () => {
      store.getState().removeWorkspace('default');
      expect(store.getState().workspaceMeta).toHaveLength(1);
      expect(store.getState().activeWorkspaceId).toBe('default');
    });

    it('removes an inactive workspace', () => {
      store.getState().addWorkspace();
      const ws2Id = store.getState().activeWorkspaceId;

      // Switch back to default, then remove ws2
      store.getState().switchWorkspace('default');
      store.getState().removeWorkspace(ws2Id);

      expect(store.getState().workspaceMeta).toHaveLength(1);
      expect(store.getState().workspaces[ws2Id]).toBeUndefined();
    });

    it('switches to another workspace when removing the active one', () => {
      // Create second workspace
      store.getState().addWorkspace();
      const ws2Id = store.getState().activeWorkspaceId;

      // Remove the active workspace (ws2)
      store.getState().removeWorkspace(ws2Id);

      expect(store.getState().workspaceMeta).toHaveLength(1);
      expect(store.getState().activeWorkspaceId).toBe('default');
    });

    it('loads state from the next workspace when removing active', () => {
      store.setState({ plantName: 'Default Data' });

      store.getState().addWorkspace();
      const ws2Id = store.getState().activeWorkspaceId;

      // Remove ws2 - should switch to default and restore its state
      store.getState().removeWorkspace(ws2Id);

      expect(store.getState().plantName).toBe('Default Data');
    });
  });

  describe('updateWorkspaceName', () => {
    it('updates the name of a workspace', () => {
      store.getState().updateWorkspaceName('default', 'My Custom Name');
      const meta = store.getState().workspaceMeta.find((w) => w.id === 'default');
      expect(meta?.name).toBe('My Custom Name');
    });

    it('does not affect other workspaces', () => {
      store.getState().addWorkspace();
      const ws2Id = store.getState().activeWorkspaceId;

      store.getState().updateWorkspaceName(ws2Id, 'Renamed');

      const defaultMeta = store.getState().workspaceMeta.find((w) => w.id === 'default');
      expect(defaultMeta?.name).toBe('Workspace 1');
    });
  });
});
