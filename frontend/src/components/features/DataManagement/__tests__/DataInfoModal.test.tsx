import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataInfoModal } from '@/components/features/DataManagement/DataInfoModal';
import { useStore } from '@/store';
import type { DatasetInfo } from '@/types';

vi.mock('@/store', () => ({
  useStore: vi.fn(),
}));

// Mock Dialog to render inline for testability
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));

const mockDataset: DatasetInfo = {
  id: 'ds-1',
  name: 'process_data_2025.xlsx',
  rows: 12345,
  columns: 42,
  column_names: ['Time', 'Temperature', 'Pressure', 'Flow', 'Level'],
  numeric_columns: ['Temperature', 'Pressure', 'Flow', 'Level'],
  datetime_columns: ['Time'],
  memory_usage_kb: 3072,
  date_range: { start: '2025-01-01T00:00:00Z', end: '2025-12-31T23:59:59Z' },
  uploaded_at: '2025-06-15T10:30:00Z',
};

describe('DataInfoModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no dataset is loaded', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ currentDataset: null })
    );

    const { container } = render(<DataInfoModal {...defaultProps} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when isOpen is false even with dataset', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ currentDataset: mockDataset })
    );

    const { container } = render(<DataInfoModal {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the title and description when open with dataset', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ currentDataset: mockDataset })
    );

    render(<DataInfoModal {...defaultProps} />);
    expect(screen.getByText('Dataset Information')).toBeInTheDocument();
    expect(screen.getByText('Details about the currently loaded dataset.')).toBeInTheDocument();
  });

  it('displays the file name', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ currentDataset: mockDataset })
    );

    render(<DataInfoModal {...defaultProps} />);
    expect(screen.getByText('process_data_2025.xlsx')).toBeInTheDocument();
  });

  it('displays row count with locale formatting', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ currentDataset: mockDataset })
    );

    render(<DataInfoModal {...defaultProps} />);
    // 12345 formatted with locale (e.g., "12,345")
    expect(screen.getByText((12345).toLocaleString())).toBeInTheDocument();
  });

  it('displays column count', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ currentDataset: mockDataset })
    );

    render(<DataInfoModal {...defaultProps} />);
    expect(screen.getByText((42).toLocaleString())).toBeInTheDocument();
  });

  it('formats memory in MB for values over 1024 KB', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ currentDataset: mockDataset })
    );

    render(<DataInfoModal {...defaultProps} />);
    // 3072 KB = 3.00 MB
    expect(screen.getByText('3.00 MB')).toBeInTheDocument();
  });

  it('formats memory in KB for values under 1024 KB', () => {
    const smallDataset = { ...mockDataset, memory_usage_kb: 256 };
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ currentDataset: smallDataset })
    );

    render(<DataInfoModal {...defaultProps} />);
    expect(screen.getByText('256.0 KB')).toBeInTheDocument();
  });

  it('displays column type badges with correct counts', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ currentDataset: mockDataset })
    );

    render(<DataInfoModal {...defaultProps} />);
    expect(screen.getByText('4 Numeric')).toBeInTheDocument();
    expect(screen.getByText('1 DateTime')).toBeInTheDocument();
    // Other = 42 - 4 = 38
    expect(screen.getByText('38 Other')).toBeInTheDocument();
  });

  it('displays datetime column names', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ currentDataset: mockDataset })
    );

    render(<DataInfoModal {...defaultProps} />);
    expect(screen.getByText('DateTime columns:')).toBeInTheDocument();
    // "Time" appears in multiple places (datetime columns section and all columns)
    const timeElements = screen.getAllByText('Time');
    expect(timeElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders all column names in the "All Columns" section', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ currentDataset: mockDataset })
    );

    render(<DataInfoModal {...defaultProps} />);
    expect(screen.getByText('All Columns (5)')).toBeInTheDocument();
    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.getByText('Pressure')).toBeInTheDocument();
    expect(screen.getByText('Flow')).toBeInTheDocument();
    expect(screen.getByText('Level')).toBeInTheDocument();
  });

  it('does not display date range section when no date_range exists', () => {
    const noDateDataset = { ...mockDataset, date_range: undefined };
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ currentDataset: noDateDataset })
    );

    render(<DataInfoModal {...defaultProps} />);
    expect(screen.queryByText('Date Range')).not.toBeInTheDocument();
  });
});
