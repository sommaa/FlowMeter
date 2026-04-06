import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalVariablesModal } from '@/components/features/GlobalVariables/GlobalVariablesModal';
import { useStore } from '@/store';
import type { GlobalVariable, DatasetInfo } from '@/types';

vi.mock('@/store', () => ({
  useStore: vi.fn(),
}));

// Mock Button and Input from common
vi.mock('@/components/common/Button', () => ({
  Button: ({ children, onClick, disabled, variant, icon, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} {...props}>
      {icon}
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: vi.fn().mockImplementation(
    ({ ref, ...props }: any) => <input {...props} />
  ),
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}));

const mockDataset: DatasetInfo = {
  id: 'ds-1',
  name: 'test.xlsx',
  rows: 100,
  columns: 5,
  column_names: ['Temperature', 'Pressure', 'Flow', 'Level', 'Speed'],
  numeric_columns: ['Temperature', 'Pressure', 'Flow', 'Level', 'Speed'],
  datetime_columns: [],
  memory_usage_kb: 128,
  uploaded_at: '2025-01-01T00:00:00Z',
};

describe('GlobalVariablesModal', () => {
  const mockAddGlobalVariable = vi.fn();
  const mockUpdateGlobalVariable = vi.fn();
  const mockRemoveGlobalVariable = vi.fn();
  const mockOnClose = vi.fn();

  const defaultStoreState = {
    globalVariables: [] as GlobalVariable[],
    addGlobalVariable: mockAddGlobalVariable,
    updateGlobalVariable: mockUpdateGlobalVariable,
    removeGlobalVariable: mockRemoveGlobalVariable,
    currentDataset: mockDataset,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useStore).mockImplementation((selector: any) => selector(defaultStoreState));
  });

  it('returns null when isOpen is false', () => {
    const { container } = render(
      <GlobalVariablesModal isOpen={false} onClose={mockOnClose} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the modal title and description when open', () => {
    render(<GlobalVariablesModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('Global Variables')).toBeInTheDocument();
    expect(screen.getByText('Define computed columns available to all plots')).toBeInTheDocument();
  });

  it('renders the info box with usage instructions', () => {
    render(<GlobalVariablesModal isOpen={true} onClose={mockOnClose} />);
    expect(
      screen.getByText(/Global variables create new columns computed from your data/)
    ).toBeInTheDocument();
  });

  it('shows empty state message when no global variables defined', () => {
    render(<GlobalVariablesModal isOpen={true} onClose={mockOnClose} />);
    expect(
      screen.getByText(/No global variables defined yet/)
    ).toBeInTheDocument();
  });

  it('shows "Add Variable" button when not in add/edit mode', () => {
    render(<GlobalVariablesModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('Add Variable')).toBeInTheDocument();
  });

  it('shows add form when "Add Variable" is clicked', () => {
    render(<GlobalVariablesModal isOpen={true} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Add Variable'));

    expect(screen.getByText('New Variable')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g., Efficiency')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Calculation logic...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText("col['Input'] / col['Output'] * 100")).toBeInTheDocument();
  });

  it('shows available columns in the add form', () => {
    render(<GlobalVariablesModal isOpen={true} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Add Variable'));

    expect(screen.getByText(`Available columns (${mockDataset.column_names.length}):`)).toBeInTheDocument();
    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.getByText('Pressure')).toBeInTheDocument();
  });

  it('disables "Save Variable" button when name and formula are empty', () => {
    render(<GlobalVariablesModal isOpen={true} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Add Variable'));

    const saveButton = screen.getByText('Save Variable');
    expect(saveButton).toBeDisabled();
  });

  it('calls addGlobalVariable when saving a new variable with valid data', () => {
    render(<GlobalVariablesModal isOpen={true} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Add Variable'));

    const nameInput = screen.getByPlaceholderText('e.g., Efficiency');
    const formulaInput = screen.getByPlaceholderText("col['Input'] / col['Output'] * 100");

    fireEvent.change(nameInput, { target: { value: 'My Var' } });
    fireEvent.change(formulaInput, { target: { value: "col['Temperature'] * 2" } });

    fireEvent.click(screen.getByText('Save Variable'));
    expect(mockAddGlobalVariable).toHaveBeenCalledWith({
      name: 'My_Var', // sanitized: space -> underscore
      formula: "col['Temperature'] * 2",
      description: '',
    });
  });

  it('hides add form on cancel', () => {
    render(<GlobalVariablesModal isOpen={true} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Add Variable'));
    expect(screen.getByText('New Variable')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('New Variable')).not.toBeInTheDocument();
  });

  it('renders existing global variables as cards', () => {
    const vars: GlobalVariable[] = [
      { name: 'Efficiency', formula: "col['Output'] / col['Input'] * 100", description: 'Production efficiency' },
      { name: 'Delta_T', formula: "col['T_out'] - col['T_in']" },
    ];
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, globalVariables: vars })
    );

    render(<GlobalVariablesModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('Efficiency')).toBeInTheDocument();
    expect(screen.getByText("col['Output'] / col['Input'] * 100")).toBeInTheDocument();
    expect(screen.getByText('Production efficiency')).toBeInTheDocument();
    expect(screen.getByText('Delta_T')).toBeInTheDocument();
  });

  it('calls removeGlobalVariable when delete button is clicked', () => {
    const vars: GlobalVariable[] = [
      { name: 'Efficiency', formula: "col['Output'] / col['Input'] * 100" },
    ];
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, globalVariables: vars })
    );

    render(<GlobalVariablesModal isOpen={true} onClose={mockOnClose} />);
    const removeButton = screen.getByTitle('Remove');
    fireEvent.click(removeButton);
    expect(mockRemoveGlobalVariable).toHaveBeenCalledWith(0);
  });

  it('calls onClose when Close button is clicked', () => {
    render(<GlobalVariablesModal isOpen={true} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Close'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking the backdrop', () => {
    render(<GlobalVariablesModal isOpen={true} onClose={mockOnClose} />);
    // The outermost div has onClick={onClose}
    const backdrop = document.body.querySelector('.fixed.inset-0');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(mockOnClose).toHaveBeenCalled();
    }
  });

  it('filters columns by search in add form', () => {
    render(<GlobalVariablesModal isOpen={true} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Add Variable'));

    const searchInput = screen.getByPlaceholderText('Search columns...');
    fireEvent.change(searchInput, { target: { value: 'temp' } });

    // Only Temperature should match
    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.queryByText('Pressure')).not.toBeInTheDocument();
  });
});
