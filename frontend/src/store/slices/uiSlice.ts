/**
 * UI/UX Slice - Zustand Store
 *
 * Manages application UI state and user interactions:
 * - Theme selection (light/dark modes)
 * - Modal visibility (templates, export, reconciliation)
 * - Sidebar state and expansion
 * - Export configuration
 * - Loading states and error messages
 * - Onboarding wizard
 *
 * This slice handles all transient UI state that doesn't
 * persist across sessions (except theme preference).
 */
import { StoreSlice } from './types';
import { ThemeId } from '@/lib/themes';
import { exportApi, settingsApi } from '@/services/api';
import { TemplateConfig, ReconciliationConfig, GlobalVariable, VisualizationConfig, StorylineEvent } from '@/types';

/**
 * Export configuration for HTML reports.
 */
export interface ExportConfig {
    authorName: string;
    jobTitle: string;
    location: string;
    primaryColor: string;
    secondaryColor: string;
    logoBase64: string | null;
}

// Notification types for the notification center
export interface NotificationItem {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    timestamp: Date;
    read: boolean;
}

export interface UISlice {
    // State
    error: string | null;
    notification: string | null;
    notifications: NotificationItem[];

    isDarkMode: boolean;
    theme: ThemeId;
    sidebarOpen: boolean;
    sidebarWidth: number;
    isSidebarTransitioning: boolean;
    isTemplateManagerOpen: boolean;
    currentTemplateName: string | null;

    // Security: opt-out of the formula sandbox (persisted in localStorage,
    // mirrored to the backend). Default off.
    allowUnsafeFormulas: boolean;

    // Export UI State
    exportConfig: ExportConfig;
    isExporting: boolean;
    isExportConfigOpen: boolean;
    isExportDownloadOpen: boolean;
    isDataExporting: boolean;
    isDataExportModalOpen: boolean;

    // Actions
    setError: (error: string | null) => void;
    setNotification: (message: string | null) => void;
    addNotification: (type: NotificationItem['type'], message: string) => void;
    markNotificationRead: (id: string) => void;
    clearNotification: (id: string) => void;
    clearAllNotifications: () => void;
    setCurrentTemplateName: (name: string | null) => void;

    toggleDarkMode: () => void;
    setTheme: (theme: ThemeId) => void;
    toggleSidebar: () => void;
    setSidebarWidth: (width: number) => void;
    toggleTemplateManager: () => void;
    setTemplateManagerOpen: (isOpen: boolean) => void;

    // Security Actions
    setAllowUnsafeFormulas: (value: boolean) => void;

    // Onboarding State
    hasOnboarded: boolean;
    setHasOnboarded: (hasOnboarded: boolean) => void;

    // Export Actions
    setExportConfig: (config: Partial<ExportConfig>) => void;
    setExportConfigOpen: (isOpen: boolean) => void;
    setExportDownloadOpen: (isOpen: boolean) => void;
    exportReport: (reportSections?: { comments: boolean; storyline: boolean; statistics: boolean; visualizations: boolean }) => Promise<void>;
    setDataExportModalOpen: (isOpen: boolean) => void;
    exportData: (sections: { original_data: boolean; reconciled_variables: boolean; global_variables: boolean; formula_results: boolean }) => Promise<void>;

    // Template Actions
    getTemplate: () => TemplateConfig;
    loadTemplate: (
        visualizations: VisualizationConfig[],
        plantName: string,
        comments: string,
        reconciliationConfig: ReconciliationConfig,
        globalVariables: GlobalVariable[],
        columnDescriptions?: Record<string, string>,
        aiGuidanceText?: string,
        storylineEvents?: StorylineEvent[],
        templateName?: string
    ) => Promise<void>;
}

// LocalStorage key for export config persistence
const EXPORT_CONFIG_STORAGE_KEY = 'flowmeter-export-config';

// LocalStorage key for the formula-sandbox opt-out (source of truth, re-pushed
// to the backend on startup). Defaults to off when unset.
export const ALLOW_UNSAFE_FORMULAS_STORAGE_KEY = 'allow_unsafe_formulas';

