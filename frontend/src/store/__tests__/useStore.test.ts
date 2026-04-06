import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock import.meta.env.DEV before importing the store
vi.stubEnv('DEV', true);

// Mock API modules that slices depend on
vi.mock('@/services/api', () => ({
  dataApi: {
    upload: vi.fn(),
    getDataset: vi.fn(),
  },
  reconciliationApi: {
    reconcile: vi.fn(),
  },
  visualizationApi: {
    getPlotData: vi.fn(),
  },
  exportApi: {
    exportDashboard: vi.fn(),
  },
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-uuid'),
}));

import { useStore } from '../useStore';

describe('useStore (combined store)', () => {
  beforeEach(() => {
    // Reset the store state to defaults between tests
    // Since useStore is a singleton, we need to reset carefully
    const state = useStore.getState();
    useStore.setState({
      plantName: 'My Plant',
      comments: '',
      currentDataset: null,
      isLoading: false,
      error: null,
      globalDateRange: null,
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
      notification: null,
      notifications: [],
      isDarkMode: false,
      theme: 'teal' as const,
      sidebarOpen: true,
      sidebarWidth: 280,
      isSidebarTransitioning: false,
      isTemplateManagerOpen: false,
      currentTemplateName: null,
      isExporting: false,
      isExportConfigOpen: false,
      isExportDownloadOpen: false,
      hasOnboarded: false,
      storylineEvents: [],
      isStorylineOpen: false,
      isStorylineEnabled: true,
    });
  });

  describe('store creation', () => {
    it('creates a valid store instance', () => {
      expect(useStore).toBeDefined();
      expect(typeof useStore.getState).toBe('function');
      expect(typeof useStore.setState).toBe('function');
      expect(typeof useStore.subscribe).toBe('function');
    });
  });

  describe('DataSlice integration', () => {
    it('has dataSlice state and actions', () => {
      const state = useStore.getState();
      expect(state.plantName).toBe('My Plant');
      expect(typeof state.setPlantName).toBe('function');
      expect(typeof state.uploadFile).toBe('function');
      expect(typeof state.clearDataset).toBe('function');
      expect(typeof state.setGlobalDateRange).toBe('function');
      expect(typeof state.addGlobalVariable).toBe('function');
      expect(typeof state.updateGlobalVariable).toBe('function');
      expect(typeof state.removeGlobalVariable).toBe('function');
      expect(typeof state.setColumnDescriptions).toBe('function');
      expect(typeof state.setAiGuidanceText).toBe('function');
    });

    it('setPlantName updates the store', () => {
      useStore.getState().setPlantName('Combined Test');
      expect(useStore.getState().plantName).toBe('Combined Test');
    });
  });

  describe('PlotSlice integration', () => {
    it('has plotSlice state and actions', () => {
      const state = useStore.getState();
      expect(state.visualizations).toEqual([]);
      expect(typeof state.addVisualization).toBe('function');
      expect(typeof state.updateVisualization).toBe('function');
      expect(typeof state.removeVisualization).toBe('function');
      expect(typeof state.clearVisualizations).toBe('function');
      expect(typeof state.refreshPlotData).toBe('function');
      expect(typeof state.refreshAllPlots).toBe('function');
      expect(typeof state.reorderVisualizations).toBe('function');
      expect(typeof state.setVisualizationColumns).toBe('function');
    });

    it('addVisualization adds to the store', () => {
      useStore.getState().addVisualization();
      expect(useStore.getState().visualizations).toHaveLength(1);
    });
  });

  describe('UISlice integration', () => {
    it('has uiSlice state and actions', () => {
      const state = useStore.getState();
      expect(state.isDarkMode).toBe(false);
      expect(state.theme).toBe('teal');
      expect(typeof state.toggleDarkMode).toBe('function');
      expect(typeof state.setTheme).toBe('function');
      expect(typeof state.toggleSidebar).toBe('function');
      expect(typeof state.setError).toBe('function');
      expect(typeof state.setNotification).toBe('function');
      expect(typeof state.addNotification).toBe('function');
      expect(typeof state.exportReport).toBe('function');
      expect(typeof state.getTemplate).toBe('function');
      expect(typeof state.loadTemplate).toBe('function');
    });

    it('setTheme updates the store', () => {
      useStore.getState().setTheme('violet');
      expect(useStore.getState().theme).toBe('violet');
    });
  });

  describe('WorkspaceSlice integration', () => {
    it('has workspaceSlice state and actions', () => {
      const state = useStore.getState();
      expect(state.activeWorkspaceId).toBeDefined();
      expect(state.workspaceMeta).toBeDefined();
      expect(typeof state.addWorkspace).toBe('function');
      expect(typeof state.switchWorkspace).toBe('function');
      expect(typeof state.removeWorkspace).toBe('function');
      expect(typeof state.updateWorkspaceName).toBe('function');
    });
  });

  describe('StorylineSlice integration', () => {
    it('has storylineSlice state and actions', () => {
      const state = useStore.getState();
      expect(state.storylineEvents).toEqual([]);
      expect(state.isStorylineOpen).toBe(false);
      expect(state.isStorylineEnabled).toBe(true);
      expect(typeof state.addStorylineEvent).toBe('function');
      expect(typeof state.updateStorylineEvent).toBe('function');
      expect(typeof state.removeStorylineEvent).toBe('function');
      expect(typeof state.setStorylineOpen).toBe('function');
      expect(typeof state.setStorylineEnabled).toBe('function');
      expect(typeof state.setStorylineEvents).toBe('function');
    });
  });

  describe('cross-slice interaction', () => {
    it('setError from UISlice adds to notifications', () => {
      useStore.getState().setError('Cross-slice error');
      expect(useStore.getState().error).toBe('Cross-slice error');
      expect(useStore.getState().notifications.length).toBeGreaterThanOrEqual(1);
    });

    it('clearDataset resets plot data', () => {
      useStore.getState().addVisualization();
      useStore.setState({
        currentDataset: { id: 'ds-1' } as any,
        plotData: { 'viz-1': { title: 'test', series: [], x_label: '', y_label: '' } } as any,
      });

      useStore.getState().clearDataset();
      expect(useStore.getState().currentDataset).toBeNull();
      expect(useStore.getState().plotData).toEqual({});
      expect(useStore.getState().visualizations).toEqual([]);
    });
  });

  describe('store subscription', () => {
    it('notifies subscribers on state changes', () => {
      const listener = vi.fn();
      const unsubscribe = useStore.subscribe(listener);

      useStore.getState().setPlantName('Subscribed Plant');
      expect(listener).toHaveBeenCalled();

      unsubscribe();
    });

    it('selector-based subscription works', () => {
      const listener = vi.fn();
      const unsubscribe = useStore.subscribe(
        (state) => {
          listener(state.plantName);
        }
      );

      useStore.getState().setPlantName('Selected');
      expect(listener).toHaveBeenCalledWith('Selected');

      unsubscribe();
    });
  });
});
