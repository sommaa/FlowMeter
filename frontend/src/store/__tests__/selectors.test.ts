import { describe, it, expect } from 'vitest';
import {
  selectNumericColumns,
  selectAllColumns,
  selectDatetimeColumns,
  selectGlobalVariables,
  selectVisualizationById,
  selectPlotDataById,
  selectIsPlotLoading,
  selectPlotErrorById,
} from '@/store/selectors';
import type { StoreState } from '@/store/slices/types';

// Helper to create a minimal mock state
const createMockState = (overrides: Partial<StoreState> = {}): StoreState => ({
  // DataSlice fields
  plantName: 'Test Plant',
  comments: '',
  currentDataset: null,
  isLoading: false,
  error: null,
  globalDateRange: null,
  reconciliationConfig: {
    equations: [],
    sigma_mode: 'fixed_all',
    fixed_sigma: 1.0,
    sigma_values: {},
    non_negative: true,
  },
  reconciliationResults: null,
  globalVariables: [],
  columnDescriptions: {},
  aiGuidanceText: '',

  // PlotSlice fields
  visualizations: [],
  plotData: {},
  plotErrors: {},
  loadingPlots: {},
  visualizationColumns: 2,
  vizCounter: 0,

  // UISlice fields
  isDarkMode: false,

  // Provide dummy functions to satisfy the type
  ...overrides,
} as StoreState);

describe('selectNumericColumns', () => {
  it('returns numeric columns from the current dataset', () => {
    const state = createMockState({
      currentDataset: {
        id: 'ds1',
        name: 'test.xlsx',
        rows: 100,
        columns: 5,
        column_names: ['a', 'b', 'c', 'd', 'e'],
        numeric_columns: ['a', 'b', 'c'],
        datetime_columns: ['d'],
        memory_usage_kb: 1024,
        uploaded_at: '2024-01-01',
      },
    });
    expect(selectNumericColumns(state)).toEqual(['a', 'b', 'c']);
  });

  it('returns empty array when there is no current dataset', () => {
    const state = createMockState({ currentDataset: null });
    expect(selectNumericColumns(state)).toEqual([]);
  });
});

describe('selectAllColumns', () => {
  it('returns all column names from the current dataset', () => {
    const state = createMockState({
      currentDataset: {
        id: 'ds1',
        name: 'test.xlsx',
        rows: 100,
        columns: 3,
        column_names: ['x', 'y', 'z'],
        numeric_columns: ['x', 'y'],
        datetime_columns: ['z'],
        memory_usage_kb: 512,
        uploaded_at: '2024-01-01',
      },
    });
    expect(selectAllColumns(state)).toEqual(['x', 'y', 'z']);
  });

  it('returns empty array when there is no current dataset', () => {
    const state = createMockState({ currentDataset: null });
    expect(selectAllColumns(state)).toEqual([]);
  });
});

describe('selectDatetimeColumns', () => {
  it('returns datetime columns from the current dataset', () => {
    const state = createMockState({
      currentDataset: {
        id: 'ds1',
        name: 'test.xlsx',
        rows: 50,
        columns: 4,
        column_names: ['time', 'val1', 'val2', 'date'],
        numeric_columns: ['val1', 'val2'],
        datetime_columns: ['time', 'date'],
        memory_usage_kb: 256,
        uploaded_at: '2024-01-01',
      },
    });
    expect(selectDatetimeColumns(state)).toEqual(['time', 'date']);
  });

  it('returns empty array when there is no current dataset', () => {
    const state = createMockState({ currentDataset: null });
    expect(selectDatetimeColumns(state)).toEqual([]);
  });
});

describe('selectGlobalVariables', () => {
  it('returns the global variables array', () => {
    const vars = [
      { name: 'total', formula: 'a + b', description: 'Sum' },
    ];
    const state = createMockState({ globalVariables: vars });
    expect(selectGlobalVariables(state)).toEqual(vars);
  });

  it('returns empty array when no global variables are defined', () => {
    const state = createMockState({ globalVariables: [] });
    expect(selectGlobalVariables(state)).toEqual([]);
  });
});

describe('selectVisualizationById', () => {
  it('returns the visualization matching the given id', () => {
    const viz1 = { id: 'viz-1', type: 'universal', title: 'Plot 1' };
    const viz2 = { id: 'viz-2', type: 'hist', title: 'Plot 2' };
    const state = createMockState({
      visualizations: [viz1, viz2] as any,
    });
    expect(selectVisualizationById('viz-1')(state)).toEqual(viz1);
    expect(selectVisualizationById('viz-2')(state)).toEqual(viz2);
  });

  it('returns undefined when no visualization matches the id', () => {
    const state = createMockState({ visualizations: [] });
    expect(selectVisualizationById('nonexistent')(state)).toBeUndefined();
  });
});

describe('selectPlotDataById', () => {
  it('returns the plot data for a given id', () => {
    const plotResponse = { data: [{ x: [1], y: [2] }] };
    const state = createMockState({
      plotData: { 'plot-1': plotResponse } as any,
    });
    expect(selectPlotDataById('plot-1')(state)).toEqual(plotResponse);
  });

  it('returns undefined when no plot data exists for the id', () => {
    const state = createMockState({ plotData: {} });
    expect(selectPlotDataById('missing')(state)).toBeUndefined();
  });
});

describe('selectIsPlotLoading', () => {
  it('returns true when the plot is loading', () => {
    const state = createMockState({
      loadingPlots: { 'plot-1': true },
    });
    expect(selectIsPlotLoading('plot-1')(state)).toBe(true);
  });

  it('returns false when the plot is not loading', () => {
    const state = createMockState({
      loadingPlots: { 'plot-1': false },
    });
    expect(selectIsPlotLoading('plot-1')(state)).toBe(false);
  });

  it('returns false when the plot id is not in the loadingPlots map', () => {
    const state = createMockState({ loadingPlots: {} });
    expect(selectIsPlotLoading('unknown')(state)).toBe(false);
  });
});

describe('selectPlotErrorById', () => {
  it('returns the error message for a given plot id', () => {
    const state = createMockState({
      plotErrors: { 'plot-1': 'Something went wrong' },
    });
    expect(selectPlotErrorById('plot-1')(state)).toBe('Something went wrong');
  });

  it('returns null when the plot has no error', () => {
    const state = createMockState({
      plotErrors: { 'plot-1': null },
    });
    expect(selectPlotErrorById('plot-1')(state)).toBeNull();
  });

  it('returns undefined when the plot id is not in the errors map', () => {
    const state = createMockState({ plotErrors: {} });
    expect(selectPlotErrorById('unknown')(state)).toBeUndefined();
  });
});
