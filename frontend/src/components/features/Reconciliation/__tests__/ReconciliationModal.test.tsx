import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReconciliationModal } from '@/components/features/Reconciliation/ReconciliationModal';
import { useStore } from '@/store';
import { reconciliationApi } from '@/services/api';
import type { DatasetInfo, ReconciliationConfig, ReconciliationResponse } from '@/types';

vi.mock('@/store', () => ({
  useStore: Object.assign(vi.fn(), {
    getState: vi.fn(() => ({
      refreshCurrentDataset: vi.fn().mockResolvedValue(undefined),
      refreshAllPlots: vi.fn(),
    })),
  }),
}));

vi.mock('@/services/api', () => ({
  reconciliationApi: {
    reconcile: vi.fn(),
  },
}));

// Mock Dialog to render inline
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));

// Mock common components
vi.mock('@/components/common', () => ({
  Button: ({ children, onClick, disabled, loading, variant, icon, ...props }: any) => (
    <button onClick={onClick} disabled={disabled || loading} data-variant={variant} data-loading={loading} {...props}>
      {icon}
      {children}
    </button>
  ),
  Input: ({ ref, ...props }: any) => <input {...props} />,
  Checkbox: ({ checked, onChange, ...props }: any) => (
    <input type="checkbox" checked={checked} onChange={onChange} {...props} />
  ),
}));

const mockDataset: DatasetInfo = {
  id: 'ds-1',
  name: 'process_data.xlsx',
  rows: 1000,
  columns: 10,
  column_names: ['Feed Flow', 'Product Flow', 'Waste Flow', 'Temperature'],
  numeric_columns: ['Feed Flow', 'Product Flow', 'Waste Flow', 'Temperature'],
  datetime_columns: [],
  memory_usage_kb: 512,
  uploaded_at: '2025-01-01T00:00:00Z',
};

const mockReconciliationConfig: ReconciliationConfig = {
  equations: [],
  sigma_mode: 'fixed_all',
  fixed_sigma: 1.0,
  sigma_values: {},
  non_negative: true,
};

const mockReconciliationResults: ReconciliationResponse = {
  reconciled_file_url: '/api/download/reconciled.xlsx',
  file_name: 'reconciled_data.xlsx',
  report: [
    {
      variable: 'Feed_Flow',
      mean_error: 0.0012,
      mae: 0.0034,
      avg_abs_change: 0.0045,
      max_abs_change: 0.0123,
      rel_error_pct: 0.15,
      std_error: 0.002,
      count: 1000,
    },
    {
      variable: 'Product_Flow',
      mean_error: -0.0005,
      mae: 0.0021,
      avg_abs_change: 0.003,
      max_abs_change: 0.008,
      rel_error_pct: 0.1,
      std_error: 0.001,
      count: 1000,
    },
  ],
};

