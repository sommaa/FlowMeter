/**
 * Store Type Definitions - Zustand Store
 *
 * Central type definitions for the combined Zustand store:
 * - StoreState: Complete store interface (union of all slices)
 * - StoreSlice: Type helper for slice creation
 * - WorkspaceState: Serializable workspace snapshot
 * - WorkspaceMetadata: Workspace tab information
 *
 * The store uses a "slices" pattern where each domain (data, plots,
 * UI, workspaces, storyline) is defined in a separate slice with
 * its own state and actions, then combined into a single store.
 *
 * This follows Zustand best practices for large-scale state management.
 */
import { StateCreator } from 'zustand';

// Define the combined store type (recursive definition)
// We'll define the specific slice interfaces in their respective files
// and import them here to create the full StoreState
// Define what state belongs to a single workspace
export interface WorkspaceState {
    // DataSlice state
    plantName: string;
    comments: string;
    currentDataset: import('@/types').DatasetInfo | null;
    isLoading: boolean;
    error: string | null; // Added error here as it's often reset on workspace switch
    globalDateRange: { start: string; end: string } | null;
    reconciliationConfig: import('@/types').ReconciliationConfig;
    reconciliationResults: import('@/types').ReconciliationResponse | null;
    globalVariables: import('@/types').GlobalVariable[];
    columnDescriptions: Record<string, string>;
    aiGuidanceText: string;

    // PlotSlice state
    visualizations: import('@/types').VisualizationConfig[];
    plotData: Record<string, import('@/types').PlotDataResponse>;
    plotErrors: Record<string, string | null>;
    loadingPlots: Record<string, boolean>;
    visualizationColumns: number;
    vizCounter: number;

    // StorylineSlice state
    storylineEvents: import('@/types').StorylineEvent[];
}

export interface WorkspaceMetadata {
    id: string;
    name: string;
    createdAt: number;
}

export type StoreState = import('./dataSlice').DataSlice &
    import('./plotSlice').PlotSlice &
    import('./uiSlice').UISlice &
    import('./workspaceSlice').WorkspaceSlice &
    import('./storylineSlice').StorylineSlice;

export type StoreSlice<T> = StateCreator<
    StoreState,
    [["zustand/devtools", never], ["zustand/persist", unknown]],
    [],
    T
>;
