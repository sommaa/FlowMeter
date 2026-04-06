import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TopBar } from '@/components/layout/TopBar';
import { useStore } from '@/store';

// Mock the store
vi.mock('@/store', () => ({
  useStore: vi.fn(),
}));

// Mock child components
vi.mock('@/components/common/DateRangePicker', () => ({
  DateRangePicker: () => <div data-testid="date-range-picker">DateRangePicker</div>,
}));

vi.mock('@/components/layout/NotificationCenter', () => ({
  NotificationCenter: () => <div data-testid="notification-center">NotificationCenter</div>,
}));

vi.mock('@/components/layout/WorkspaceTabs', () => ({
  WorkspaceTabs: () => <div data-testid="workspace-tabs">WorkspaceTabs</div>,
}));

vi.mock('@/components/common', () => ({
  Button: ({ children, onClick, icon, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {icon}
      {children}
    </button>
  ),
  SettingsMenu: () => <div data-testid="settings-menu">SettingsMenu</div>,
  Logo: ({ size }: any) => <div data-testid="logo" data-size={size}>Logo</div>,
}));

describe('TopBar', () => {
  const mockOnAddVisualization = vi.fn();
  const mockOnToggleSidebar = vi.fn();
  const mockToggleTemplateManager = vi.fn();

  const defaultStoreState = {
    currentDataset: null,
    toggleTemplateManager: mockToggleTemplateManager,
    setStorylineOpen: vi.fn(),
    isStorylineEnabled: true,
    setStorylineEnabled: vi.fn(),
    visualizations: [],
  };

  const defaultProps = {
    onAddVisualization: mockOnAddVisualization,
    sidebarWidth: 256,
    isSidebarExpanded: true,
    onToggleSidebar: mockOnToggleSidebar,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector(defaultStoreState)
    );
  });

  it('renders the header element', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('renders the logo', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByTestId('logo')).toBeInTheDocument();
  });

  it('shows FlowMeter text when sidebar is expanded', () => {
    render(<TopBar {...defaultProps} isSidebarExpanded={true} />);
    expect(screen.getByText('Flow')).toBeInTheDocument();
    expect(screen.getByText('Meter')).toBeInTheDocument();
  });

  it('hides FlowMeter text when sidebar is collapsed', () => {
    render(<TopBar {...defaultProps} isSidebarExpanded={false} />);
    expect(screen.queryByText('Flow')).not.toBeInTheDocument();
    expect(screen.queryByText('Meter')).not.toBeInTheDocument();
  });

  it('renders the collapse sidebar chevron button when expanded', () => {
    render(<TopBar {...defaultProps} isSidebarExpanded={true} />);
    const collapseBtn = screen.getByTitle('Collapse sidebar');
    expect(collapseBtn).toBeInTheDocument();
  });

  it('hides the collapse button when sidebar is collapsed', () => {
    render(<TopBar {...defaultProps} isSidebarExpanded={false} />);
    expect(screen.queryByTitle('Collapse sidebar')).not.toBeInTheDocument();
  });

  it('calls onToggleSidebar when collapse button is clicked', () => {
    render(<TopBar {...defaultProps} isSidebarExpanded={true} />);
    fireEvent.click(screen.getByTitle('Collapse sidebar'));
    expect(mockOnToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('does not show Add Visualization button when no dataset is loaded', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.queryByText('Add Visualization')).not.toBeInTheDocument();
  });

  it('shows Add Visualization button when dataset is loaded', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        currentDataset: { id: '1', name: 'test.csv' },
      })
    );
    render(<TopBar {...defaultProps} />);
    expect(screen.getByText('Add Visualization')).toBeInTheDocument();
  });

  it('calls onAddVisualization when Add Visualization button is clicked', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        currentDataset: { id: '1', name: 'test.csv' },
      })
    );
    render(<TopBar {...defaultProps} />);
    fireEvent.click(screen.getByText('Add Visualization'));
    expect(mockOnAddVisualization).toHaveBeenCalledTimes(1);
  });

  it('shows Storyline button when dataset is loaded', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        currentDataset: { id: '1', name: 'test.csv' },
      })
    );
    render(<TopBar {...defaultProps} />);
    expect(screen.getByText('Storyline')).toBeInTheDocument();
  });

  it('renders Templates button and calls toggleTemplateManager on click', () => {
    render(<TopBar {...defaultProps} />);
    const templatesBtn = screen.getByText('Templates');
    expect(templatesBtn).toBeInTheDocument();
    fireEvent.click(templatesBtn);
    expect(mockToggleTemplateManager).toHaveBeenCalledTimes(1);
  });

  it('renders WorkspaceTabs component', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByTestId('workspace-tabs')).toBeInTheDocument();
  });

  it('renders DateRangePicker', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByTestId('date-range-picker')).toBeInTheDocument();
  });

  it('renders NotificationCenter and SettingsMenu', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByTestId('notification-center')).toBeInTheDocument();
    expect(screen.getByTestId('settings-menu')).toBeInTheDocument();
  });

  it('shows Save button when dataset is loaded', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        currentDataset: { id: '1', name: 'test.csv' },
      })
    );
    render(<TopBar {...defaultProps} />);
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('disables Save button when no visualizations', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        currentDataset: { id: '1', name: 'test.csv' },
        visualizations: [],
      })
    );
    render(<TopBar {...defaultProps} />);
    const saveBtn = screen.getByText('Save').closest('button');
    expect(saveBtn).toBeDisabled();
  });

  it('enables Save button when visualizations exist', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        currentDataset: { id: '1', name: 'test.csv' },
        visualizations: [{ id: '1' }],
      })
    );
    render(<TopBar {...defaultProps} />);
    const saveBtn = screen.getByText('Save').closest('button');
    expect(saveBtn).not.toBeDisabled();
  });
});
