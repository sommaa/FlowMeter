import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FormulaEditorModal } from '@/components/visualizations/FormulaEditorModal';
import { useStore } from '@/store';

// Mock the store
vi.mock('@/store', () => ({
  useStore: vi.fn(),
}));

// Mock the API services
vi.mock('@/services/api', () => ({
  aiApi: {
    getProviders: vi.fn().mockResolvedValue([
      {
        id: 'gemini',
        name: 'Gemini',
        model: 'gemini-pro',
        models: [{ id: 'gemini-pro', name: 'Gemini Pro', description: 'Default model' }],
      },
    ]),
    generateFormula: vi.fn().mockResolvedValue({ formula: "result = col['Temperature'] * 2" }),
  },
}));

// Mock cn utility
vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

describe('FormulaEditorModal', () => {
  const mockOnClose = vi.fn();
  const mockOnApply = vi.fn();
  const mockSetColumnDescriptions = vi.fn();

  const defaultStoreState = {
    columnDescriptions: {} as Record<string, string>,
    setColumnDescriptions: mockSetColumnDescriptions,
    currentDataset: {
      id: '1',
      name: 'test.csv',
      numeric_columns: ['Temperature', 'Pressure', 'Flow'],
      datetime_columns: ['timestamp'],
    },
  };

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    initialFormula: "result = col['Temperature'] * 1.8 + 32",
    onApply: mockOnApply,
    numericColumns: ['Temperature', 'Pressure', 'Flow'],
    mode: 'formula' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock localStorage
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector(defaultStoreState)
    );
  });

  it('renders the modal with Formula Editor title in formula mode', () => {
    render(<FormulaEditorModal {...defaultProps} />);
    expect(screen.getByText('Formula Editor')).toBeInTheDocument();
  });

  it('renders the modal with Custom Regression Formula title in regression mode', () => {
    render(<FormulaEditorModal {...defaultProps} mode="regression" />);
    expect(screen.getByText('Custom Regression Formula')).toBeInTheDocument();
  });

  it('does not render content when isOpen is false', () => {
    render(<FormulaEditorModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Formula Editor')).not.toBeInTheDocument();
  });

  it('renders Manual Editor and Generate with AI tabs in formula mode', () => {
    render(<FormulaEditorModal {...defaultProps} />);
    expect(screen.getByText('Manual Editor')).toBeInTheDocument();
    expect(screen.getByText('Generate with AI')).toBeInTheDocument();
  });

  it('does not render AI tab in regression mode', () => {
    render(<FormulaEditorModal {...defaultProps} mode="regression" />);
    expect(screen.queryByText('Generate with AI')).not.toBeInTheDocument();
    // In regression mode, tabs are not shown at all - content is rendered directly
    expect(screen.queryByText('Manual Editor')).not.toBeInTheDocument();
    // But the title should be visible
    expect(screen.getByText('Custom Regression Formula')).toBeInTheDocument();
  });

  it('renders Cancel and Apply & Run buttons', () => {
    render(<FormulaEditorModal {...defaultProps} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Apply & Run')).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', () => {
    render(<FormulaEditorModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onApply with formula when Apply & Run is clicked', () => {
    render(<FormulaEditorModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Apply & Run'));
    expect(mockOnApply).toHaveBeenCalledWith("result = col['Temperature'] * 1.8 + 32");
  });

  it('disables Apply & Run when formula is empty', () => {
    render(<FormulaEditorModal {...defaultProps} initialFormula="" />);
    const applyBtn = screen.getByText('Apply & Run').closest('button');
    expect(applyBtn).toBeDisabled();
  });

  it('renders available columns for insertion', () => {
    render(<FormulaEditorModal {...defaultProps} />);
    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.getByText('Pressure')).toBeInTheDocument();
    expect(screen.getByText('Flow')).toBeInTheDocument();
  });

  it('renders column search input in the manual editor', () => {
    render(<FormulaEditorModal {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search columns...')).toBeInTheDocument();
  });

  it('filters columns based on search input', () => {
    render(<FormulaEditorModal {...defaultProps} />);
    const searchInput = screen.getByPlaceholderText('Search columns...');
    fireEvent.change(searchInput, { target: { value: 'Temp' } });

    // Temperature should still be visible
    expect(screen.getByText('Temperature')).toBeInTheDocument();
    // Pressure and Flow should be filtered out from the column buttons
    // (they may still appear in other areas of the UI, so check within the column list)
    const columnButtons = screen.getAllByRole('button').filter(
      btn => btn.textContent === 'Pressure' || btn.textContent === 'Flow'
    );
    // They should not appear as clickable column insertion buttons
    expect(columnButtons.length).toBe(0);
  });

  it('shows the total column count', () => {
    render(<FormulaEditorModal {...defaultProps} />);
    expect(screen.getByText(/3 total/)).toBeInTheDocument();
  });
});