const loadAllowUnsafeFormulas = (): boolean => {
    try {
        return localStorage.getItem(ALLOW_UNSAFE_FORMULAS_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

// Helper to load export config from localStorage
const loadExportConfig = (): ExportConfig => {
    const defaultConfig: ExportConfig = {
        authorName: '',
        jobTitle: '',
        location: '',
        primaryColor: '#FFD400',
        secondaryColor: '#005eb8',
        logoBase64: null,
    };

    try {
        const stored = localStorage.getItem(EXPORT_CONFIG_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...defaultConfig, ...parsed };
        }
    } catch (e) {
        console.warn('Failed to load export config from localStorage:', e);
    }
    return defaultConfig;
};

// Helper to save export config to localStorage
const saveExportConfig = (config: ExportConfig): void => {
    try {
        localStorage.setItem(EXPORT_CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
        console.warn('Failed to save export config to localStorage:', e);
    }
};

export const createUISlice: StoreSlice<UISlice> = (set, get) => ({
    error: null,
    notification: null,
    notifications: [],

    isDarkMode: false,
    theme: 'teal',
    sidebarOpen: true,
    sidebarWidth: 280,
    isSidebarTransitioning: false,
    isTemplateManagerOpen: false,
    currentTemplateName: null,

    allowUnsafeFormulas: loadAllowUnsafeFormulas(),

    hasOnboarded: false,
    setHasOnboarded: (hasOnboarded) => set({ hasOnboarded }),

    exportConfig: loadExportConfig(),
    isExporting: false,
    isExportConfigOpen: false,
    isExportDownloadOpen: false,
    isDataExporting: false,
    isDataExportModalOpen: false,

    setError: (error) => {
        set({ error });
        if (error) {
            get().addNotification('error', error);
        }
    },
    setNotification: (notification) => {
        set({ notification });
        // Also add to notification center
        if (notification) {
            get().addNotification('success', notification);
        }
    },

    addNotification: (type, message) => set((state) => ({
        notifications: [
            {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type,
                message,
                timestamp: new Date(),
                read: false,
            },
            ...state.notifications.slice(0, 49), // Keep max 50 notifications
        ]
    })),

    markNotificationRead: (id) => set((state) => ({
        notifications: state.notifications.map(n =>
            n.id === id ? { ...n, read: true } : n
        )
    })),

    clearNotification: (id) => set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
    })),

    clearAllNotifications: () => set({ notifications: [] }),
    setCurrentTemplateName: (name) => set({ currentTemplateName: name }),

    toggleDarkMode: () => set((state) => {
        const newMode = !state.isDarkMode;
        if (newMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        return { isDarkMode: newMode };
    }),

    setTheme: (theme) => set({ theme }),
    toggleSidebar: () => {
        set({ isSidebarTransitioning: true });
        set((state) => ({ sidebarOpen: !state.sidebarOpen }));
        setTimeout(() => {
            set({ isSidebarTransitioning: false });
        }, 350); // 300ms transition + 50ms buffer
    },
    setSidebarWidth: (width) => set({ sidebarWidth: width }),
    toggleTemplateManager: () => set((state) => ({ isTemplateManagerOpen: !state.isTemplateManagerOpen })),
    setTemplateManagerOpen: (isOpen) => set({ isTemplateManagerOpen: isOpen }),

    setAllowUnsafeFormulas: (value) => {
        set({ allowUnsafeFormulas: value });
        try {
            localStorage.setItem(ALLOW_UNSAFE_FORMULAS_STORAGE_KEY, String(value));
        } catch (e) {
            console.warn('Failed to persist allowUnsafeFormulas:', e);
        }
        // Mirror the choice to the backend runtime flag.
        settingsApi.setSecurity(value).catch((e) => {
            console.warn('Failed to sync formula-safety setting to backend:', e);
        });
    },

    setExportConfig: (config) => set((state) => {
        const newConfig = { ...state.exportConfig, ...config };
        saveExportConfig(newConfig);
        return { exportConfig: newConfig };
    }),
    setExportConfigOpen: (isOpen) => set({ isExportConfigOpen: isOpen }),
    setExportDownloadOpen: (isOpen) => set({ isExportDownloadOpen: isOpen }),
    setDataExportModalOpen: (isOpen) => set({ isDataExportModalOpen: isOpen }),

    exportData: async (sections) => {
        const { currentDataset, plantName, globalDateRange, visualizations, globalVariables } = get();
        if (!currentDataset) return;

        set({ isDataExporting: true, error: null });

        try {
            const formulaVizs = visualizations.filter(v => v.viz_type === 'formula');

            const blob = await exportApi.exportData({
                dataset_id: currentDataset.id,
                date_range: globalDateRange,
                global_variables: globalVariables,
                formula_visualizations: formulaVizs,
                sections,
            });

            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const dateStr = new Date().toISOString().slice(2, 10);
            link.download = `${plantName.replace(/\s+/g, '_')}_Data_${dateStr}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            set({ isDataExporting: false, isDataExportModalOpen: false });
            get().addNotification('success', 'Data exported successfully');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to export data';
            console.error('Data export failed:', err);
            set({ isDataExporting: false, error: message });
            get().addNotification('error', message);
        }
    },

    exportReport: async (reportSections) => {
        const { exportConfig, currentDataset, plantName, comments, globalDateRange, visualizations, globalVariables } = get();
        // Assuming get() has access to StoreState.

        if (!currentDataset) return;

        set({ isExporting: true, error: null });

        try {
            const blob = await exportApi.exportDashboard({
                dataset_id: currentDataset.id,
                visualizations,
                plant_name: plantName,
                comments: comments,
                date_range: globalDateRange,
                global_variables: globalVariables,
                settings: {
                    author_name: exportConfig.authorName,
                    job_title: exportConfig.jobTitle,
                    location: exportConfig.location,
                    primary_color: exportConfig.primaryColor,
                    secondary_color: exportConfig.secondaryColor,
                    logo_base64: exportConfig.logoBase64 || undefined
                },
                storyline_events: get().storylineEvents,
                report_sections: reportSections
            });

            // Create download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const dateStr = new Date().toISOString().slice(2, 10);
            link.download = `${plantName.replace(/\s+/g, '_')}_Report_${dateStr}.html`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            set({ isExporting: false, isExportDownloadOpen: false, notification: 'Report downloaded successfully' });
            get().addNotification('success', 'Report downloaded successfully');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to generate report';
            console.error('Export failed:', err);
            set({
                isExporting: false,
                error: message
            });
            get().addNotification('error', message);
        }
    },

    getTemplate: () => {
        const state = get();
        return {
            visualizations: state.visualizations,
            plant_name: state.plantName,
            comments: state.comments,
            reconciliation_config: state.reconciliationConfig,
            global_variables: state.globalVariables,
            storyline_events: state.storylineEvents,
            column_descriptions: state.columnDescriptions,
            ai_guidance_text: state.aiGuidanceText,
            version: '1.0',
            created: new Date().toISOString()
        };
    },

    loadTemplate: async (visualizations, plantName, comments, reconciliationConfig, globalVariables, columnDescriptions, aiGuidanceText, storylineEvents, templateName) => {
        const { refreshAllPlots, runReconciliation, currentDataset, setNotification, activeWorkspaceId, updateWorkspaceName, setStorylineEvents } = get();

        // Update the tab name to match component/plant name from template
        updateWorkspaceName(activeWorkspaceId, plantName);


        set({
            visualizations,
            plantName,
            comments,
            reconciliationConfig,
            globalVariables,
            columnDescriptions: columnDescriptions || {},
            aiGuidanceText: aiGuidanceText || '',
            currentTemplateName: templateName ?? null,
            // Clear derived data to force refresh
            plotData: {},
            reconciliationResults: null
        });

        // Restore storyline events
        setStorylineEvents(storylineEvents || []);

        // Auto-run reconciliation if template has equations and dataset is loaded
        if (currentDataset && reconciliationConfig?.equations?.length > 0) {
            try {
                await runReconciliation();
                setNotification('Reconciliation completed automatically');
            } catch (err) {
                console.warn('Auto-reconciliation failed:', err);
                // Continue with plot refresh even if reconciliation fails
            }
        }

        if (currentDataset) {
            await refreshAllPlots();
        }
    }
});
