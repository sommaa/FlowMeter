/**
 * Zustand Store Setup - Centralized State Management
 *
 * Creates and configures the main Zustand store by combining all slices:
 * - Data Slice: Dataset management and transformations
 * - Plot Slice: Visualization configurations and chart data
 * - UI Slice: Application UI state and modals
 * - Workspace Slice: Multi-tab dashboard management
 * - Storyline Slice: Timeline event annotations
 *
 * **Middleware Stack:**
 * - devtools: Redux DevTools integration (dev only)
 * - persist: LocalStorage persistence (dev only, disabled in prod)
 *
 * **Production Note:**
 * Persist middleware is DISABLED in production builds because it causes
 * infinite re-render loops in PyInstaller-bundled executables. Users
 * save/load dashboard configurations via the Template system instead.
 *
 * **Usage:**
 * ```tsx
 * import { useStore } from '@/store/useStore';
 *
 * function Component() {
 *   const dataset = useStore(state => state.currentDataset);
 *   const uploadFile = useStore(state => state.uploadFile);
 *   return <button onClick={() => uploadFile(file)}>Upload</button>;
 * }
 * ```
 */
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { StoreState } from './slices/types';
import { createDataSlice } from './slices/dataSlice';
import { createPlotSlice } from './slices/plotSlice';
import { createUISlice, ExportConfig } from './slices/uiSlice';
import { createWorkspaceSlice } from './slices/workspaceSlice';
import { createStorylineSlice } from './slices/storylineSlice';
import type { UseBoundStore, StoreApi } from 'zustand';

// Export types for backward compatibility
export type { ExportConfig };

// Check if we're in development mode (Vite injects this at build time)
const isDev = import.meta.env.DEV;

// Persist configuration (only used in dev)
const persistOptions = {
  name: 'flowmeter-storage',
  partialize: (state: StoreState) => ({
    isDarkMode: state.isDarkMode,
    theme: state.theme,
    sidebarWidth: state.sidebarWidth,
    exportConfig: state.exportConfig,
    visualizationColumns: state.visualizationColumns,
    globalVariables: state.globalVariables,
    reconciliationConfig: state.reconciliationConfig,
  }),
};

// Slice creator with explicit types
const sliceCreator = (set: any, get: any, api: any) => ({
  ...createDataSlice(set, get, api),
  ...createPlotSlice(set, get, api),
  ...createUISlice(set, get, api),
  ...createWorkspaceSlice(set, get, api),
  ...createStorylineSlice(set, get, api),
});

// Create the store based on environment
// In production: No persist to avoid EXE infinite loop
// In development: With persist for convenience
const createStoreImpl = (): UseBoundStore<StoreApi<StoreState>> => {
  if (isDev) {
    // Development build - with persistence
    return create<StoreState>()(
      devtools(
        persist(sliceCreator as any, persistOptions as any) as any
      ) as any
    );
  } else {
    // Production build - no persistence
    return create<StoreState>()(
      devtools(sliceCreator as any) as any
    );
  }
};

export const useStore = createStoreImpl();
