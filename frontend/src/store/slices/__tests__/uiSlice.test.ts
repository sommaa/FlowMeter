import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createUISlice, UISlice, ExportConfig } from '../uiSlice';

// Mock the API modules
vi.mock('@/services/api', () => ({
  exportApi: {
    exportDashboard: vi.fn(),
  },
}));

import { exportApi } from '@/services/api';

// Minimal cross-slice state needed by uiSlice
interface TestExtras {
  currentDataset: any;
  plantName: string;
  comments: string;
  globalDateRange: any;
  visualizations: any[];
  globalVariables: any[];
  reconciliationConfig: any;
  columnDescriptions: Record<string, string>;
  aiGuidanceText: string;
  storylineEvents: any[];
  activeWorkspaceId: string;
  updateWorkspaceName: (id: string, name: string) => void;
  setStorylineEvents: (events: any[]) => void;
  refreshAllPlots: () => Promise<void>;
  runReconciliation: () => Promise<void>;
}

type TestStore = UISlice & TestExtras;

const createTestStore = () =>
  create<TestStore>((set, get, api) => ({
    ...createUISlice(set as any, get as any, api as any),
    currentDataset: null,
    plantName: 'My Plant',
    comments: '',
    globalDateRange: null,
    visualizations: [],
    globalVariables: [],
    reconciliationConfig: { equations: [], sigma_mode: 'fixed_all', fixed_sigma: 1.0, sigma_values: {}, non_negative: true },
    columnDescriptions: {},
    aiGuidanceText: '',
    storylineEvents: [],
    activeWorkspaceId: 'default',
    updateWorkspaceName: vi.fn(),
    setStorylineEvents: vi.fn(),
    refreshAllPlots: vi.fn().mockResolvedValue(undefined),
    runReconciliation: vi.fn().mockResolvedValue(undefined),
  }));

