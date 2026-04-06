import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileUpload } from '@/components/features/DataManagement/FileUpload';
import { useStore } from '@/store';
import type { DatasetInfo } from '@/types';

vi.mock('@/store', () => ({
  useStore: vi.fn(),
}));

// Mock DataCleaningModal to simplify testing
vi.mock('@/components/features/DataCleaning/DataCleaningModal', () => ({
  DataCleaningModal: ({ isOpen, onClose, onUpload, fileName }: any) =>
    isOpen ? (
      <div data-testid="cleaning-modal">
        <span data-testid="cleaning-filename">{fileName}</span>
        <button data-testid="cleaning-upload" onClick={() => onUpload({ header_row: 0, nan_strategy: 'none', custom_nan_value: '', replacements: [], filters: [] })}>
          Upload
        </button>
        <button data-testid="cleaning-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    ) : null,
}));

// Mock react-dropzone
vi.mock('react-dropzone', () => ({
  useDropzone: ({ onDrop, disabled }: any) => ({
    getRootProps: () => ({
      onClick: () => {
        if (!disabled) {
          // Simulate file selection
          const file = new File(['test'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          onDrop([file]);
        }
      },
      role: 'presentation',
      'data-testid': 'dropzone',
    }),
    getInputProps: () => ({ 'data-testid': 'file-input' }),
    isDragActive: false,
  }),
}));

vi.mock('@/components/common', () => ({
  Button: ({ children, onClick, title, ...props }: any) => (
    <button onClick={onClick} title={title} {...props}>{children}</button>
  ),
}));

const mockDataset: DatasetInfo = {
  id: 'ds-1',
  name: 'process_data.xlsx',
  rows: 5000,
  columns: 15,
  column_names: ['Time', 'Temp', 'Pressure', 'Flow'],
  numeric_columns: ['Temp', 'Pressure', 'Flow'],
  datetime_columns: ['Time'],
  memory_usage_kb: 2048,
  date_range: { start: '2025-01-01', end: '2025-06-01' },
  uploaded_at: '2025-06-15T10:30:00Z',
};

describe('FileUpload', () => {
  const mockUploadFile = vi.fn();
  const mockClearDataset = vi.fn();

  const mockUpdateDataFile = vi.fn();

  const defaultStoreState = {
    uploadFile: mockUploadFile,
    updateDataFile: mockUpdateDataFile,
    currentDataset: null as DatasetInfo | null,
    clearDataset: mockClearDataset,
    isLoading: false,
    error: null as string | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useStore).mockImplementation((selector: any) => selector(defaultStoreState));
  });

  it('renders the dropzone when no dataset is loaded', () => {
    render(<FileUpload />);
    expect(screen.getByText('Drag & drop your Excel file here')).toBeInTheDocument();
    expect(screen.getByText('or click to browse (.xlsx, .xls, .csv)')).toBeInTheDocument();
  });

  it('shows "Processing..." when loading', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, isLoading: true })
    );

    render(<FileUpload />);
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('shows error message when error exists', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, error: 'Upload failed: invalid format' })
    );

    render(<FileUpload />);
    expect(screen.getByText('Upload failed: invalid format')).toBeInTheDocument();
  });

  it('renders dataset summary when a dataset is loaded', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, currentDataset: mockDataset })
    );

    render(<FileUpload />);
    expect(screen.getByText('process_data.xlsx')).toBeInTheDocument();
    expect(screen.getByText('Row Count')).toBeInTheDocument();
    expect(screen.getByText('Columns')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
  });

  it('displays memory in MB when over 1024 KB', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, currentDataset: mockDataset })
    );

    render(<FileUpload />);
    // 2048 KB = 2.00 MB
    expect(screen.getByText('2.00 MB')).toBeInTheDocument();
  });

  it('displays memory in KB when under 1024 KB', () => {
    const smallDataset = { ...mockDataset, memory_usage_kb: 512 };
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, currentDataset: smallDataset })
    );

    render(<FileUpload />);
    expect(screen.getByText('512.0 KB')).toBeInTheDocument();
  });

  it('shows column type badges', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, currentDataset: mockDataset })
    );

    render(<FileUpload />);
    expect(screen.getByText('3 Numeric')).toBeInTheDocument();
    expect(screen.getByText('1 DateTime')).toBeInTheDocument();
  });

  it('calls clearDataset when clear button is clicked', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, currentDataset: mockDataset })
    );

    render(<FileUpload />);
    const clearButton = screen.getByTitle('Clear Dataset');
    fireEvent.click(clearButton);
    expect(mockClearDataset).toHaveBeenCalledTimes(1);
  });

  it('opens cleaning modal after file drop and calls uploadFile on modal confirm', () => {
    render(<FileUpload />);

    // Click the dropzone to trigger file selection (mocked)
    fireEvent.click(screen.getByTestId('dropzone'));

    // Cleaning modal should now be visible
    expect(screen.getByTestId('cleaning-modal')).toBeInTheDocument();
    expect(screen.getByTestId('cleaning-filename')).toHaveTextContent('test.xlsx');

    // Click upload in the cleaning modal
    fireEvent.click(screen.getByTestId('cleaning-upload'));
    expect(mockUploadFile).toHaveBeenCalledTimes(1);

    // Modal should close after upload
    expect(screen.queryByTestId('cleaning-modal')).not.toBeInTheDocument();
  });

  it('closes cleaning modal and clears file on cancel', () => {
    render(<FileUpload />);

    // Open cleaning modal
    fireEvent.click(screen.getByTestId('dropzone'));
    expect(screen.getByTestId('cleaning-modal')).toBeInTheDocument();

    // Cancel
    fireEvent.click(screen.getByTestId('cleaning-cancel'));
    expect(screen.queryByTestId('cleaning-modal')).not.toBeInTheDocument();
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it('renders Update File button when dataset is loaded', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, currentDataset: mockDataset })
    );

    render(<FileUpload />);
    expect(screen.getByTitle('Update File')).toBeInTheDocument();
  });

  it('disables Update File button during loading', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, currentDataset: mockDataset, isLoading: true })
    );

    render(<FileUpload />);
    const updateButton = screen.getByTitle('Update File');
    expect(updateButton).toBeDisabled();
  });

  it('calls clearDataset when clear button is clicked (regression)', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, currentDataset: mockDataset })
    );

    render(<FileUpload />);
    const clearButton = screen.getByTitle('Clear Dataset');
    fireEvent.click(clearButton);
    expect(mockClearDataset).toHaveBeenCalledTimes(1);
    expect(mockUpdateDataFile).not.toHaveBeenCalled();
  });
});
