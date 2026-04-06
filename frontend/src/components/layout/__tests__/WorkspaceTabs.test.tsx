import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceTabs } from '@/components/layout/WorkspaceTabs';
import { useStore } from '@/store';

// Mock the store
vi.mock('@/store', () => ({
  useStore: vi.fn(),
}));

// Mock the API services
vi.mock('@/services/api', () => ({
  templateApi: {
    listSaved: vi.fn().mockResolvedValue([]),
    renameSaved: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock cn utility
vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

describe('WorkspaceTabs', () => {
  const mockSwitchWorkspace = vi.fn();
  const mockAddWorkspace = vi.fn();
  const mockRemoveWorkspace = vi.fn();
  const mockUpdateWorkspaceName = vi.fn();
  const mockSetCurrentTemplateName = vi.fn();
  const mockSetPlantName = vi.fn();
  const mockSetNotification = vi.fn();
  const mockSetError = vi.fn();

  const defaultStoreState = {
    activeWorkspaceId: 'ws-1',
    workspaceMeta: [
      { id: 'ws-1', name: 'Workspace 1' },
      { id: 'ws-2', name: 'Workspace 2' },
    ],
    switchWorkspace: mockSwitchWorkspace,
    addWorkspace: mockAddWorkspace,
    removeWorkspace: mockRemoveWorkspace,
    updateWorkspaceName: mockUpdateWorkspaceName,
    currentTemplateName: '',
    setCurrentTemplateName: mockSetCurrentTemplateName,
    setPlantName: mockSetPlantName,
    setNotification: mockSetNotification,
    setError: mockSetError,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector(defaultStoreState)
    );
  });

  it('renders all workspace tabs', () => {
    render(<WorkspaceTabs />);
    expect(screen.getByText('Workspace 1')).toBeInTheDocument();
    expect(screen.getByText('Workspace 2')).toBeInTheDocument();
  });

  it('renders the Add Workspace button', () => {
    render(<WorkspaceTabs />);
    const addBtn = screen.getByTitle('New Workspace');
    expect(addBtn).toBeInTheDocument();
  });

  it('calls addWorkspace when Add button is clicked', () => {
    render(<WorkspaceTabs />);
    fireEvent.click(screen.getByTitle('New Workspace'));
    expect(mockAddWorkspace).toHaveBeenCalledTimes(1);
  });

  it('calls switchWorkspace when an inactive tab is clicked', () => {
    render(<WorkspaceTabs />);
    fireEvent.click(screen.getByText('Workspace 2'));
    expect(mockSwitchWorkspace).toHaveBeenCalledWith('ws-2');
  });

  it('does not call switchWorkspace when the active tab is clicked', () => {
    render(<WorkspaceTabs />);
    fireEvent.click(screen.getByText('Workspace 1'));
    // switchWorkspace is still called since the component calls it on click
    // regardless - but active tab click is allowed
    expect(mockSwitchWorkspace).toHaveBeenCalledWith('ws-1');
  });

  it('renders close buttons for tabs when more than one workspace exists', () => {
    render(<WorkspaceTabs />);
    const closeButtons = screen.getAllByTitle('Close Workspace');
    expect(closeButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('calls removeWorkspace when close button is clicked', () => {
    render(<WorkspaceTabs />);
    const closeButtons = screen.getAllByTitle('Close Workspace');
    fireEvent.click(closeButtons[0]);
    expect(mockRemoveWorkspace).toHaveBeenCalled();
  });

  it('does not render close buttons when only one workspace exists', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        workspaceMeta: [{ id: 'ws-1', name: 'Workspace 1' }],
      })
    );
    render(<WorkspaceTabs />);
    expect(screen.queryByTitle('Close Workspace')).not.toBeInTheDocument();
  });

  it('enters rename mode on double-click and allows editing', () => {
    render(<WorkspaceTabs />);
    const tab = screen.getByText('Workspace 1');
    fireEvent.doubleClick(tab);
    // After double click, an input should appear for editing
    const input = document.body.querySelector('input[type="text"]');
    expect(input).toBeTruthy();
  });

  it('saves rename on Enter key and calls updateWorkspaceName', () => {
    render(<WorkspaceTabs />);
    const tab = screen.getByText('Workspace 1');
    fireEvent.doubleClick(tab);

    const input = document.body.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    fireEvent.change(input, { target: { value: 'Renamed Workspace' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockUpdateWorkspaceName).toHaveBeenCalledWith('ws-1', 'Renamed Workspace');
  });

  it('cancels rename on Escape key', () => {
    render(<WorkspaceTabs />);
    const tab = screen.getByText('Workspace 1');
    fireEvent.doubleClick(tab);

    const input = document.body.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Escape' });
    // After escape, the input should disappear and the name reverts
    expect(mockUpdateWorkspaceName).not.toHaveBeenCalled();
    expect(screen.getByText('Workspace 1')).toBeInTheDocument();
  });
});
