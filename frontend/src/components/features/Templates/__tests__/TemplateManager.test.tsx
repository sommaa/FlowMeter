import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TemplateManager } from '../TemplateManager';
import { useStore } from '@/store';
import { templateApi } from '@/services/api';

vi.mock('@/store', () => ({
    useStore: vi.fn(),
}));

vi.mock('@/services/api', () => ({
    templateApi: {
        listSaved: vi.fn(),
        savePersistent: vi.fn(),
        loadSaved: vi.fn(),
        deleteSaved: vi.fn(),
        renameSaved: vi.fn(),
        load: vi.fn(),
    },
}));

vi.mock('@/components/common/ConfirmationModal', () => ({
    ConfirmationModal: ({ isOpen, onConfirm, onClose, title, message, confirmLabel }: any) =>
        isOpen ? (
            <div data-testid="confirmation-modal">
                <span data-testid="confirm-title">{title}</span>
                <span data-testid="confirm-message">{message}</span>
                <button data-testid="confirm-btn" onClick={() => { onConfirm(); onClose(); }}>
                    {confirmLabel}
                </button>
                <button data-testid="confirm-cancel" onClick={onClose}>
                    Cancel
                </button>
            </div>
        ) : null,
}));

const mockTemplates = [
    {
        name: 'template-alpha',
        last_modified: '2025-01-20T10:00:00Z',
        created: '2025-01-15T08:00:00Z',
        size_bytes: 2048,
        required_variables: ['Temperature', 'Pressure'],
    },
    {
        name: 'template-beta',
        last_modified: '2025-01-18T14:00:00Z',
        created: '2025-01-10T09:00:00Z',
        size_bytes: 4096,
        required_variables: ['Temperature', 'Flow', 'MissingVar'],
    },
];

const mockDataset = {
    id: 'ds-1',
    name: 'test.csv',
    rows: 100,
    columns: 3,
    column_names: ['Temperature', 'Pressure', 'Flow'],
    numeric_columns: ['Temperature', 'Pressure', 'Flow'],
    datetime_columns: [],
    memory_usage_kb: 50,
    uploaded_at: '2025-01-01T00:00:00Z',
};

