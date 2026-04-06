/**
 * Data Management Slice - Zustand Store
 *
 * Manages dataset state, file uploads, and data transformations:
 * - Dataset loading and metadata
 * - Global variables (computed columns)
 * - Data reconciliation (constrained optimization)
 * - Date range filtering
 * - AI column descriptions
 *
 * This slice is the primary data source for all visualizations.
 */
import { StoreSlice, StoreState } from './types';
import {
    DatasetInfo,
    CleaningConfig,
    ReconciliationConfig,
    GlobalVariable,
    createDefaultReconciliationConfig
} from '@/types';
import { dataApi, reconciliationApi } from '@/services/api';

/**
 * Data slice interface defining state and actions for dataset management.
 */
export interface DataSlice {
    // State
    plantName: string;
    comments: string;
    currentDataset: DatasetInfo | null;
    isLoading: boolean;
    globalDateRange: { start: string; end: string } | null;

    reconciliationConfig: ReconciliationConfig;
    reconciliationResults: import('@/types').ReconciliationResponse | null;

    globalVariables: GlobalVariable[];

    // Actions
    setPlantName: (name: string) => void;
    setComments: (comments: string) => void;
    uploadFile: (file: File, cleaningConfig?: CleaningConfig) => Promise<void>;
    updateDataFile: (file: File, cleaningConfig?: CleaningConfig) => Promise<void>;
    clearDataset: () => void;
    setGlobalDateRange: (range: { start: string; end: string } | null) => void;

    // Reconciliation Actions
    updateReconciliationConfig: (config: Partial<ReconciliationConfig>) => void;
    runReconciliation: () => Promise<void>;

    // Global Variable Actions
    addGlobalVariable: (variable: GlobalVariable) => void;
    updateGlobalVariable: (index: number, variable: GlobalVariable) => void;
    removeGlobalVariable: (index: number) => void;

    setReconciliationResults: (results: import('@/types').ReconciliationResponse | null) => void;
    refreshCurrentDataset: () => Promise<void>;

    // AI Descriptions
    columnDescriptions: Record<string, string>;
    setColumnDescriptions: (descriptions: Record<string, string>) => void;

    // AI Guidance
    aiGuidanceText: string;
    setAiGuidanceText: (text: string) => void;
}