describe('uiSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage between tests
    localStorage.clear();
    store = createTestStore();
  });

  describe('initial state', () => {
    it('has null error', () => {
      expect(store.getState().error).toBeNull();
    });

    it('has null notification', () => {
      expect(store.getState().notification).toBeNull();
    });

    it('has empty notifications array', () => {
      expect(store.getState().notifications).toEqual([]);
    });

    it('has isDarkMode false', () => {
      expect(store.getState().isDarkMode).toBe(false);
    });

    it('has teal theme', () => {
      expect(store.getState().theme).toBe('teal');
    });

    it('has sidebarOpen true', () => {
      expect(store.getState().sidebarOpen).toBe(true);
    });

    it('has sidebarWidth 280', () => {
      expect(store.getState().sidebarWidth).toBe(280);
    });

    it('has isSidebarTransitioning false', () => {
      expect(store.getState().isSidebarTransitioning).toBe(false);
    });

    it('has isTemplateManagerOpen false', () => {
      expect(store.getState().isTemplateManagerOpen).toBe(false);
    });

    it('has null currentTemplateName', () => {
      expect(store.getState().currentTemplateName).toBeNull();
    });

    it('has hasOnboarded false', () => {
      expect(store.getState().hasOnboarded).toBe(false);
    });

    it('has isExporting false', () => {
      expect(store.getState().isExporting).toBe(false);
    });

    it('has isExportConfigOpen false', () => {
      expect(store.getState().isExportConfigOpen).toBe(false);
    });

    it('has isExportDownloadOpen false', () => {
      expect(store.getState().isExportDownloadOpen).toBe(false);
    });

    it('has default export config', () => {
      const config = store.getState().exportConfig;
      expect(config.authorName).toBe('');
      expect(config.jobTitle).toBe('');
      expect(config.location).toBe('');
      expect(config.primaryColor).toBe('#FFD400');
      expect(config.secondaryColor).toBe('#005eb8');
      expect(config.logoBase64).toBeNull();
    });
  });

  describe('setError', () => {
    it('sets an error message', () => {
      store.getState().setError('Something went wrong');
      expect(store.getState().error).toBe('Something went wrong');
    });

    it('clears error when set to null', () => {
      store.getState().setError('error');
      store.getState().setError(null);
      expect(store.getState().error).toBeNull();
    });

    it('adds an error notification when error is set', () => {
      store.getState().setError('Error occurred');
      const notifications = store.getState().notifications;
      expect(notifications.length).toBeGreaterThanOrEqual(1);
      expect(notifications[0].type).toBe('error');
      expect(notifications[0].message).toBe('Error occurred');
    });
  });

  describe('setNotification', () => {
    it('sets a notification message', () => {
      store.getState().setNotification('Operation successful');
      expect(store.getState().notification).toBe('Operation successful');
    });

    it('clears notification when set to null', () => {
      store.getState().setNotification('message');
      store.getState().setNotification(null);
      expect(store.getState().notification).toBeNull();
    });

    it('adds a success notification to the notification center', () => {
      store.getState().setNotification('Done!');
      const notifications = store.getState().notifications;
      expect(notifications.length).toBeGreaterThanOrEqual(1);
      expect(notifications[0].type).toBe('success');
      expect(notifications[0].message).toBe('Done!');
    });
  });

  describe('addNotification', () => {
    it('adds a notification to the beginning of the array', () => {
      store.getState().addNotification('info', 'First');
      store.getState().addNotification('warning', 'Second');

      const notifications = store.getState().notifications;
      expect(notifications[0].message).toBe('Second');
      expect(notifications[1].message).toBe('First');
    });

    it('sets read to false and creates a timestamp', () => {
      store.getState().addNotification('success', 'New notification');
      const notification = store.getState().notifications[0];
      expect(notification.read).toBe(false);
      expect(notification.timestamp).toBeInstanceOf(Date);
    });

    it('limits notifications to 50', () => {
      for (let i = 0; i < 55; i++) {
        store.getState().addNotification('info', `Notification ${i}`);
      }
      expect(store.getState().notifications.length).toBeLessThanOrEqual(50);
    });

    it('assigns a unique id to each notification', () => {
      store.getState().addNotification('info', 'A');
      store.getState().addNotification('info', 'B');
      const ids = store.getState().notifications.map((n) => n.id);
      expect(new Set(ids).size).toBe(2);
    });
  });

  describe('markNotificationRead', () => {
    it('marks a specific notification as read', () => {
      store.getState().addNotification('info', 'Test');
      const id = store.getState().notifications[0].id;

      store.getState().markNotificationRead(id);
      expect(store.getState().notifications[0].read).toBe(true);
    });

    it('does not affect other notifications', () => {
      store.getState().addNotification('info', 'First');
      store.getState().addNotification('info', 'Second');

      const firstId = store.getState().notifications[1].id; // First added is at index 1
      store.getState().markNotificationRead(firstId);

      expect(store.getState().notifications[0].read).toBe(false); // Second
      expect(store.getState().notifications[1].read).toBe(true);  // First
    });
  });

  describe('clearNotification', () => {
    it('removes a specific notification by id', () => {
      store.getState().addNotification('info', 'Keep');
      store.getState().addNotification('error', 'Remove');

      const removeId = store.getState().notifications[0].id; // "Remove" is at index 0
      store.getState().clearNotification(removeId);

      const notifications = store.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].message).toBe('Keep');
    });
  });

  describe('clearAllNotifications', () => {
    it('removes all notifications', () => {
      store.getState().addNotification('info', 'A');
      store.getState().addNotification('warning', 'B');

      store.getState().clearAllNotifications();
      expect(store.getState().notifications).toEqual([]);
    });
  });

  describe('setCurrentTemplateName', () => {
    it('sets the template name', () => {
      store.getState().setCurrentTemplateName('My Template');
      expect(store.getState().currentTemplateName).toBe('My Template');
    });

    it('clears the template name', () => {
      store.getState().setCurrentTemplateName('template');
      store.getState().setCurrentTemplateName(null);
      expect(store.getState().currentTemplateName).toBeNull();
    });
  });

  describe('toggleDarkMode', () => {
    it('toggles dark mode on', () => {
      store.getState().toggleDarkMode();
      expect(store.getState().isDarkMode).toBe(true);
    });

    it('toggles dark mode off', () => {
      store.getState().toggleDarkMode();
      store.getState().toggleDarkMode();
      expect(store.getState().isDarkMode).toBe(false);
    });
  });

  describe('setTheme', () => {
    it('sets the theme', () => {
      store.getState().setTheme('violet');
      expect(store.getState().theme).toBe('violet');
    });

    it('accepts all valid theme ids', () => {
      const themes = ['teal', 'blue', 'violet', 'orange', 'rose'] as const;
      for (const theme of themes) {
        store.getState().setTheme(theme);
        expect(store.getState().theme).toBe(theme);
      }
    });
  });

  describe('toggleSidebar', () => {
    it('toggles sidebar closed', () => {
      store.getState().toggleSidebar();
      expect(store.getState().sidebarOpen).toBe(false);
    });

    it('toggles sidebar open again', () => {
      store.getState().toggleSidebar();
      store.getState().toggleSidebar();
      expect(store.getState().sidebarOpen).toBe(true);
    });

    it('sets isSidebarTransitioning to true', () => {
      store.getState().toggleSidebar();
      expect(store.getState().isSidebarTransitioning).toBe(true);
    });
  });

  describe('setSidebarWidth', () => {
    it('sets sidebar width', () => {
      store.getState().setSidebarWidth(350);
      expect(store.getState().sidebarWidth).toBe(350);
    });
  });

  describe('toggleTemplateManager', () => {
    it('opens the template manager', () => {
      store.getState().toggleTemplateManager();
      expect(store.getState().isTemplateManagerOpen).toBe(true);
    });

    it('closes the template manager', () => {
      store.getState().toggleTemplateManager();
      store.getState().toggleTemplateManager();
      expect(store.getState().isTemplateManagerOpen).toBe(false);
    });
  });

  describe('setTemplateManagerOpen', () => {
    it('sets the template manager open state', () => {
      store.getState().setTemplateManagerOpen(true);
      expect(store.getState().isTemplateManagerOpen).toBe(true);

      store.getState().setTemplateManagerOpen(false);
      expect(store.getState().isTemplateManagerOpen).toBe(false);
    });
  });

  describe('setHasOnboarded', () => {
    it('sets the onboarded flag', () => {
      store.getState().setHasOnboarded(true);
      expect(store.getState().hasOnboarded).toBe(true);
    });
  });

  describe('setExportConfig', () => {
    it('partially updates the export config', () => {
      store.getState().setExportConfig({ authorName: 'John' });
      expect(store.getState().exportConfig.authorName).toBe('John');
      // Other fields remain default
      expect(store.getState().exportConfig.primaryColor).toBe('#FFD400');
    });

    it('persists to localStorage', () => {
      store.getState().setExportConfig({ authorName: 'Jane', jobTitle: 'Engineer' });
      const stored = JSON.parse(localStorage.getItem('flowmeter-export-config') || '{}');
      expect(stored.authorName).toBe('Jane');
      expect(stored.jobTitle).toBe('Engineer');
    });
  });

  describe('setExportConfigOpen', () => {
    it('sets the export config modal state', () => {
      store.getState().setExportConfigOpen(true);
      expect(store.getState().isExportConfigOpen).toBe(true);

      store.getState().setExportConfigOpen(false);
      expect(store.getState().isExportConfigOpen).toBe(false);
    });
  });

  describe('setExportDownloadOpen', () => {
    it('sets the export download modal state', () => {
      store.getState().setExportDownloadOpen(true);
      expect(store.getState().isExportDownloadOpen).toBe(true);

      store.getState().setExportDownloadOpen(false);
      expect(store.getState().isExportDownloadOpen).toBe(false);
    });
  });

  describe('exportReport', () => {
    it('does nothing when no dataset is loaded', async () => {
      await store.getState().exportReport();
      expect(exportApi.exportDashboard).not.toHaveBeenCalled();
    });

    it('calls export API and triggers download on success', async () => {
      const mockBlob = new Blob(['<html>report</html>'], { type: 'text/html' });
      vi.mocked(exportApi.exportDashboard).mockResolvedValue(mockBlob);

      // Mock DOM APIs for download
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:test');
      const mockRevokeObjectURL = vi.fn();
      const mockLink = { href: '', download: '', click: vi.fn() };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any);
      window.URL.createObjectURL = mockCreateObjectURL;
      window.URL.revokeObjectURL = mockRevokeObjectURL;

      store.setState({ currentDataset: { id: 'ds-1' } });
      await store.getState().exportReport();

      expect(exportApi.exportDashboard).toHaveBeenCalled();
      expect(store.getState().isExporting).toBe(false);
      expect(mockLink.click).toHaveBeenCalled();
    });

    it('sets error on export failure', async () => {
      vi.mocked(exportApi.exportDashboard).mockRejectedValue(new Error('Export failed'));
      store.setState({ currentDataset: { id: 'ds-1' } });

      await store.getState().exportReport();
      expect(store.getState().isExporting).toBe(false);
      expect(store.getState().error).toBe('Export failed');
    });
  });

  describe('getTemplate', () => {
    it('returns a template config from current state', () => {
      store.setState({
        visualizations: [{ id: 'viz-1', title: 'Test' }] as any,
        plantName: 'Test Plant',
        comments: 'Test comments',
        reconciliationConfig: { equations: ['A=B'], sigma_mode: 'fixed_all', fixed_sigma: 1.0, sigma_values: {}, non_negative: true },
        globalVariables: [{ name: 'x', formula: 'a+b' }],
        storylineEvents: [{ id: '1', date: '2024-01-01', title: 'Event', description: 'Desc' }],
        columnDescriptions: { col1: 'Temperature' },
        aiGuidanceText: 'Guide text',
      });

      const template = store.getState().getTemplate();

      expect(template.plant_name).toBe('Test Plant');
      expect(template.comments).toBe('Test comments');
      expect(template.visualizations).toHaveLength(1);
      expect(template.global_variables).toHaveLength(1);
      expect(template.version).toBe('1.0');
      expect(template.created).toBeDefined();
      expect(template.column_descriptions).toEqual({ col1: 'Temperature' });
      expect(template.ai_guidance_text).toBe('Guide text');
    });
  });

  describe('loadTemplate', () => {
    it('loads template data into the store', async () => {
      store.setState({
        currentDataset: { id: 'ds-1' } as any,
      });

      const vizConfigs = [{ id: 'viz-1', title: 'Loaded' }] as any[];
      const reconcConfig = { equations: [], sigma_mode: 'fixed_all' as const, fixed_sigma: 1.0, sigma_values: {}, non_negative: true };
      const globalVars = [{ name: 'v1', formula: 'a+b' }];

      await store.getState().loadTemplate(
        vizConfigs,
        'Loaded Plant',
        'Loaded comments',
        reconcConfig,
        globalVars,
        { col1: 'desc' },
        'guidance',
        [{ id: '1', date: '2024-01-01', title: 'Event', description: 'Desc' }],
        'My Template'
      );

      const state = store.getState();
      expect(state.visualizations).toEqual(vizConfigs);
      expect(state.plantName).toBe('Loaded Plant');
      expect(state.comments).toBe('Loaded comments');
      expect(state.globalVariables).toEqual(globalVars);
      expect(state.columnDescriptions).toEqual({ col1: 'desc' });
      expect(state.aiGuidanceText).toBe('guidance');
      expect(state.currentTemplateName).toBe('My Template');
      expect(state.plotData).toEqual({});
      expect(state.reconciliationResults).toBeNull();
    });
  });
});
