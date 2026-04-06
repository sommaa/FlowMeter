import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createPlotSlice, PlotSlice } from '../plotSlice';
import { createDefaultVisualizationConfig, VisualizationConfig } from '@/types';

// Mock the API modules
vi.mock('@/services/api', () => ({
  visualizationApi: {
    getPlotData: vi.fn(),
  },
}));

import { visualizationApi } from '@/services/api';

// Minimal extra state that the plot slice expects from other slices
interface TestExtras {
  activeWorkspaceId: string;
  workspaces: Record<string, any>;
  currentDataset: any;
  globalVariables: any[];
  globalDateRange: any;
  reconciliationResults: any;
  currentTemplateName: string | null;
}

type TestStore = PlotSlice & TestExtras;

const createTestStore = () =>
  create<TestStore>((set, get, api) => ({
    ...createPlotSlice(set as any, get as any, api as any),
    activeWorkspaceId: 'default',
    workspaces: {},
    currentDataset: null,
    globalVariables: [],
    globalDateRange: null,
    reconciliationResults: null,
    currentTemplateName: null,
  }));

describe('plotSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createTestStore();
  });

  describe('initial state', () => {
    it('has empty visualizations array', () => {
      expect(store.getState().visualizations).toEqual([]);
    });

    it('has empty plotData', () => {
      expect(store.getState().plotData).toEqual({});
    });

    it('has empty plotErrors', () => {
      expect(store.getState().plotErrors).toEqual({});
    });

    it('has empty loadingPlots', () => {
      expect(store.getState().loadingPlots).toEqual({});
    });

    it('has visualizationColumns set to 2', () => {
      expect(store.getState().visualizationColumns).toBe(2);
    });

    it('has vizCounter at 0', () => {
      expect(store.getState().vizCounter).toBe(0);
    });
  });

  describe('setVisualizationColumns', () => {
    it('updates the number of visualization columns', () => {
      store.getState().setVisualizationColumns(3);
      expect(store.getState().visualizationColumns).toBe(3);
    });

    it('can be set to 1', () => {
      store.getState().setVisualizationColumns(1);
      expect(store.getState().visualizationColumns).toBe(1);
    });
  });

  describe('addVisualization', () => {
    it('adds a default visualization when no config is provided', () => {
      store.getState().addVisualization();
      const state = store.getState();

      expect(state.visualizations).toHaveLength(1);
      expect(state.visualizations[0].title).toBe('New Visualization');
      expect(state.visualizations[0].viz_type).toBe('universal');
      expect(state.vizCounter).toBe(1);
    });

    it('adds a custom visualization when config is provided', () => {
      vi.useFakeTimers();
      const config = createDefaultVisualizationConfig('custom-id');
      config.title = 'Custom Chart';

      store.getState().addVisualization(config);
      const state = store.getState();

      expect(state.visualizations).toHaveLength(1);
      expect(state.visualizations[0].title).toBe('Custom Chart');
      expect(state.vizCounter).toBe(1);
      vi.useRealTimers();
    });

    it('increments vizCounter with each addition', () => {
      store.getState().addVisualization();
      store.getState().addVisualization();
      store.getState().addVisualization();

      expect(store.getState().vizCounter).toBe(3);
      expect(store.getState().visualizations).toHaveLength(3);
    });

    it('assigns unique IDs to each visualization', () => {
      store.getState().addVisualization();
      store.getState().addVisualization();

      const ids = store.getState().visualizations.map((v) => v.id);
      expect(new Set(ids).size).toBe(2);
    });
  });

  describe('updateVisualization', () => {
    it('updates a visualization by id', () => {
      store.getState().addVisualization();
      const vizId = store.getState().visualizations[0].id;

      store.getState().updateVisualization(vizId, { title: 'Updated Title' });
      expect(store.getState().visualizations[0].title).toBe('Updated Title');
    });

    it('does not modify other visualizations', () => {
      store.getState().addVisualization();
      store.getState().addVisualization();

      const viz1Id = store.getState().visualizations[0].id;
      const viz2OriginalTitle = store.getState().visualizations[1].title;

      store.getState().updateVisualization(viz1Id, { title: 'Changed' });
      expect(store.getState().visualizations[1].title).toBe(viz2OriginalTitle);
    });

    it('merges partial config into existing visualization', () => {
      store.getState().addVisualization();
      const vizId = store.getState().visualizations[0].id;

      store.getState().updateVisualization(vizId, { viz_type: 'box' });

      const updated = store.getState().visualizations[0];
      expect(updated.viz_type).toBe('box');
      expect(updated.title).toBe('New Visualization'); // Other fields preserved
    });
  });

  describe('removeVisualization', () => {
    it('removes a visualization by id', () => {
      store.getState().addVisualization();
      store.getState().addVisualization();
      const vizId = store.getState().visualizations[0].id;

      store.getState().removeVisualization(vizId);
      expect(store.getState().visualizations).toHaveLength(1);
      expect(store.getState().visualizations[0].id).not.toBe(vizId);
    });

    it('cleans up associated plotData, plotErrors, and loadingPlots', () => {
      store.getState().addVisualization();
      const vizId = store.getState().visualizations[0].id;

      // Simulate having associated data
      store.setState({
        plotData: { [vizId]: { title: 'test', series: [], x_label: '', y_label: '' } },
        plotErrors: { [vizId]: 'some error' },
        loadingPlots: { [vizId]: true },
      });

      store.getState().removeVisualization(vizId);

      expect(store.getState().plotData).toEqual({});
      expect(store.getState().plotErrors).toEqual({});
      expect(store.getState().loadingPlots).toEqual({});
    });
  });

  describe('clearVisualizations', () => {
    it('removes all visualizations and related data', () => {
      store.getState().addVisualization();
      store.getState().addVisualization();

      store.setState({
        plotData: { 'viz-1': { title: 'a', series: [], x_label: '', y_label: '' } },
        plotErrors: { 'viz-1': null },
        loadingPlots: { 'viz-1': false },
      });

      store.getState().clearVisualizations();
      const state = store.getState();

      expect(state.visualizations).toEqual([]);
      expect(state.plotData).toEqual({});
      expect(state.plotErrors).toEqual({});
      expect(state.loadingPlots).toEqual({});
    });
  });

  describe('refreshPlotData', () => {
    it('does nothing when no dataset is loaded', async () => {
      store.getState().addVisualization();
      const vizId = store.getState().visualizations[0].id;

      await store.getState().refreshPlotData(vizId);
      expect(visualizationApi.getPlotData).not.toHaveBeenCalled();
    });

    it('does nothing when visualization does not exist', async () => {
      store.setState({ currentDataset: { id: 'ds-1' } });

      await store.getState().refreshPlotData('nonexistent');
      expect(visualizationApi.getPlotData).not.toHaveBeenCalled();
    });

    it('fetches plot data and stores it on success', async () => {
      const mockPlotData = {
        title: 'Test Plot',
        series: [{ name: 'Series 1', data: [], type: 'line' }],
        x_label: 'Time',
        y_label: 'Value',
      };
      vi.mocked(visualizationApi.getPlotData).mockResolvedValue(mockPlotData);

      store.setState({ currentDataset: { id: 'ds-1' } });
      store.getState().addVisualization();
      const vizId = store.getState().visualizations[0].id;

      await store.getState().refreshPlotData(vizId);
      const state = store.getState();

      expect(state.plotData[vizId]).toEqual(mockPlotData);
      expect(state.plotErrors[vizId]).toBeNull();
      expect(state.loadingPlots[vizId]).toBeUndefined();
    });

    it('stores error message on failure', async () => {
      vi.mocked(visualizationApi.getPlotData).mockRejectedValue(new Error('Data fetch failed'));

      store.setState({ currentDataset: { id: 'ds-1' } });
      store.getState().addVisualization();
      const vizId = store.getState().visualizations[0].id;

      await store.getState().refreshPlotData(vizId);
      const state = store.getState();

      expect(state.plotErrors[vizId]).toBe('Data fetch failed');
      expect(state.loadingPlots[vizId]).toBeUndefined();
    });
  });

  describe('clearPlotData', () => {
    it('removes plot data for a specific visualization', () => {
      store.setState({
        plotData: {
          'viz-1': { title: 'a', series: [], x_label: '', y_label: '' },
          'viz-2': { title: 'b', series: [], x_label: '', y_label: '' },
        },
      });

      store.getState().clearPlotData('viz-1');
      const data = store.getState().plotData;

      expect(data['viz-1']).toBeUndefined();
      expect(data['viz-2']).toBeDefined();
    });
  });

  describe('refreshAllPlots', () => {
    it('refreshes plot data for all visualizations', async () => {
      const mockPlotData = {
        title: 'Test',
        series: [],
        x_label: '',
        y_label: '',
      };
      vi.mocked(visualizationApi.getPlotData).mockResolvedValue(mockPlotData);

      store.setState({ currentDataset: { id: 'ds-1' } });
      store.getState().addVisualization();
      store.getState().addVisualization();

      await store.getState().refreshAllPlots();
      expect(visualizationApi.getPlotData).toHaveBeenCalledTimes(2);
    });
  });

  describe('reorderVisualizations', () => {
    it('moves a visualization from one index to another', () => {
      store.getState().addVisualization();
      store.getState().addVisualization();
      store.getState().addVisualization();

      const originalOrder = store.getState().visualizations.map((v) => v.id);
      store.getState().reorderVisualizations(0, 2);
      const newOrder = store.getState().visualizations.map((v) => v.id);

      expect(newOrder[0]).toBe(originalOrder[1]);
      expect(newOrder[1]).toBe(originalOrder[2]);
      expect(newOrder[2]).toBe(originalOrder[0]);
    });

    it('does nothing for out-of-bounds indices', () => {
      store.getState().addVisualization();
      store.getState().addVisualization();

      const originalOrder = store.getState().visualizations.map((v) => v.id);
      store.getState().reorderVisualizations(-1, 5);
      const newOrder = store.getState().visualizations.map((v) => v.id);

      expect(newOrder).toEqual(originalOrder);
    });

    it('handles swapping adjacent items', () => {
      store.getState().addVisualization();
      store.getState().addVisualization();

      const originalOrder = store.getState().visualizations.map((v) => v.id);
      store.getState().reorderVisualizations(0, 1);
      const newOrder = store.getState().visualizations.map((v) => v.id);

      expect(newOrder[0]).toBe(originalOrder[1]);
      expect(newOrder[1]).toBe(originalOrder[0]);
    });
  });
});
