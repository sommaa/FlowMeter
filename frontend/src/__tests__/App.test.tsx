import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '@/App';
import { useStore } from '@/store';

vi.mock('@/store', () => ({
    useStore: vi.fn(),
}));

vi.mock('@/hooks', () => ({
    useThemeEffect: vi.fn(),
}));

vi.mock('@/components/layout', () => ({
    Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
    TopBar: ({ onAddVisualization }: any) => (
        <div data-testid="topbar">
            <button onClick={onAddVisualization}>Add Viz</button>
        </div>
    ),
    ExportSettingsModal: ({ isOpen }: any) => isOpen ? <div data-testid="export-settings" /> : null,
    ExportDownloadModal: ({ isOpen }: any) => isOpen ? <div data-testid="export-download" /> : null,
    ExportDataModal: ({ isOpen }: any) => isOpen ? <div data-testid="export-data" /> : null,
    FloatingControls: () => <div data-testid="floating-controls" />,
}));

vi.mock('@/components/features/Dashboard/DashboardGrid', () => ({
    DashboardGrid: () => <div data-testid="dashboard-grid">Grid</div>,
}));

vi.mock('@/components/common', () => ({
    Alert: ({ message, onClose }: any) => <div data-testid="error-alert" onClick={onClose}>{message}</div>,
}));

vi.mock('@/components/features/Templates/TemplateManager', () => ({
    TemplateManager: () => null,
}));

vi.mock('@/components/onboarding/OnboardingWizard', () => ({
    OnboardingWizard: () => <div data-testid="onboarding">Welcome</div>,
}));

vi.mock('@/components/features/Storyline/StorylineModal', () => ({
    StorylineModal: () => null,
}));

const defaultState: Record<string, any> = {
    theme: 'system',
    isDarkMode: false,
    visualizations: [{ id: 'viz-1' }],
    error: null,
    setError: vi.fn(),
    isExportConfigOpen: false,
    setExportConfigOpen: vi.fn(),
    isExportDownloadOpen: false,
    setExportDownloadOpen: vi.fn(),
    isDataExportModalOpen: false,
    setDataExportModalOpen: vi.fn(),
    hasOnboarded: true,
    setHasOnboarded: vi.fn(),
    addVisualization: vi.fn(),
};

describe('App', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useStore).mockImplementation((selector: any) => selector(defaultState));
    });

    it('renders main layout components', () => {
        render(<App />);
        expect(screen.getByTestId('topbar')).toBeTruthy();
        expect(screen.getByTestId('sidebar')).toBeTruthy();
        expect(screen.getByTestId('dashboard-grid')).toBeTruthy();
        expect(screen.getByTestId('floating-controls')).toBeTruthy();
    });

    it('shows error alert when error exists', () => {
        vi.mocked(useStore).mockImplementation((selector: any) =>
            selector({ ...defaultState, error: 'Something went wrong' })
        );
        render(<App />);
        expect(screen.getByTestId('error-alert')).toBeTruthy();
        expect(screen.getByText('Something went wrong')).toBeTruthy();
    });

    it('does not show error alert when error is null', () => {
        render(<App />);
        expect(screen.queryByTestId('error-alert')).toBeNull();
    });

    it('shows onboarding wizard when not onboarded and no visualizations', () => {
        vi.mocked(useStore).mockImplementation((selector: any) =>
            selector({ ...defaultState, hasOnboarded: false, visualizations: [] })
        );
        render(<App />);
        expect(screen.getByTestId('onboarding')).toBeTruthy();
    });

    it('hides onboarding wizard when onboarded', () => {
        render(<App />);
        expect(screen.queryByTestId('onboarding')).toBeNull();
    });

    it('does not show export modals when closed', () => {
        render(<App />);
        expect(screen.queryByTestId('export-settings')).toBeNull();
        expect(screen.queryByTestId('export-download')).toBeNull();
    });
});
