import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createDataSlice, DataSlice } from '../dataSlice';
import { createDefaultReconciliationConfig, GlobalVariable } from '@/types';

// Mock the API modules
vi.mock('@/services/api', () => ({
  dataApi: {
    upload: vi.fn(),
    getDataset: vi.fn(),
    deleteDataset: vi.fn(),
  },
  reconciliationApi: {
    reconcile: vi.fn(),
  },
}));

import { dataApi, reconciliationApi } from '@/services/api';

// Minimal extra state that the data slice expects from other slices
interface TestExtras {
  activeWorkspaceId: string;
  workspaceMeta: { id: string; name: string; createdAt: number }[];
  workspaces: Record<string, any>;
  error: string | null;
  refreshAllPlots: () => Promise<void>;
  plotData: Record<string, any>;
  plotErrors: Record<string, any>;
  visualizations: any[];
}

type TestStore = DataSlice & TestExtras;

const createTestStore = () =>
  create<TestStore>((set, get, api) => ({
    ...createDataSlice(set as any, get as any, api as any),
    // Provide minimal cross-slice state needed by dataSlice actions
    activeWorkspaceId: 'default',
    workspaceMeta: [{ id: 'default', name: 'Workspace 1', createdAt: 0 }],
    workspaces: {},
    error: null,
    refreshAllPlots: vi.fn().mockResolvedValue(undefined),
    plotData: {},
    plotErrors: {},
    visualizations: [],
  }));