describe('TemplateManager', () => {
    const mockToggleTemplateManager = vi.fn();
    const mockSetTemplateManagerOpen = vi.fn();
    const mockGetTemplate = vi.fn().mockReturnValue({ visualizations: [] });
    const mockLoadTemplate = vi.fn().mockResolvedValue(undefined);
    const mockSetNotification = vi.fn();
    const mockSetCurrentTemplateName = vi.fn();

    const setupMock = (overrides: Record<string, any> = {}) => {
        const state: Record<string, any> = {
            isTemplateManagerOpen: true,
            toggleTemplateManager: mockToggleTemplateManager,
            setTemplateManagerOpen: mockSetTemplateManagerOpen,
            getTemplate: mockGetTemplate,
            loadTemplate: mockLoadTemplate,
            setNotification: mockSetNotification,
            setCurrentTemplateName: mockSetCurrentTemplateName,
            currentDataset: mockDataset,
            ...overrides,
        };
        vi.mocked(useStore).mockImplementation((selector: any) => selector(state));
    };

    beforeEach(() => {
        vi.clearAllMocks();
        setupMock();
        vi.mocked(templateApi.listSaved).mockResolvedValue(mockTemplates);
    });

    it('renders modal with title when open', async () => {
        render(<TemplateManager />);
        await waitFor(() => {
            expect(screen.getByText('Template Manager')).toBeTruthy();
        });
    });

    it('does not render content when closed', () => {
        setupMock({ isTemplateManagerOpen: false });
        render(<TemplateManager />);
        expect(screen.queryByText('Template Manager')).toBeNull();
    });

    it('loads and displays templates on open', async () => {
        render(<TemplateManager />);
        await waitFor(() => {
            expect(templateApi.listSaved).toHaveBeenCalled();
            expect(screen.getByText('template-alpha')).toBeTruthy();
            expect(screen.getByText('template-beta')).toBeTruthy();
        });
    });

    it('shows loading spinner while fetching templates', () => {
        vi.mocked(templateApi.listSaved).mockImplementation(
            () => new Promise(() => {}) // never resolves
        );
        render(<TemplateManager />);
        expect(screen.getByText('Loading templates...')).toBeTruthy();
    });

    it('shows empty state when no templates exist', async () => {
        vi.mocked(templateApi.listSaved).mockResolvedValue([]);
        render(<TemplateManager />);
        await waitFor(() => {
            expect(screen.getByText('No saved templates found.')).toBeTruthy();
        });
    });

    it('shows "Recommended" badge for compatible templates', async () => {
        render(<TemplateManager />);
        await waitFor(() => {
            // template-alpha requires Temperature, Pressure - both in dataset
            expect(screen.getByText('Recommended')).toBeTruthy();
        });
    });

    it('shows "Missing Vars" badge for incompatible templates', async () => {
        render(<TemplateManager />);
        await waitFor(() => {
            // template-beta requires MissingVar which is not in dataset
            expect(screen.getByText('Missing Vars')).toBeTruthy();
        });
    });

    it('shows file size and date for each template', async () => {
        render(<TemplateManager />);
        await waitFor(() => {
            // template-alpha: 2048 bytes = 2.0 KB
            expect(screen.getByText('2.0 KB')).toBeTruthy();
            // template-beta: 4096 bytes = 4.0 KB
            expect(screen.getByText('4.0 KB')).toBeTruthy();
        });
    });

    it('opens save dialog when Save Current Config is clicked', async () => {
        render(<TemplateManager />);
        await waitFor(() => {
            expect(screen.getByText('Save Current Config')).toBeTruthy();
        });

        fireEvent.click(screen.getByText('Save Current Config'));

        expect(screen.getByText('Save Template')).toBeTruthy();
        expect(screen.getByPlaceholderText('My Template')).toBeTruthy();
    });

    it('saves template through the save dialog', async () => {
        vi.mocked(templateApi.savePersistent).mockResolvedValue({});
        render(<TemplateManager />);
        await waitFor(() => {
            expect(screen.getByText('Save Current Config')).toBeTruthy();
        });

        fireEvent.click(screen.getByText('Save Current Config'));

        const nameInput = screen.getByPlaceholderText('My Template');
        fireEvent.change(nameInput, { target: { value: 'My New Template' } });

        // Click the Save button in the dialog
        const saveButtons = screen.getAllByText('Save');
        const saveBtn = saveButtons.find(
            btn => btn.closest('button')?.getAttribute('type') === 'submit'
        );
        if (saveBtn) {
            fireEvent.click(saveBtn);
        }

        await waitFor(() => {
            expect(templateApi.savePersistent).toHaveBeenCalledWith(
                'My New Template',
                expect.any(Object),
                false
            );
        });
    });

    it('shows confirmation modal when requesting to load a template', async () => {
        render(<TemplateManager />);
        await waitFor(() => {
            expect(screen.getByText('template-alpha')).toBeTruthy();
        });

        // Find and click the Apply button (ArrowRight icon) for the first template
        const applyBtns = document.body.querySelectorAll('button[title="Apply Template"]');
        expect(applyBtns.length).toBeGreaterThan(0);
        fireEvent.click(applyBtns[0]);

        expect(screen.getByTestId('confirmation-modal')).toBeTruthy();
        expect(screen.getByTestId('confirm-title').textContent).toBe('Load Template');
    });

    it('shows confirmation modal when requesting to delete a template', async () => {
        render(<TemplateManager />);
        await waitFor(() => {
            expect(screen.getByText('template-alpha')).toBeTruthy();
        });

        const deleteBtns = document.body.querySelectorAll('button[title="Delete"]');
        expect(deleteBtns.length).toBeGreaterThan(0);
        fireEvent.click(deleteBtns[0]);

        expect(screen.getByTestId('confirmation-modal')).toBeTruthy();
        expect(screen.getByTestId('confirm-title').textContent).toBe('Delete Template');
    });

    it('calls toggleTemplateManager when Close button is clicked', async () => {
        render(<TemplateManager />);
        await waitFor(() => {
            // "Close" appears both as button text and sr-only span in Dialog
            expect(screen.getAllByText('Close').length).toBeGreaterThanOrEqual(1);
        });
        const closeButtons = screen.getAllByText('Close');
        fireEvent.click(closeButtons[0]);
        expect(mockToggleTemplateManager).toHaveBeenCalledTimes(1);
    });

    it('shows error message when template load fails', async () => {
        vi.mocked(templateApi.listSaved).mockRejectedValue(
            new Error('Server error')
        );
        render(<TemplateManager />);
        await waitFor(() => {
            expect(screen.getByText('Server error')).toBeTruthy();
        });
    });

    it('shows storage location info in sidebar', async () => {
        render(<TemplateManager />);
        await waitFor(() => {
            expect(screen.getByText('data/templates/')).toBeTruthy();
        });
    });

    it('enters rename mode when Rename button is clicked', async () => {
        render(<TemplateManager />);
        await waitFor(() => {
            expect(screen.getByText('template-alpha')).toBeTruthy();
        });

        const renameBtns = document.body.querySelectorAll('button[title="Rename"]');
        expect(renameBtns.length).toBeGreaterThan(0);
        fireEvent.click(renameBtns[0]);

        // Should show an input with the template name
        const renameInput = screen.getByDisplayValue('template-alpha');
        expect(renameInput).toBeTruthy();
    });
});
