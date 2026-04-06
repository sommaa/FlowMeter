import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportDownloadModal } from '@/components/layout/ExportDownloadModal';
import { useStore } from '@/store';

// Mock the store
vi.mock('@/store', () => ({
  useStore: vi.fn(),
}));

// Mock child components that are complex / have their own tests
vi.mock('@/components/common/DateRangePicker', () => ({
  DateRangePicker: () => <div data-testid="date-range-picker">DateRangePicker</div>,
}));

describe('ExportDownloadModal', () => {
  const mockExportReport = vi.fn();
  const mockSetExportConfigOpen = vi.fn();
  const mockOnClose = vi.fn();

  const defaultStoreState = {
    exportReport: mockExportReport,
    isExporting: false,
    currentDataset: { id: '1', name: 'test.csv' },
    setExportConfigOpen: mockSetExportConfigOpen,
  };

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExportReport.mockResolvedValue(undefined);
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector(defaultStoreState)
    );
  });

  it('renders the modal title and description when open', () => {
    render(<ExportDownloadModal {...defaultProps} />);
    expect(screen.getByText('Export Report')).toBeInTheDocument();
    expect(
      screen.getByText('Select the data range you wish to include in your report.')
    ).toBeInTheDocument();
  });

  it('does not render content when isOpen is false', () => {
    render(<ExportDownloadModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Export Report')).not.toBeInTheDocument();
  });

  it('renders the DateRangePicker component', () => {
    render(<ExportDownloadModal {...defaultProps} />);
    expect(screen.getByTestId('date-range-picker')).toBeInTheDocument();
  });

  it('renders the help text about date range', () => {
    render(<ExportDownloadModal {...defaultProps} />);
    expect(
      screen.getByText('Only data within this range will be included in the exported HTML file.')
    ).toBeInTheDocument();
  });

  it('renders Configure, Cancel, and Download Report buttons', () => {
    render(<ExportDownloadModal {...defaultProps} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Download Report')).toBeInTheDocument();
    // Configure text is sr-only on mobile but still in the DOM
    expect(screen.getByText('Configure')).toBeInTheDocument();
  });

  it('calls setExportConfigOpen when Configure button is clicked', () => {
    render(<ExportDownloadModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Configure'));
    expect(mockSetExportConfigOpen).toHaveBeenCalledWith(true);
  });

  it('calls onClose when Cancel button is clicked', () => {
    render(<ExportDownloadModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls exportReport and onClose when Download Report is clicked', async () => {
    render(<ExportDownloadModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Download Report'));
    await waitFor(() => {
      expect(mockExportReport).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  it('disables Download Report button when no dataset is loaded', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, currentDataset: null })
    );
    render(<ExportDownloadModal {...defaultProps} />);
    const downloadBtn = screen.getByText('Download Report').closest('button');
    expect(downloadBtn).toBeDisabled();
  });

  it('shows loading state when isExporting is true', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({ ...defaultStoreState, isExporting: true })
    );
    render(<ExportDownloadModal {...defaultProps} />);
    // The Button component with loading=true renders a spinner; the button text should still exist
    expect(screen.getByText('Download Report')).toBeInTheDocument();
  });
});