export const createDataSlice: StoreSlice<DataSlice> = (set, get) => ({
    plantName: 'My Plant',
    comments: '',
    currentDataset: null,
    isLoading: false,
    globalDateRange: null,

    reconciliationConfig: createDefaultReconciliationConfig(),
    reconciliationResults: null,

    globalVariables: [],

    setPlantName: (name) => set((state: StoreState) => ({
        plantName: name,
        workspaceMeta: state.workspaceMeta.map(w =>
            w.id === state.activeWorkspaceId ? { ...w, name } : w
        )
    })),
    setComments: (comments) => set({ comments }),

    uploadFile: async (file, cleaningConfig) => {
        const targetWorkspaceId = get().activeWorkspaceId;
        set({ isLoading: true, error: null });

        try {
            const dataset = await dataApi.upload(file, cleaningConfig);

            // Check if we are still in the same workspace
            const currentWorkspaceId = get().activeWorkspaceId;

            if (currentWorkspaceId === targetWorkspaceId) {
                // We are active, update root state
                const newName = dataset.name.split('.')[0];
                set((state: StoreState) => ({
                    currentDataset: dataset,
                    isLoading: false,
                    plantName: newName,
                    columnDescriptions: {},
                    aiGuidanceText: '',
                    workspaceMeta: state.workspaceMeta.map(w =>
                        w.id === targetWorkspaceId ? { ...w, name: newName } : w
                    )
                }));
            } else {
                // We switched away! Update the SAVED workspace state directly
                set((state: StoreState) => {
                    // Safe check if workspace exists
                    if (!state.workspaces[targetWorkspaceId]) return {}; // Should not happen

                    return {
                        isLoading: false,

                        workspaces: {
                            ...state.workspaces,
                            [targetWorkspaceId]: {
                                ...state.workspaces[targetWorkspaceId],
                                currentDataset: dataset,
                                isLoading: false,
                                plantName: dataset.name.split('.')[0],
                                columnDescriptions: {},
                                aiGuidanceText: ''
                            }
                        }
                    };
                });
            }

        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to upload file';
            const currentWorkspaceId = get().activeWorkspaceId;

            if (currentWorkspaceId === targetWorkspaceId) {
                set({
                    isLoading: false,
                    error: message
                });
            } else {
                set((state: StoreState) => ({
                    workspaces: {
                        ...state.workspaces,
                        [targetWorkspaceId]: {
                            ...state.workspaces[targetWorkspaceId],
                            isLoading: false,
                            error: message
                        }
                    }
                }));
            }
        }
    },

    updateDataFile: async (file, cleaningConfig) => {
        const targetWorkspaceId = get().activeWorkspaceId;
        const oldDatasetId = get().currentDataset?.id;
        const hasReconciliationConfig = get().reconciliationConfig.equations.length > 0;
        set({ isLoading: true, error: null });

        try {
            const dataset = await dataApi.upload(file, cleaningConfig);

            // Delete old dataset (best-effort, fire-and-forget)
            if (oldDatasetId) {
                dataApi.deleteDataset(oldDatasetId).catch(() => { });
            }

            const currentWorkspaceId = get().activeWorkspaceId;

            if (currentWorkspaceId === targetWorkspaceId) {
                const newName = dataset.name.split('.')[0];
                set((state: StoreState) => ({
                    currentDataset: dataset,
                    isLoading: false,
                    plantName: newName,
                    reconciliationResults: null,
                    globalDateRange: null,
                    plotData: {},
                    plotErrors: {},
                    columnDescriptions: {},
                    aiGuidanceText: '',
                    workspaceMeta: state.workspaceMeta.map(w =>
                        w.id === targetWorkspaceId ? { ...w, name: newName } : w
                    )
                }));
            } else {
                set((state: StoreState) => {
                    if (!state.workspaces[targetWorkspaceId]) return {};
                    return {
                        isLoading: false,
                        workspaces: {
                            ...state.workspaces,
                            [targetWorkspaceId]: {
                                ...state.workspaces[targetWorkspaceId],
                                currentDataset: dataset,
                                isLoading: false,
                                plantName: dataset.name.split('.')[0],
                                reconciliationResults: null,
                                globalDateRange: null,
                                plotData: {},
                                plotErrors: {},
                                columnDescriptions: {},
                                aiGuidanceText: '',
                            }
                        }
                    };
                });
            }

            // Auto-run reconciliation if config has equations,
            // then refresh plots so _rec columns are available
            if (hasReconciliationConfig) {
                try {
                    await get().runReconciliation();
                } catch (err) {
                    console.warn('Auto-reconciliation on file refresh failed:', err);
                    // Continue with plot refresh even if reconciliation fails
                }
            }

            // Refresh all plots to pick up new data (and _rec columns if reconciled)
            await get().refreshAllPlots();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to update file';
            const currentWorkspaceId = get().activeWorkspaceId;

            if (currentWorkspaceId === targetWorkspaceId) {
                set({
                    isLoading: false,
                    error: message
                });
            } else {
                set((state: StoreState) => ({
                    workspaces: {
                        ...state.workspaces,
                        [targetWorkspaceId]: {
                            ...state.workspaces[targetWorkspaceId],
                            isLoading: false,
                            error: message
                        }
                    }
                }));
            }
        }
    },

    clearDataset: () => set((state: StoreState) => ({
        currentDataset: null,
        plantName: 'My Plant',
        plotData: {},
        visualizations: [],
        reconciliationResults: null,
        globalDateRange: null,
        columnDescriptions: {},
        aiGuidanceText: '',
        globalVariables: [],
        workspaceMeta: state.workspaceMeta.map(w =>
            w.id === state.activeWorkspaceId ? { ...w, name: 'My Plant' } : w
        )
    })),

    setGlobalDateRange: (range) => {
        set({ globalDateRange: range });
        // Refresh all plots to apply the new date range filter
        get().refreshAllPlots();
    },

    updateReconciliationConfig: (config) => set((state: StoreState) => ({
        reconciliationConfig: { ...state.reconciliationConfig, ...config }
    })),

    runReconciliation: async () => {
        const { currentDataset, reconciliationConfig, activeWorkspaceId: targetWorkspaceId } = get();
        if (!currentDataset) return;

        set({ isLoading: true, error: null });
        try {
            const results = await reconciliationApi.reconcile(
                currentDataset.id,
                reconciliationConfig
            );

            const currentWorkspaceId = get().activeWorkspaceId;
            if (currentWorkspaceId === targetWorkspaceId) {
                set({
                    reconciliationResults: results,
                    isLoading: false
                });
                // Refresh dataset to get updated columns (including _rec variables)
                await get().refreshCurrentDataset();
            } else {
                set((state: StoreState) => {
                    if (!state.workspaces[targetWorkspaceId]) return {};
                    return {
                        workspaces: {
                            ...state.workspaces,
                            [targetWorkspaceId]: {
                                ...state.workspaces[targetWorkspaceId],
                                reconciliationResults: results,
                                isLoading: false
                            }
                        }
                    };
                });
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Reconciliation failed';
            const currentWorkspaceId = get().activeWorkspaceId;

            if (currentWorkspaceId === targetWorkspaceId) {
                set({
                    isLoading: false,
                    error: message
                });
            } else {
                set((state: StoreState) => {
                    if (!state.workspaces[targetWorkspaceId]) return {};
                    return {
                        workspaces: {
                            ...state.workspaces,
                            [targetWorkspaceId]: {
                                ...state.workspaces[targetWorkspaceId],
                                isLoading: false,
                                error: message
                            }
                        }
                    };
                });
            }
        }
    },

    addGlobalVariable: (variable) => set((state: StoreState) => ({
        globalVariables: [...state.globalVariables, variable]
    })),

    updateGlobalVariable: (index, variable) => set((state: StoreState) => {
        const newVars = [...state.globalVariables];
        newVars[index] = variable;
        return { globalVariables: newVars };
    }),

    removeGlobalVariable: (index) => set((state: StoreState) => ({
        globalVariables: state.globalVariables.filter((_: GlobalVariable, i: number) => i !== index)
    })),

    setReconciliationResults: (results) => set({ reconciliationResults: results }),

    refreshCurrentDataset: async () => {
        const { currentDataset, activeWorkspaceId: targetWorkspaceId } = get();
        if (!currentDataset) return;
        try {
            const updated = await dataApi.getDataset(currentDataset.id);

            const currentWorkspaceId = get().activeWorkspaceId;
            if (currentWorkspaceId === targetWorkspaceId) {
                set({ currentDataset: updated });
            } else {
                set((state: StoreState) => {
                    if (!state.workspaces[targetWorkspaceId]) return {};
                    return {
                        workspaces: {
                            ...state.workspaces,
                            [targetWorkspaceId]: {
                                ...state.workspaces[targetWorkspaceId],
                                currentDataset: updated
                            }
                        }
                    };
                });
            }
        } catch (err) {
            console.error('Failed to refresh dataset', err);
        }
    },

    columnDescriptions: {},
    setColumnDescriptions: (descriptions) => set({ columnDescriptions: descriptions }),

    aiGuidanceText: '',
    setAiGuidanceText: (text) => set({ aiGuidanceText: text })
});
