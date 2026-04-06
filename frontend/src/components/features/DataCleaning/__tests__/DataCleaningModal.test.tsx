import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataCleaningModal } from '@/components/features/DataCleaning/DataCleaningModal';

// Mock shadcn Dialog to render inline for testing
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div data-testid="dialog-footer">{children}</div>,
}));

// Mock shadcn Select components
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select-root" data-value={value}>
      {typeof children === 'function' ? children({ value, onValueChange }) : children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => <span>select-value</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
}));

vi.mock('@/components/ui/combobox', () => ({
  Combobox: ({ value, onChange, placeholder }: any) => (
    <input
      data-testid="combobox"
      value={value}
      onChange={(e: any) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

vi.mock('@/components/common', () => ({
  Button: ({ children, onClick, variant, ...props }: any) => (
    <button onClick={onClick} data-variant={variant} {...props}>{children}</button>
  ),
  SimpleTooltip: ({ children }: any) => <>{children}</>,
}));

describe('DataCleaningModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onUpload: vi.fn(),
    fileName: 'test_data.xlsx',
    columnNames: ['Temperature', 'Pressure', 'Flow'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders null when isOpen is false', () => {
    const { container } = render(
      <DataCleaningModal {...defaultProps} isOpen={false} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the title and file name when open', () => {
    render(<DataCleaningModal {...defaultProps} />);
    expect(screen.getByText('Data Cleaning Configuration')).toBeInTheDocument();
    expect(screen.getByText('test_data.xlsx')).toBeInTheDocument();
  });

  it('renders all six NaN strategy buttons', () => {
    render(<DataCleaningModal {...defaultProps} />);
    expect(screen.getByText('Keep as NaN')).toBeInTheDocument();
    expect(screen.getByText('Drop Rows')).toBeInTheDocument();
    expect(screen.getByText('Fill with Zero')).toBeInTheDocument();
    expect(screen.getByText('Linear Interpolation')).toBeInTheDocument();
    expect(screen.getByText('Forward Fill')).toBeInTheDocument();
    expect(screen.getByText('Backward Fill')).toBeInTheDocument();
  });

  it('shows empty substitution rules message initially', () => {
    render(<DataCleaningModal {...defaultProps} />);
    expect(screen.getByText('No substitution rules defined.')).toBeInTheDocument();
  });

  it('shows empty filter rules message initially', () => {
    render(<DataCleaningModal {...defaultProps} />);
    expect(screen.getByText('No filter rules defined.')).toBeInTheDocument();
  });

  it('adds a substitution rule when "Add Rule" is clicked', () => {
    render(<DataCleaningModal {...defaultProps} />);
    const addRuleButton = screen.getByText('Add Rule');
    fireEvent.click(addRuleButton);

    // After adding a rule, the empty message should disappear
    expect(screen.queryByText('No substitution rules defined.')).not.toBeInTheDocument();
    // Find/Replace placeholders should appear
    expect(screen.getByPlaceholderText('Find...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Replace with...')).toBeInTheDocument();
  });

  it('adds a filter rule when "Add Filter" is clicked', () => {
    render(<DataCleaningModal {...defaultProps} />);
    const addFilterButton = screen.getByText('Add Filter');
    fireEvent.click(addFilterButton);

    expect(screen.queryByText('No filter rules defined.')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Value...')).toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<DataCleaningModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onUpload with config and saves to localStorage when "Process & Upload" is clicked', () => {
    const onUpload = vi.fn();
    render(<DataCleaningModal {...defaultProps} onUpload={onUpload} />);
    fireEvent.click(screen.getByText('Process & Upload'));

    expect(onUpload).toHaveBeenCalledTimes(1);
    const config = onUpload.mock.calls[0][0];
    expect(config).toHaveProperty('header_row', 0);
    expect(config).toHaveProperty('nan_strategy', 'none');
    expect(config).toHaveProperty('replacements');
    expect(config).toHaveProperty('filters');

    // Verify localStorage persistence
    const saved = localStorage.getItem('dataCleaningConfig');
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved!)).toMatchObject({ header_row: 0, nan_strategy: 'none' });
  });

  it('loads saved config from localStorage on mount', () => {
    const savedConfig = {
      header_row: 3,
      nan_strategy: 'drop',
      custom_nan_value: '-999',
      replacements: [],
      filters: [],
      resample_frequency: '1H',
      aggregation_method: 'sum',
    };
    localStorage.setItem('dataCleaningConfig', JSON.stringify(savedConfig));

    const onUpload = vi.fn();
    render(<DataCleaningModal {...defaultProps} onUpload={onUpload} />);

    // Click Process & Upload to retrieve the loaded config
    fireEvent.click(screen.getByText('Process & Upload'));
    const config = onUpload.mock.calls[0][0];
    expect(config.header_row).toBe(3);
    expect(config.nan_strategy).toBe('drop');
    expect(config.resample_frequency).toBe('1H');
  });

  it('renders header row input and custom NaN value input', () => {
    render(<DataCleaningModal {...defaultProps} />);
    expect(screen.getByText('Header Row Index')).toBeInTheDocument();
    expect(screen.getByText('Treat Value as NaN')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. -999 or NULL')).toBeInTheDocument();
  });
});
