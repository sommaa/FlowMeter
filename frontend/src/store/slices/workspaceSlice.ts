/**
 * Workspace Management Slice - Zustand Store
 *
 * Manages multi-workspace functionality (tabbed dashboards):
 * - Workspace creation and deletion
 * - Tab switching with state preservation
 * - Per-workspace dataset and visualizations
 * - Workspace renaming and ordering
 *
 * Each workspace maintains independent state (dataset, plots,
 * global variables) allowing users to work on multiple analyses
 * simultaneously without conflicts.
 *
 * Active workspace state is stored in root store; inactive
 * workspaces are serialized to workspaces map for restoration.
 */
import { StoreSlice, WorkspaceState, WorkspaceMetadata, StoreState } from './types';
import { createDefaultReconciliationConfig } from '@/types';

/**
 * Workspace slice interface for multi-tab dashboard management.
 */
export interface WorkspaceSlice {
    // State
    workspaces: Record<string, WorkspaceState>; // Saved state of inactive workspaces
    workspaceMeta: WorkspaceMetadata[];         // Ordered list of workspaces (for tabs)
    activeWorkspaceId: string;

    // Actions
    addWorkspace: () => void;
    switchWorkspace: (workspaceId: string) => void;
    removeWorkspace: (workspaceId: string) => void;
    updateWorkspaceName: (workspaceId: string, name: string) => void;

    // Helper to get state for a simpler "swap"
    // (internal use mostly, but good to have)
}

// Helper to create a fresh workspace state
const createEmptyWorkspaceState = (): WorkspaceState => ({
    // DataSlice defaults
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

    // PlotSlice defaults
    visualizations: [],
    plotData: {},
    plotErrors: {},
    loadingPlots: {},
    visualizationColumns: 2,
    vizCounter: 0,

    // StorylineSlice defaults
    storylineEvents: [],
});

export const createWorkspaceSlice: StoreSlice<WorkspaceSlice> = (set, get) => ({
    workspaces: {},
    workspaceMeta: [{ id: 'default', name: 'Workspace 1', createdAt: Date.now() }],
    activeWorkspaceId: 'default',

    addWorkspace: () => {
        const newId = `workspace-${Date.now()}`;
        const newMeta = {
            id: newId,
            name: `Workspace ${get().workspaceMeta.length + 1}`,
            createdAt: Date.now()
        };

        // Save current active state to workspaces map
        const currentId = get().activeWorkspaceId;
        const currentState = get();

        set((state: StoreState) => ({
            workspaceMeta: [...state.workspaceMeta, newMeta],
            workspaces: {
                ...state.workspaces,
                [currentId]: {
                    plantName: currentState.plantName,
                    comments: currentState.comments,
                    currentDataset: currentState.currentDataset,
                    isLoading: currentState.isLoading,
                    error: currentState.error, // Save error state too? Maybe not.
                    globalDateRange: currentState.globalDateRange,
                    reconciliationConfig: currentState.reconciliationConfig,
                    reconciliationResults: currentState.reconciliationResults,
                    globalVariables: currentState.globalVariables,
                    columnDescriptions: currentState.columnDescriptions,
                    aiGuidanceText: currentState.aiGuidanceText,
                    visualizations: currentState.visualizations,
                    plotData: currentState.plotData,
                    plotErrors: currentState.plotErrors,
                    loadingPlots: currentState.loadingPlots,
                    visualizationColumns: currentState.visualizationColumns,
                    vizCounter: currentState.vizCounter,
                    storylineEvents: currentState.storylineEvents,
                }
            }
        }));

        // Switch to the new workspace (which involves clearing the root state)
        // We can just set the root state to empty defaults directly
        const defaults = createEmptyWorkspaceState();
        set({
            activeWorkspaceId: newId,
            ...defaults
        });
        // Reset storyline for new workspace
        get().setStorylineEvents([]);
    },

    switchWorkspace: (targetId) => {
        const { activeWorkspaceId, workspaces } = get();
        if (targetId === activeWorkspaceId) return;

        // 1. Save current root state to `workspaces[activeWorkspaceId]`
        const currentState = get();
        const currentSavedState: WorkspaceState = {
            plantName: currentState.plantName,
            comments: currentState.comments,
            currentDataset: currentState.currentDataset,
            isLoading: currentState.isLoading,
            error: currentState.error,
            globalDateRange: currentState.globalDateRange,
            reconciliationConfig: currentState.reconciliationConfig,
            reconciliationResults: currentState.reconciliationResults,
            globalVariables: currentState.globalVariables,
            columnDescriptions: currentState.columnDescriptions,
            aiGuidanceText: currentState.aiGuidanceText,
            visualizations: currentState.visualizations,
            plotData: currentState.plotData,
            plotErrors: currentState.plotErrors,
            loadingPlots: currentState.loadingPlots,
            visualizationColumns: currentState.visualizationColumns,
            vizCounter: currentState.vizCounter,
            storylineEvents: currentState.storylineEvents,
        };

        // 2. Load target state from `workspaces[targetId]` or create default if missing (shouldn't happen for valid IDs)
        const targetSavedState = workspaces[targetId] || createEmptyWorkspaceState();

        set((state: StoreState) => ({
            // Save current
            workspaces: {
                ...state.workspaces,
                [activeWorkspaceId]: currentSavedState,
                // Remove target from "storage" since it's becoming active (optional optimization, keeps map clean)
                // Actually, keeping it in map is fine, we just overwrite root. 
                // But to be clean we could omit it. Let's just overwrite map entry to be sure.
            },
            // Set Active ID
            activeWorkspaceId: targetId,
            // BLOW AWAY ROOT STATE with Target State
            ...targetSavedState
        }));
        // Restore storyline events for the target workspace
        get().setStorylineEvents(targetSavedState.storylineEvents || []);
    },

    removeWorkspace: (targetId) => {
        const { workspaceMeta, activeWorkspaceId, workspaces } = get();

        // Don't remove the last workspace
        if (workspaceMeta.length <= 1) return;

        const newMeta = workspaceMeta.filter(w => w.id !== targetId);

        // If we removed the active workspace, switch to the last available one
        if (targetId === activeWorkspaceId) {
            const nextWorkspace = newMeta[newMeta.length - 1]; // Switch to the one before it, or last one

            // We need to retrieve the state for the next workspace
            const nextState = workspaces[nextWorkspace.id] || createEmptyWorkspaceState();

            set((state: StoreState) => {
                // Remove target from workspaces map
                const { [targetId]: removed, ...remainingWorkspaces } = state.workspaces;

                return {
                    workspaceMeta: newMeta,
                    workspaces: remainingWorkspaces,
                    activeWorkspaceId: nextWorkspace.id,
                    ...nextState
                };
            });
            // Restore storyline events for the next workspace
            get().setStorylineEvents(nextState.storylineEvents || []);
        } else {
            // Just remove it from meta and storage
            set((state: StoreState) => {
                const { [targetId]: removed, ...remainingWorkspaces } = state.workspaces;
                return {
                    workspaceMeta: newMeta,
                    workspaces: remainingWorkspaces
                };
            });
        }
    },

    updateWorkspaceName: (id, name) => {
        set((state: StoreState) => ({
            workspaceMeta: state.workspaceMeta.map(w => w.id === id ? { ...w, name } : w)
        }));
    }
});
