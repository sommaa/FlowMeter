import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '@/components/layout/Sidebar';
import { useStore } from '@/store';

// Mock the store
vi.mock('@/store', () => ({
  useStore: vi.fn(),
}));

// Mock the API services
vi.mock('@/services/api', () => ({
  templateApi: {
    listSaved: vi.fn().mockResolvedValue([]),
    savePersistent: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock complex child components
vi.mock('@/components/features/DataManagement/FileUpload', () => ({
  FileUpload: () => <div data-testid="file-upload">FileUpload</div>,
}));

vi.mock('@/components/common/CommentEditorModal', () => ({
  CommentEditorModal: ({ isOpen }: any) =>
    isOpen ? <div data-testid="comment-editor-modal">CommentEditorModal</div> : null,
}));

vi.mock('@/components/features/Reconciliation/ReconciliationModal', () => ({
  ReconciliationModal: ({ isOpen }: any) =>
    isOpen ? <div data-testid="reconciliation-modal">ReconciliationModal</div> : null,
}));

vi.mock('@/components/common/ConfirmationModal', () => ({
  ConfirmationModal: ({ isOpen, onConfirm, title }: any) =>
    isOpen ? (
      <div data-testid="confirmation-modal">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
      </div>
    ) : null,
}));

vi.mock('@/components/features/GlobalVariables/GlobalVariablesModal', () => ({
  GlobalVariablesModal: ({ isOpen }: any) =>
    isOpen ? <div data-testid="global-vars-modal">GlobalVariablesModal</div> : null,
}));

vi.mock('@/components/features/AI', () => ({
  AIWizardModal: ({ isOpen }: any) =>
    isOpen ? <div data-testid="ai-wizard-modal">AIWizardModal</div> : null,
}));

describe('Sidebar', () => {
  const mockClearDataset = vi.fn();
  const mockClearVisualizations = vi.fn();
  const mockSetExportDownloadOpen = vi.fn();
  const mockAddVisualization = vi.fn();
  const mockSetComments = vi.fn();
  const mockSetCurrentTemplateName = vi.fn();
  const mockGetTemplate = vi.fn();
  const mockSetNotification = vi.fn();
  const mockSetError = vi.fn();
  const mockSetPlantName = vi.fn();
  const mockUpdateWorkspaceName = vi.fn();

  const defaultStoreState = {
    comments: '',
    setComments: mockSetComments,
    currentDataset: null,
    clearDataset: mockClearDataset,
    visualizations: [],
    addVisualization: mockAddVisualization,
    clearVisualizations: mockClearVisualizations,
    setExportDownloadOpen: mockSetExportDownloadOpen,
    globalVariables: [],
    currentTemplateName: '',
    setCurrentTemplateName: mockSetCurrentTemplateName,
    getTemplate: mockGetTemplate,
    setNotification: mockSetNotification,
    setError: mockSetError,
    plantName: '',
    setPlantName: mockSetPlantName,
    updateWorkspaceName: mockUpdateWorkspaceName,
    activeWorkspaceId: 'ws-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector(defaultStoreState)
    );
  });

  it('renders Upload Data button when no dataset loaded', () => {
    render(<Sidebar isExpanded />);
    expect(screen.getByText('Upload Data')).toBeInTheDocument();
  });

  it('shows dataset name when a dataset is loaded (expanded)', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        currentDataset: { id: '1', name: 'my_data.csv' },
      })
    );
    render(<Sidebar isExpanded />);
    expect(screen.getByText('my_data.csv')).toBeInTheDocument();
  });

  it('renders comments button with "Add Comments" label when no comments', () => {
    render(<Sidebar isExpanded />);
    expect(screen.getByText('Add Comments')).toBeInTheDocument();
  });

  it('renders comments button with "Comments" label when comments exist', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, comments: 'Some comments' })
    );
    render(<Sidebar isExpanded />);
    expect(screen.getByText('Comments')).toBeInTheDocument();
  });

  it('disables Global Variables, AI Suggestions, Reconcile, and Export when no dataset', () => {
    render(<Sidebar isExpanded />);
    const variablesBtn = screen.getByText('Variables').closest('button');
    const aiBtn = screen.getByText('AI Suggestions').closest('button');
    const reconcileBtn = screen.getByText('Reconcile Data').closest('button');
    const exportBtn = screen.getByText('Export Report').closest('button');
    expect(variablesBtn).toBeDisabled();
    expect(aiBtn).toBeDisabled();
    expect(reconcileBtn).toBeDisabled();
    expect(exportBtn).toBeDisabled();
  });

  it('enables action buttons when dataset is loaded', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        currentDataset: { id: '1', name: 'test.csv' },
      })
    );
    render(<Sidebar isExpanded />);
    const aiBtn = screen.getByText('AI Suggestions').closest('button');
    const reconcileBtn = screen.getByText('Reconcile Data').closest('button');
    const exportBtn = screen.getByText('Export Report').closest('button');
    expect(aiBtn).not.toBeDisabled();
    expect(reconcileBtn).not.toBeDisabled();
    expect(exportBtn).not.toBeDisabled();
  });

  it('displays global variables count in label when variables exist', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        currentDataset: { id: '1', name: 'test.csv' },
        globalVariables: [
          { name: 'var1', formula: 'x+1' },
          { name: 'var2', formula: 'x*2' },
        ],
      })
    );
    render(<Sidebar isExpanded />);
    expect(screen.getByText('Variables (2)')).toBeInTheDocument();
  });

  it('disables Clear All button when no visualizations exist', () => {
    render(<Sidebar isExpanded />);
    const clearBtn = screen.getByText('Clear All').closest('button');
    expect(clearBtn).toBeDisabled();
  });

  it('shows visualization count in Clear All label when visualizations exist', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        visualizations: [{ id: '1' }, { id: '2' }, { id: '3' }],
      })
    );
    render(<Sidebar isExpanded />);
    expect(screen.getByText('Clear All (3)')).toBeInTheDocument();
  });

  it('calls setExportDownloadOpen when Export Report is clicked', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        currentDataset: { id: '1', name: 'test.csv' },
      })
    );
    render(<Sidebar isExpanded />);
    fireEvent.click(screen.getByText('Export Report'));
    expect(mockSetExportDownloadOpen).toHaveBeenCalledWith(true);
  });

  it('renders in collapsed mode without text labels', () => {
    render(<Sidebar isExpanded={false} />);
    // In collapsed mode, text labels are not rendered (only icons)
    expect(screen.queryByText('Upload Data')).not.toBeInTheDocument();
    expect(screen.queryByText('Add Comments')).not.toBeInTheDocument();
  });
});
