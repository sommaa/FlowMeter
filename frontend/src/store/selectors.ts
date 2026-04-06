/**
 * Store Selectors - Memoized State Access
 *
 * Provides optimized selectors for accessing specific parts of the
 * Zustand store. Selectors help prevent unnecessary re-renders by
 * allowing components to subscribe to only the state they need.
 *
 * Usage:
 * ```tsx
 * const dataset = useStore(state => state.currentDataset);
 * const plots = useStore(state => state.visualizations);
 * ```
 *
 * For complex derived state, add memoized selectors here to avoid
 * recomputing on every render.
 */
import { StoreState } from './slices/types';

// Selectors
export const useStoreSelector = (state: StoreState) => state;

export const selectNumericColumns = (state: StoreState) =>
    state.currentDataset?.numeric_columns || [];

export const selectAllColumns = (state: StoreState) =>
    state.currentDataset?.column_names || [];

export const selectDatetimeColumns = (state: StoreState) =>
    state.currentDataset?.datetime_columns || [];

export const selectGlobalVariables = (state: StoreState) => state.globalVariables;

export const selectVisualizationById = (id: string) => (state: StoreState) =>
    state.visualizations.find(v => v.id === id);

export const selectPlotDataById = (id: string) => (state: StoreState) =>
    state.plotData[id];

export const selectIsPlotLoading = (id: string) => (state: StoreState) =>
    !!state.loadingPlots[id];

export const selectPlotErrorById = (id: string) => (state: StoreState) =>
    state.plotErrors[id];