describe('ReconciliationModal', () => {
  const mockUpdateReconciliationConfig = vi.fn();
  const mockSetReconciliationResults = vi.fn();
  const mockOnClose = vi.fn();

  const defaultStoreState = {
    currentDataset: mockDataset,
    reconciliationConfig: mockReconciliationConfig,
    updateReconciliationConfig: mockUpdateReconciliationConfig,
    reconciliationResults: null as ReconciliationResponse | null,
    setReconciliationResults: mockSetReconciliationResults,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useStore).mockImplementation((selector: any) => selector(defaultStoreState));
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ReconciliationModal isOpen={false} onClose={mockOnClose} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the modal title and description when open', () => {
    render(<ReconciliationModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('Data Reconciliation')).toBeInTheDocument();
    expect(screen.getByText('Validate and adjust measurements using mass/energy balance equations')).toBeInTheDocument();
  });

  it('renders Configuration and Results tabs', () => {
    render(<ReconciliationModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('Configuration')).toBeInTheDocument();
    expect(screen.getByText('Results & Report')).toBeInTheDocument();
  });

  it('shows the equations textarea on the config tab', () => {
    render(<ReconciliationModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('Balance Equations')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter equations here...')).toBeInTheDocument();
  });

  it('shows "Run Reconciliation" button on config tab', () => {
    render(<ReconciliationModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('Run Reconciliation')).toBeInTheDocument();
  });

  it('disables "Run Reconciliation" when no dataset is loaded', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, currentDataset: null })
    );

    render(<ReconciliationModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('Run Reconciliation')).toBeDisabled();
  });

  it('shows the constraints checkbox for non-negative enforcement', () => {
    render(<ReconciliationModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('Constraints')).toBeInTheDocument();
    expect(screen.getByText(/Enforce Non-Negative Results/)).toBeInTheDocument();
  });

  it('shows sigma mode selection', () => {
    render(<ReconciliationModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('Measurement Uncertainty (Sigma)')).toBeInTheDocument();
    expect(screen.getByText('Sigma Mode')).toBeInTheDocument();
  });

  it('shows the "Variable Selector" heading in right panel for fixed_all mode', () => {
    render(<ReconciliationModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('Variable Selector')).toBeInTheDocument();
  });

  it('shows "Uncertainty Configuration" heading when sigma_mode is from_config', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        reconciliationConfig: { ...mockReconciliationConfig, sigma_mode: 'from_config' },
      })
    );

    render(<ReconciliationModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('Uncertainty Configuration')).toBeInTheDocument();
  });

  it('displays filtered variables in the right panel', () => {
    render(<ReconciliationModal isOpen={true} onClose={mockOnClose} />);
    // numeric_columns are shown as selectable variables
    expect(screen.getByText('Feed Flow')).toBeInTheDocument();
    expect(screen.getByText('Product Flow')).toBeInTheDocument();
    expect(screen.getByText('Waste Flow')).toBeInTheDocument();
  });

  it('filters variables when using search', () => {
    render(<ReconciliationModal isOpen={true} onClose={mockOnClose} />);
    const searchInput = screen.getByPlaceholderText('Search variables...');
    fireEvent.change(searchInput, { target: { value: 'Feed' } });

    expect(screen.getByText('Feed Flow')).toBeInTheDocument();
    expect(screen.queryByText('Temperature')).not.toBeInTheDocument();
  });

  it('allows editing equations in the textarea', () => {
    render(<ReconciliationModal isOpen={true} onClose={mockOnClose} />);
    const textarea = screen.getByPlaceholderText('Enter equations here...');
    fireEvent.change(textarea, { target: { value: 'Feed_Flow = Product_Flow + Waste_Flow' } });
    expect(textarea).toHaveValue('Feed_Flow = Product_Flow + Waste_Flow');
  });

  it('calls onClose when Close button is clicked', () => {
    render(<ReconciliationModal isOpen={true} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Close'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls reconciliationApi.reconcile when "Run Reconciliation" is clicked', async () => {
    vi.mocked(reconciliationApi.reconcile).mockResolvedValue(mockReconciliationResults);

    render(<ReconciliationModal isOpen={true} onClose={mockOnClose} />);

    // Enter an equation
    const textarea = screen.getByPlaceholderText('Enter equations here...');
    fireEvent.change(textarea, { target: { value: 'Feed_Flow = Product_Flow + Waste_Flow' } });

    // Click run
    fireEvent.click(screen.getByText('Run Reconciliation'));

    await waitFor(() => {
      expect(reconciliationApi.reconcile).toHaveBeenCalledWith(
        'ds-1',
        expect.objectContaining({
          equations: ['Feed_Flow = Product_Flow + Waste_Flow'],
        })
      );
    });

    await waitFor(() => {
      expect(mockSetReconciliationResults).toHaveBeenCalledWith(mockReconciliationResults);
    });
  });

  it('shows error message when reconciliation fails', async () => {
    vi.mocked(reconciliationApi.reconcile).mockRejectedValue(new Error('Equation parse error'));

    render(<ReconciliationModal isOpen={true} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Run Reconciliation'));

    await waitFor(() => {
      expect(screen.getByText('Equation parse error')).toBeInTheDocument();
    });
  });

  it('displays results tab content when results are available', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        reconciliationResults: mockReconciliationResults,
      })
    );

    render(<ReconciliationModal isOpen={true} onClose={mockOnClose} />);

    // The effect should switch to results tab
    // Click results tab explicitly to ensure it's visible
    fireEvent.click(screen.getByText('Results & Report'));

    expect(screen.getByText('Reconciliation Complete')).toBeInTheDocument();
    expect(screen.getByText(/reconciled_data\.xlsx/)).toBeInTheDocument();
    expect(screen.getByText('Download Excel')).toBeInTheDocument();
    expect(screen.getByText('Instrument Error Report')).toBeInTheDocument();
    expect(screen.getByText('Feed_Flow')).toBeInTheDocument();
    expect(screen.getByText('Product_Flow')).toBeInTheDocument();
  });
});
