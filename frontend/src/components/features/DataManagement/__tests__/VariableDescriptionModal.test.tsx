import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VariableDescriptionModal } from '@/components/features/DataManagement/VariableDescriptionModal';
import { useStore } from '@/store';

vi.mock('@/store', () => ({
  useStore: vi.fn(),
}));

// Mock Dialog to render inline for testing
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: any) =>
    open ? (
      <div data-testid="dialog" data-on-open-change={!!onOpenChange}>
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));

// Mock the ColumnDescriptionEditor
vi.mock('@/components/features/AI/ColumnDescriptionEditor', () => ({
  ColumnDescriptionEditor: ({ columnDescriptions, onDescriptionsChange, showGuidance }: any) => (
    <div data-testid="column-description-editor" data-show-guidance={showGuidance}>
      <span data-testid="descriptions-count">{Object.keys(columnDescriptions).length}</span>
      <button
        data-testid="mock-update-descriptions"
        onClick={() => onDescriptionsChange({ col1: 'desc1', col2: 'desc2' })}
      >
        Update
      </button>
    </div>
  ),
}));

// Mock Button
vi.mock('@/components/common', () => ({
  Button: ({ children, onClick, variant, ...props }: any) => (
    <button onClick={onClick} data-variant={variant} {...props}>{children}</button>
  ),
}));

describe('VariableDescriptionModal', () => {
  const mockSetColumnDescriptions = vi.fn();

  const defaultStoreState = {
    columnDescriptions: { Temperature: 'Reactor temperature in Celsius' } as Record<string, string>,
    setColumnDescriptions: mockSetColumnDescriptions,
  };

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useStore).mockImplementation((selector: any) => selector(defaultStoreState));
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <VariableDescriptionModal {...defaultProps} isOpen={false} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the modal title "Data Dictionary" when open', () => {
    render(<VariableDescriptionModal {...defaultProps} />);
    expect(screen.getByText('Data Dictionary')).toBeInTheDocument();
  });

  it('renders the description text', () => {
    render(<VariableDescriptionModal {...defaultProps} />);
    expect(
      screen.getByText('Define your data variables to maintain a clear record of your columns.')
    ).toBeInTheDocument();
  });

  it('renders the ColumnDescriptionEditor with showGuidance=false', () => {
    render(<VariableDescriptionModal {...defaultProps} />);
    const editor = screen.getByTestId('column-description-editor');
    expect(editor).toBeInTheDocument();
    expect(editor).toHaveAttribute('data-show-guidance', 'false');
  });

  it('passes columnDescriptions from store to editor', () => {
    render(<VariableDescriptionModal {...defaultProps} />);
    // Our mock shows the count of descriptions
    expect(screen.getByTestId('descriptions-count')).toHaveTextContent('1');
  });

  it('calls setColumnDescriptions when editor triggers change', () => {
    render(<VariableDescriptionModal {...defaultProps} />);
    fireEvent.click(screen.getByTestId('mock-update-descriptions'));
    expect(mockSetColumnDescriptions).toHaveBeenCalledWith({ col1: 'desc1', col2: 'desc2' });
  });

  it('renders a "Done" button', () => {
    render(<VariableDescriptionModal {...defaultProps} />);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('calls onClose when "Done" button is clicked', () => {
    const onClose = vi.fn();
    render(<VariableDescriptionModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Done'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders with empty columnDescriptions', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, columnDescriptions: {} })
    );

    render(<VariableDescriptionModal {...defaultProps} />);
    expect(screen.getByTestId('descriptions-count')).toHaveTextContent('0');
  });
});