describe('dataSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createTestStore();
  });

  describe('initial state', () => {
    it('has correct default plantName', () => {
      expect(store.getState().plantName).toBe('My Plant');
    });

    it('has empty comments', () => {
      expect(store.getState().comments).toBe('');
    });

    it('has null currentDataset', () => {
      expect(store.getState().currentDataset).toBeNull();
    });

    it('has isLoading false', () => {
      expect(store.getState().isLoading).toBe(false);
    });

    it('has null globalDateRange', () => {
      expect(store.getState().globalDateRange).toBeNull();
    });

    it('has default reconciliationConfig', () => {
      const config = store.getState().reconciliationConfig;
      const expected = createDefaultReconciliationConfig();
      expect(config).toEqual(expected);
    });

    it('has null reconciliationResults', () => {
      expect(store.getState().reconciliationResults).toBeNull();
    });

    it('has empty globalVariables', () => {
      expect(store.getState().globalVariables).toEqual([]);
    });

    it('has empty columnDescriptions', () => {
      expect(store.getState().columnDescriptions).toEqual({});
    });

    it('has empty aiGuidanceText', () => {
      expect(store.getState().aiGuidanceText).toBe('');
    });
  });

  describe('setPlantName', () => {
    it('updates the plant name', () => {
      store.getState().setPlantName('Test Plant');
      expect(store.getState().plantName).toBe('Test Plant');
    });
  });

  describe('setComments', () => {
    it('updates comments', () => {
      store.getState().setComments('Some comments');
      expect(store.getState().comments).toBe('Some comments');
    });
  });

  describe('uploadFile', () => {
    it('sets isLoading to true during upload', async () => {
      const mockDataset = {
        id: 'ds-1',
        name: 'test.csv',
        rows: 100,
        columns: 5,
        column_names: ['a', 'b'],
        numeric_columns: ['a', 'b'],
        datetime_columns: [],
        memory_usage_kb: 50,
        uploaded_at: '2024-01-01',
      };
      vi.mocked(dataApi.upload).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockDataset), 100))
      );

      const promise = store.getState().uploadFile(new File([], 'test.csv'));
      expect(store.getState().isLoading).toBe(true);
      await promise;
    });

    it('sets currentDataset and plantName on success', async () => {
      const mockDataset = {
        id: 'ds-1',
        name: 'myfile.csv',
        rows: 100,
        columns: 5,
        column_names: ['a', 'b'],
        numeric_columns: ['a', 'b'],
        datetime_columns: [],
        memory_usage_kb: 50,
        uploaded_at: '2024-01-01',
      };
      vi.mocked(dataApi.upload).mockResolvedValue(mockDataset);

      await store.getState().uploadFile(new File([], 'myfile.csv'));
      const state = store.getState();

      expect(state.currentDataset).toEqual(mockDataset);
      expect(state.plantName).toBe('myfile');
      expect(state.isLoading).toBe(false);
      expect(state.columnDescriptions).toEqual({});
      expect(state.aiGuidanceText).toBe('');
    });

    it('sets error on failure', async () => {
      vi.mocked(dataApi.upload).mockRejectedValue(new Error('Upload failed'));

      await store.getState().uploadFile(new File([], 'bad.csv'));
      const state = store.getState();

      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Upload failed');
    });

    it('passes cleaning config to API', async () => {
      const mockDataset = {
        id: 'ds-1',
        name: 'test.csv',
        rows: 10,
        columns: 2,
        column_names: ['a'],
        numeric_columns: ['a'],
        datetime_columns: [],
        memory_usage_kb: 5,
        uploaded_at: '2024-01-01',
      };
      vi.mocked(dataApi.upload).mockResolvedValue(mockDataset);
      const cleaningConfig = {
        header_row: 1,
        nan_strategy: 'drop' as const,
        custom_nan_value: null,
        replacements: [],
        filters: [],
      };

      const file = new File([], 'test.csv');
      await store.getState().uploadFile(file, cleaningConfig);

      expect(dataApi.upload).toHaveBeenCalledWith(file, cleaningConfig);
    });
  });

  describe('clearDataset', () => {
    it('resets dataset-related state to defaults', () => {
      // Set up some state first
      store.setState({
        currentDataset: { id: 'ds-1', name: 'test.csv' } as any,
        plantName: 'Custom Plant',
        reconciliationResults: { report: [] } as any,
        globalDateRange: { start: '2024-01-01', end: '2024-12-31' },
        columnDescriptions: { col1: 'desc1' },
        aiGuidanceText: 'some guidance',
        globalVariables: [{ name: 'x', formula: 'a+b' }],
      });

      store.getState().clearDataset();
      const state = store.getState();

      expect(state.currentDataset).toBeNull();
      expect(state.plantName).toBe('My Plant');
      expect(state.reconciliationResults).toBeNull();
      expect(state.globalDateRange).toBeNull();
      expect(state.columnDescriptions).toEqual({});
      expect(state.aiGuidanceText).toBe('');
      expect(state.globalVariables).toEqual([]);
    });
  });

  describe('setGlobalDateRange', () => {
    it('sets the global date range', () => {
      const range = { start: '2024-01-01', end: '2024-06-30' };
      store.getState().setGlobalDateRange(range);
      expect(store.getState().globalDateRange).toEqual(range);
    });

    it('clears the global date range when set to null', () => {
      store.getState().setGlobalDateRange({ start: '2024-01-01', end: '2024-06-30' });
      store.getState().setGlobalDateRange(null);
      expect(store.getState().globalDateRange).toBeNull();
    });

    it('calls refreshAllPlots after setting date range', () => {
      const range = { start: '2024-01-01', end: '2024-06-30' };
      store.getState().setGlobalDateRange(range);
      expect(store.getState().refreshAllPlots).toHaveBeenCalled();
    });
  });

  describe('updateReconciliationConfig', () => {
    it('partially updates the reconciliation config', () => {
      store.getState().updateReconciliationConfig({ fixed_sigma: 2.5 });
      expect(store.getState().reconciliationConfig.fixed_sigma).toBe(2.5);
      // Other fields should remain unchanged
      expect(store.getState().reconciliationConfig.non_negative).toBe(true);
    });

    it('updates equations', () => {
      store.getState().updateReconciliationConfig({ equations: ['A + B = C'] });
      expect(store.getState().reconciliationConfig.equations).toEqual(['A + B = C']);
    });
  });

  describe('runReconciliation', () => {
    it('does nothing when no dataset is loaded', async () => {
      await store.getState().runReconciliation();
      expect(reconciliationApi.reconcile).not.toHaveBeenCalled();
    });

    it('calls the reconciliation API and sets results on success', async () => {
      const mockResults = {
        reconciled_file_url: '/files/reconciled.csv',
        file_name: 'reconciled.csv',
        report: [{ variable: 'A', mean_error: 0.1, mae: 0.05, rel_error_pct: 1.0, std_error: 0.02, avg_abs_change: 0.03, max_abs_change: 0.1, count: 100 }],
      };
      const mockUpdatedDataset = {
        id: 'ds-1',
        name: 'test.csv',
        rows: 100,
        columns: 6,
        column_names: ['a', 'b', 'a_rec'],
        numeric_columns: ['a', 'b', 'a_rec'],
        datetime_columns: [],
        memory_usage_kb: 60,
        uploaded_at: '2024-01-01',
      };

      vi.mocked(reconciliationApi.reconcile).mockResolvedValue(mockResults);
      vi.mocked(dataApi.getDataset).mockResolvedValue(mockUpdatedDataset);

      store.setState({ currentDataset: { id: 'ds-1', name: 'test.csv' } as any });

      await store.getState().runReconciliation();
      const state = store.getState();

      expect(state.reconciliationResults).toEqual(mockResults);
      expect(state.isLoading).toBe(false);
    });

    it('sets error on reconciliation failure', async () => {
      vi.mocked(reconciliationApi.reconcile).mockRejectedValue(new Error('Reconciliation failed'));
      store.setState({ currentDataset: { id: 'ds-1', name: 'test.csv' } as any });

      await store.getState().runReconciliation();
      const state = store.getState();

      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Reconciliation failed');
    });
  });

  describe('addGlobalVariable', () => {
    it('adds a global variable', () => {
      const variable: GlobalVariable = { name: 'total', formula: 'a + b', description: 'Sum' };
      store.getState().addGlobalVariable(variable);
      expect(store.getState().globalVariables).toEqual([variable]);
    });

    it('appends to existing variables', () => {
      const var1: GlobalVariable = { name: 'x', formula: 'a + b' };
      const var2: GlobalVariable = { name: 'y', formula: 'c * d' };

      store.getState().addGlobalVariable(var1);
      store.getState().addGlobalVariable(var2);
      expect(store.getState().globalVariables).toEqual([var1, var2]);
    });
  });

  describe('updateGlobalVariable', () => {
    it('updates a variable at a specific index', () => {
      const var1: GlobalVariable = { name: 'x', formula: 'a + b' };
      const var2: GlobalVariable = { name: 'y', formula: 'c * d' };
      store.setState({ globalVariables: [var1, var2] });

      const updated: GlobalVariable = { name: 'x_updated', formula: 'a - b' };
      store.getState().updateGlobalVariable(0, updated);

      expect(store.getState().globalVariables[0]).toEqual(updated);
      expect(store.getState().globalVariables[1]).toEqual(var2);
    });
  });

  describe('removeGlobalVariable', () => {
    it('removes a variable at a specific index', () => {
      const var1: GlobalVariable = { name: 'x', formula: 'a + b' };
      const var2: GlobalVariable = { name: 'y', formula: 'c * d' };
      const var3: GlobalVariable = { name: 'z', formula: 'e / f' };
      store.setState({ globalVariables: [var1, var2, var3] });

      store.getState().removeGlobalVariable(1);
      expect(store.getState().globalVariables).toEqual([var1, var3]);
    });
  });

  describe('setReconciliationResults', () => {
    it('sets reconciliation results', () => {
      const results = {
        reconciled_file_url: '/files/rec.csv',
        file_name: 'rec.csv',
        report: [],
      };
      store.getState().setReconciliationResults(results);
      expect(store.getState().reconciliationResults).toEqual(results);
    });

    it('clears reconciliation results when set to null', () => {
      store.setState({ reconciliationResults: { report: [] } as any });
      store.getState().setReconciliationResults(null);
      expect(store.getState().reconciliationResults).toBeNull();
    });
  });

  describe('refreshCurrentDataset', () => {
    it('does nothing when no dataset is loaded', async () => {
      await store.getState().refreshCurrentDataset();
      expect(dataApi.getDataset).not.toHaveBeenCalled();
    });

    it('refreshes the current dataset', async () => {
      const updatedDataset = {
        id: 'ds-1',
        name: 'test.csv',
        rows: 150,
        columns: 7,
        column_names: ['a', 'b', 'c'],
        numeric_columns: ['a', 'b', 'c'],
        datetime_columns: [],
        memory_usage_kb: 70,
        uploaded_at: '2024-01-01',
      };
      vi.mocked(dataApi.getDataset).mockResolvedValue(updatedDataset);
      store.setState({ currentDataset: { id: 'ds-1', name: 'test.csv' } as any });

      await store.getState().refreshCurrentDataset();
      expect(store.getState().currentDataset).toEqual(updatedDataset);
    });

    it('handles refresh errors gracefully', async () => {
      vi.mocked(dataApi.getDataset).mockRejectedValue(new Error('Network error'));
      store.setState({ currentDataset: { id: 'ds-1', name: 'test.csv' } as any });

      // Should not throw
      await store.getState().refreshCurrentDataset();
      // Dataset should remain unchanged (not nullified)
      expect(store.getState().currentDataset).not.toBeNull();
    });
  });

  describe('setColumnDescriptions', () => {
    it('sets column descriptions', () => {
      const descriptions = { col1: 'Temperature', col2: 'Pressure' };
      store.getState().setColumnDescriptions(descriptions);
      expect(store.getState().columnDescriptions).toEqual(descriptions);
    });
  });

  describe('setAiGuidanceText', () => {
    it('sets the AI guidance text', () => {
      store.getState().setAiGuidanceText('Analyze flow rates');
      expect(store.getState().aiGuidanceText).toBe('Analyze flow rates');
    });
  });

  describe('updateDataFile', () => {
    const oldDataset = {
      id: 'ds-old',
      name: 'old.csv',
      rows: 100,
      columns: 5,
      column_names: ['a', 'b'],
      numeric_columns: ['a', 'b'],
      datetime_columns: [],
      memory_usage_kb: 50,
      uploaded_at: '2024-01-01',
    };

    const newDataset = {
      id: 'ds-new',
      name: 'new.csv',
      rows: 200,
      columns: 8,
      column_names: ['x', 'y', 'z'],
      numeric_columns: ['x', 'y', 'z'],
      datetime_columns: [],
      memory_usage_kb: 80,
      uploaded_at: '2024-06-01',
    };

    it('sets isLoading during update', async () => {
      vi.mocked(dataApi.upload).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(newDataset), 100))
      );
      store.setState({ currentDataset: oldDataset as any });

      const promise = store.getState().updateDataFile(new File([], 'new.csv'));
      expect(store.getState().isLoading).toBe(true);
      await promise;
    });

    it('sets new dataset and clears stale state on success', async () => {
      vi.mocked(dataApi.upload).mockResolvedValue(newDataset);
      vi.mocked(dataApi.deleteDataset).mockResolvedValue(undefined);
      store.setState({
        currentDataset: oldDataset as any,
        reconciliationResults: { report: [] } as any,
        globalDateRange: { start: '2024-01-01', end: '2024-12-31' },
        plotData: { 'plot-1': { data: [] } },
        plotErrors: { 'plot-1': 'old error' },
        columnDescriptions: { a: 'col a' },
        aiGuidanceText: 'old guidance',
      });

      await store.getState().updateDataFile(new File([], 'new.csv'));
      const state = store.getState();

      expect(state.currentDataset).toEqual(newDataset);
      expect(state.plantName).toBe('new');
      expect(state.isLoading).toBe(false);
      expect(state.reconciliationResults).toBeNull();
      expect(state.globalDateRange).toBeNull();
      expect(state.plotData).toEqual({});
      expect(state.plotErrors).toEqual({});
      expect(state.columnDescriptions).toEqual({});
      expect(state.aiGuidanceText).toBe('');
    });

    it('preserves visualizations and globalVariables on success', async () => {
      vi.mocked(dataApi.upload).mockResolvedValue(newDataset);
      vi.mocked(dataApi.deleteDataset).mockResolvedValue(undefined);
      const vizs = [{ id: 'v1', type: 'line' }];
      const vars: GlobalVariable[] = [{ name: 'total', formula: 'a + b' }];
      store.setState({
        currentDataset: oldDataset as any,
        visualizations: vizs,
        globalVariables: vars,
      });

      await store.getState().updateDataFile(new File([], 'new.csv'));
      const state = store.getState();

      expect(state.visualizations).toEqual(vizs);
      expect(state.globalVariables).toEqual(vars);
    });

    it('calls deleteDataset on old dataset', async () => {
      vi.mocked(dataApi.upload).mockResolvedValue(newDataset);
      vi.mocked(dataApi.deleteDataset).mockResolvedValue(undefined);
      store.setState({ currentDataset: oldDataset as any });

      await store.getState().updateDataFile(new File([], 'new.csv'));

      expect(dataApi.deleteDataset).toHaveBeenCalledWith('ds-old');
    });

    it('calls refreshAllPlots on success', async () => {
      vi.mocked(dataApi.upload).mockResolvedValue(newDataset);
      vi.mocked(dataApi.deleteDataset).mockResolvedValue(undefined);
      store.setState({ currentDataset: oldDataset as any });

      await store.getState().updateDataFile(new File([], 'new.csv'));

      expect(store.getState().refreshAllPlots).toHaveBeenCalled();
    });

    it('preserves everything on upload failure', async () => {
      vi.mocked(dataApi.upload).mockRejectedValue(new Error('Upload failed'));
      const vizs = [{ id: 'v1', type: 'line' }];
      const vars: GlobalVariable[] = [{ name: 'total', formula: 'a + b' }];
      store.setState({
        currentDataset: oldDataset as any,
        visualizations: vizs,
        globalVariables: vars,
        plotData: { 'plot-1': { data: [] } },
      });

      await store.getState().updateDataFile(new File([], 'bad.csv'));
      const state = store.getState();

      expect(state.currentDataset).toEqual(oldDataset);
      expect(state.visualizations).toEqual(vizs);
      expect(state.globalVariables).toEqual(vars);
      expect(state.plotData).toEqual({ 'plot-1': { data: [] } });
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Upload failed');
    });

    it('does not call deleteDataset on upload failure', async () => {
      vi.mocked(dataApi.upload).mockRejectedValue(new Error('Upload failed'));
      store.setState({ currentDataset: oldDataset as any });

      await store.getState().updateDataFile(new File([], 'bad.csv'));

      expect(dataApi.deleteDataset).not.toHaveBeenCalled();
    });

    it('passes cleaning config to API', async () => {
      vi.mocked(dataApi.upload).mockResolvedValue(newDataset);
      vi.mocked(dataApi.deleteDataset).mockResolvedValue(undefined);
      store.setState({ currentDataset: oldDataset as any });

      const cleaningConfig = {
        header_row: 1,
        nan_strategy: 'drop' as const,
        custom_nan_value: null,
        replacements: [],
        filters: [],
      };

      const file = new File([], 'new.csv');
      await store.getState().updateDataFile(file, cleaningConfig);

      expect(dataApi.upload).toHaveBeenCalledWith(file, cleaningConfig);
    });

    it('works when no previous dataset exists', async () => {
      vi.mocked(dataApi.upload).mockResolvedValue(newDataset);
      // No currentDataset set (null by default)

      await store.getState().updateDataFile(new File([], 'new.csv'));
      const state = store.getState();

      expect(state.currentDataset).toEqual(newDataset);
      expect(dataApi.deleteDataset).not.toHaveBeenCalled();
    });

    it('re-runs reconciliation if config has equations', async () => {
      vi.mocked(dataApi.upload).mockResolvedValue(newDataset);
      vi.mocked(dataApi.deleteDataset).mockResolvedValue(undefined);
      const reconResults = {
        reconciled_file_url: '/files/rec.csv',
        file_name: 'rec.csv',
        report: [],
      };
      vi.mocked(reconciliationApi.reconcile).mockResolvedValue(reconResults);
      vi.mocked(dataApi.getDataset).mockResolvedValue(newDataset);
      store.setState({
        currentDataset: oldDataset as any,
        reconciliationConfig: { ...createDefaultReconciliationConfig(), equations: ['A + B = C'] },
      });

      await store.getState().updateDataFile(new File([], 'new.csv'));

      expect(reconciliationApi.reconcile).toHaveBeenCalled();
      expect(store.getState().reconciliationResults).toEqual(reconResults);
    });

    it('re-runs reconciliation when config has equations but results are null', async () => {
      vi.mocked(dataApi.upload).mockResolvedValue(newDataset);
      vi.mocked(dataApi.deleteDataset).mockResolvedValue(undefined);
      const reconResults = {
        reconciled_file_url: '/files/rec.csv',
        file_name: 'rec.csv',
        report: [],
      };
      vi.mocked(reconciliationApi.reconcile).mockResolvedValue(reconResults);
      vi.mocked(dataApi.getDataset).mockResolvedValue(newDataset);
      store.setState({
        currentDataset: oldDataset as any,
        reconciliationResults: null,
        reconciliationConfig: { ...createDefaultReconciliationConfig(), equations: ['X = Y + Z'] },
      });

      await store.getState().updateDataFile(new File([], 'new.csv'));

      expect(reconciliationApi.reconcile).toHaveBeenCalled();
      expect(store.getState().reconciliationResults).toEqual(reconResults);
    });

    it('refreshes plots after reconciliation completes', async () => {
      vi.mocked(dataApi.upload).mockResolvedValue(newDataset);
      vi.mocked(dataApi.deleteDataset).mockResolvedValue(undefined);
      vi.mocked(reconciliationApi.reconcile).mockResolvedValue({
        reconciled_file_url: '/files/rec.csv',
        file_name: 'rec.csv',
        report: [],
      });
      vi.mocked(dataApi.getDataset).mockResolvedValue(newDataset);
      store.setState({
        currentDataset: oldDataset as any,
        reconciliationConfig: { ...createDefaultReconciliationConfig(), equations: ['A + B = C'] },
      });

      await store.getState().updateDataFile(new File([], 'new.csv'));

      // reconcile is called first, then refreshAllPlots after
      const refreshAllPlots = store.getState().refreshAllPlots;
      expect(reconciliationApi.reconcile).toHaveBeenCalled();
      expect(refreshAllPlots).toHaveBeenCalled();
    });

    it('still completes update if reconciliation fails', async () => {
      vi.mocked(dataApi.upload).mockResolvedValue(newDataset);
      vi.mocked(dataApi.deleteDataset).mockResolvedValue(undefined);
      vi.mocked(reconciliationApi.reconcile).mockRejectedValue(new Error('Recon failed'));
      store.setState({
        currentDataset: oldDataset as any,
        reconciliationConfig: { ...createDefaultReconciliationConfig(), equations: ['A + B = C'] },
      });

      await store.getState().updateDataFile(new File([], 'new.csv'));

      // Dataset should still be updated even though reconciliation failed
      expect(store.getState().currentDataset).toEqual(newDataset);
      expect(store.getState().refreshAllPlots).toHaveBeenCalled();
    });

    it('does not re-run reconciliation if no equations configured', async () => {
      vi.mocked(dataApi.upload).mockResolvedValue(newDataset);
      vi.mocked(dataApi.deleteDataset).mockResolvedValue(undefined);
      store.setState({
        currentDataset: oldDataset as any,
        reconciliationResults: null,
        reconciliationConfig: createDefaultReconciliationConfig(), // empty equations
      });

      await store.getState().updateDataFile(new File([], 'new.csv'));

      expect(reconciliationApi.reconcile).not.toHaveBeenCalled();
    });
  });
});
