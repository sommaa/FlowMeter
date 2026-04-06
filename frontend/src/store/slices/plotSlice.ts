/**
 * Plot/Visualization Slice - Zustand Store
 *
 * Manages visualization configurations and chart data:
 * - Visualization creation, editing, and deletion
 * - Plot data fetching and caching
 * - Regression predictions
 * - Chart interactions (zoom, pan)
 *
 * Each visualization has a configuration (axes, styling, etc.)
 * and associated plot data (series, labels, annotations).
 */
import { StoreSlice } from './types';
import {
    VisualizationConfig,
    PlotDataResponse,
    createDefaultVisualizationConfig
} from '@/types';
import { visualizationApi } from '@/services/api';

/**
 * Plot slice interface for visualization state management.
 */
export interface PlotSlice {
    // State
    visualizations: VisualizationConfig[];
    plotData: Record<string, PlotDataResponse>;
    plotErrors: Record<string, string | null>;
    loadingPlots: Record<string, boolean>;  // Changed from Set<string> for Zustand compatibility
    visualizationColumns: number;
    vizCounter: number;

    // Actions
    setVisualizationColumns: (cols: number) => void;
    addVisualization: (config?: VisualizationConfig) => void;
    updateVisualization: (id: string, config: Partial<VisualizationConfig>) => void;
    removeVisualization: (id: string) => void;
    clearVisualizations: () => void;
    refreshPlotData: (vizId: string) => Promise<void>;
    clearPlotData: (vizId: string) => void;
    refreshAllPlots: () => Promise<void>;
    reorderVisualizations: (oldIndex: number, newIndex: number) => void;
}

export const createPlotSlice: StoreSlice<PlotSlice> = (set, get) => ({
    visualizations: [],
    plotData: {},
    plotErrors: {},
    loadingPlots: {},  // Changed from new Set()
    visualizationColumns: 2,
    vizCounter: 0,

    setVisualizationColumns: (cols) => set({ visualizationColumns: cols }),

    addVisualization: (config?: VisualizationConfig) => {
        const newId = config?.id || `viz-${Date.now()}-${get().vizCounter}`;
        const newViz = config
            ? { ...config, id: newId }  // Ensure unique ID
            : createDefaultVisualizationConfig(newId);

        set((state: import('./types').StoreState) => ({
            visualizations: [...state.visualizations, newViz],
            vizCounter: state.vizCounter + 1,
        }));

        // If a pre-configured visualization was added (e.g., from AI suggestions),
        // trigger a data refresh immediately if it has Y-axis variables OR is a formula
        if (config && (
            (config.axis?.y_axis && config.axis.y_axis.length > 0) ||
            config.viz_type === 'formula'
        )) {
            // Use setTimeout to ensure state is updated before refresh
            setTimeout(() => {
                get().refreshPlotData(newId);
            }, 0);
        }
    },

    updateVisualization: (id, config) => {
        set((state: import('./types').StoreState) => ({
            visualizations: state.visualizations.map((v) =>
                v.id === id ? { ...v, ...config } : v
            ),
        }));
    },

    removeVisualization: (id) => {
        set((state: import('./types').StoreState) => {
            const { [id]: removedData, ...remainingData } = state.plotData;
            const { [id]: removedError, ...remainingErrors } = state.plotErrors;
            const { [id]: removedLoading, ...remainingLoading } = state.loadingPlots;

            return {
                visualizations: state.visualizations.filter((v) => v.id !== id),
                plotData: remainingData,
                plotErrors: remainingErrors,
                loadingPlots: remainingLoading,
            };
        });
    },

    clearVisualizations: () => set({
        visualizations: [],
        plotData: {},
        plotErrors: {},
        loadingPlots: {},
        currentTemplateName: null
    }),

    refreshPlotData: async (vizId) => {
        const state = get();
        const targetWorkspaceId = state.activeWorkspaceId;
        const viz = state.visualizations.find((v) => v.id === vizId);
        if (!viz || !state.currentDataset) return;

        set((prev: import('./types').StoreState) => ({
            loadingPlots: { ...prev.loadingPlots, [vizId]: true }
        }));

        try {
            const data = await visualizationApi.getPlotData(
                state.currentDataset.id,
                viz,
                state.globalVariables,
                state.globalDateRange,
                !!state.reconciliationResults,
                state.reconciliationResults
            );

            const currentWorkspaceId = get().activeWorkspaceId;
            if (currentWorkspaceId === targetWorkspaceId) {
                set((prev: import('./types').StoreState) => {
                    const { [vizId]: _, ...restLoading } = prev.loadingPlots;
                    return {
                        plotData: { ...prev.plotData, [vizId]: data },
                        plotErrors: { ...prev.plotErrors, [vizId]: null },
                        loadingPlots: restLoading,
                    };
                });
            } else {
                set((state: import('./types').StoreState) => {
                    // Updating background workspace
                    const ws = state.workspaces[targetWorkspaceId];
                    if (!ws) return {};

                    const { [vizId]: _, ...restLoading } = ws.loadingPlots;

                    return {
                        workspaces: {
                            ...state.workspaces,
                            [targetWorkspaceId]: {
                                ...ws,
                                plotData: { ...ws.plotData, [vizId]: data },
                                plotErrors: { ...ws.plotErrors, [vizId]: null },
                                loadingPlots: restLoading
                            }
                        }
                    };
                });
            }

        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to load data';
            console.error(`Error fetching plot data for ${vizId}:`, err);

            const currentWorkspaceId = get().activeWorkspaceId;
            if (currentWorkspaceId === targetWorkspaceId) {
                set((prev: import('./types').StoreState) => {
                    const { [vizId]: _, ...restLoading } = prev.loadingPlots;
                    return {
                        plotErrors: { ...prev.plotErrors, [vizId]: message },
                        loadingPlots: restLoading,
                    };
                });
            } else {
                set((state: import('./types').StoreState) => {
                    const ws = state.workspaces[targetWorkspaceId];
                    if (!ws) return {};

                    const { [vizId]: _, ...restLoading } = ws.loadingPlots;
                    return {
                        workspaces: {
                            ...state.workspaces,
                            [targetWorkspaceId]: {
                                ...ws,
                                plotErrors: { ...ws.plotErrors, [vizId]: message },
                                loadingPlots: restLoading
                            }
                        }
                    };
                });
            }
        }
    },

    clearPlotData: (vizId) => {
        set((state: import('./types').StoreState) => {
            const { [vizId]: removed, ...rest } = state.plotData;
            return { plotData: rest };
        });
    },

    refreshAllPlots: async () => {
        const { visualizations, refreshPlotData } = get();
        await Promise.all(visualizations.map((v) => refreshPlotData(v.id)));
    },

    reorderVisualizations: (oldIndex, newIndex) => {
        set((state: import('./types').StoreState) => {
            if (oldIndex < 0 || oldIndex >= state.visualizations.length || newIndex < 0 || newIndex >= state.visualizations.length) return {};

            const newVisualizations = [...state.visualizations];
            const [removed] = newVisualizations.splice(oldIndex, 1);
            newVisualizations.splice(newIndex, 0, removed);

            return { visualizations: newVisualizations };
        });
    },
});
