import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateRangePicker } from '@/components/common/DateRangePicker';

// Mock zustand store
const mockSetGlobalDateRange = vi.fn();
const mockStoreState: Record<string, unknown> = {
  currentDataset: null,
  globalDateRange: null,
  setGlobalDateRange: mockSetGlobalDateRange,
  isDarkMode: false,
};

vi.mock('@/store', () => ({
  useStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockStoreState),
}));

describe('DateRangePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.currentDataset = null;
    mockStoreState.globalDateRange = null;
    mockStoreState.isDarkMode = false;
  });

  it('renders "No Date Filter" when no dataset is loaded', () => {
    render(<DateRangePicker />);
    expect(screen.getByText('No Date Filter')).toBeInTheDocument();
  });

  it('renders the "Select Date Range" trigger when a dataset with date_range is loaded', () => {
    mockStoreState.currentDataset = {
      date_range: {
        start: '2024-01-01T00:00:00',
        end: '2024-12-31T00:00:00',
      },
    };
    render(<DateRangePicker />);
    expect(screen.getByText('Select Date Range')).toBeInTheDocument();
  });

  it('opens the dropdown panel when the trigger button is clicked', () => {
    mockStoreState.currentDataset = {
      date_range: {
        start: '2024-01-01T00:00:00',
        end: '2024-12-31T00:00:00',
      },
    };
    render(<DateRangePicker />);
    fireEvent.click(screen.getByText('Select Date Range'));
    expect(screen.getByText('Quick Select')).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
  });

  it('renders preset buttons (Last 12h, 24h, 7d, 30d, 90d and All Time)', () => {
    mockStoreState.currentDataset = {
      date_range: {
        start: '2024-01-01T00:00:00',
        end: '2024-12-31T00:00:00',
      },
    };
    render(<DateRangePicker />);
    fireEvent.click(screen.getByText('Select Date Range'));
    expect(screen.getByText('Last 12h')).toBeInTheDocument();
    expect(screen.getByText('Last 24h')).toBeInTheDocument();
    expect(screen.getByText('Last 7d')).toBeInTheDocument();
    expect(screen.getByText('Last 30d')).toBeInTheDocument();
    expect(screen.getByText('Last 90d')).toBeInTheDocument();
    expect(screen.getByText('All Time')).toBeInTheDocument();
  });

  it('renders Apply, Cancel, and Clear action buttons', () => {
    mockStoreState.currentDataset = {
      date_range: {
        start: '2024-01-01T00:00:00',
        end: '2024-12-31T00:00:00',
      },
    };
    render(<DateRangePicker />);
    fireEvent.click(screen.getByText('Select Date Range'));
    expect(screen.getByRole('button', { name: /Apply/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('calls setGlobalDateRange and closes when a preset is clicked', () => {
    mockStoreState.currentDataset = {
      date_range: {
        start: '2024-01-01T00:00:00',
        end: '2024-12-31T00:00:00',
      },
    };
    render(<DateRangePicker />);
    fireEvent.click(screen.getByText('Select Date Range'));
    fireEvent.click(screen.getByText('Last 30d'));
    expect(mockSetGlobalDateRange).toHaveBeenCalledTimes(1);
    const calledWith = mockSetGlobalDateRange.mock.calls[0][0];
    expect(calledWith).toHaveProperty('start');
    expect(calledWith).toHaveProperty('end');
    // Dropdown should close
    expect(screen.queryByText('Quick Select')).not.toBeInTheDocument();
  });

  it('calls setGlobalDateRange with full range when All Time is clicked', () => {
    mockStoreState.currentDataset = {
      date_range: {
        start: '2024-01-01T00:00:00',
        end: '2024-12-31T00:00:00',
      },
    };
    render(<DateRangePicker />);
    fireEvent.click(screen.getByText('Select Date Range'));
    fireEvent.click(screen.getByText('All Time'));
    expect(mockSetGlobalDateRange).toHaveBeenCalledWith({
      start: '2024-01-01T00:00',
      end: '2024-12-31T00:00',
    });
  });

  it('clears the date range when Clear is clicked', () => {
    mockStoreState.currentDataset = {
      date_range: {
        start: '2024-01-01T00:00:00',
        end: '2024-12-31T00:00:00',
      },
    };
    mockStoreState.globalDateRange = {
      start: '2024-06-01',
      end: '2024-09-01',
    };
    render(<DateRangePicker />);
    // When globalDateRange is active, the button shows formatted dates
    fireEvent.click(screen.getByRole('button', { name: /Jun|Sep/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(mockSetGlobalDateRange).toHaveBeenCalledWith(null);
  });

  it('displays the formatted active date range in the trigger button', () => {
    mockStoreState.currentDataset = {
      date_range: {
        start: '2024-01-01T00:00:00',
        end: '2024-12-31T00:00:00',
      },
    };
    mockStoreState.globalDateRange = {
      start: '2024-03-15',
      end: '2024-09-20',
    };
    render(<DateRangePicker />);
    // The display format is "MMM DD, YYYY - MMM DD, YYYY"
    expect(screen.getByText(/Mar 15, 2024/)).toBeInTheDocument();
  });

  it('closes dropdown when Cancel is clicked', () => {
    mockStoreState.currentDataset = {
      date_range: {
        start: '2024-01-01T00:00:00',
        end: '2024-12-31T00:00:00',
      },
    };
    render(<DateRangePicker />);
    fireEvent.click(screen.getByText('Select Date Range'));
    expect(screen.getByText('Quick Select')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Quick Select')).not.toBeInTheDocument();
  });

  it('renders datetime-local inputs with correct min/max constraints', () => {
    mockStoreState.currentDataset = {
      date_range: {
        start: '2024-01-01T00:00:00',
        end: '2024-12-31T00:00:00',
      },
    };
    render(<DateRangePicker />);
    fireEvent.click(screen.getByText('Select Date Range'));
    const dateInputs = document.querySelectorAll('input[type="datetime-local"]');
    expect(dateInputs).toHaveLength(2);
    expect(dateInputs[0]).toHaveAttribute('min', '2024-01-01T00:00');
    expect(dateInputs[0]).toHaveAttribute('max', '2024-12-31T00:00');
    expect(dateInputs[1]).toHaveAttribute('min', '2024-01-01T00:00');
    expect(dateInputs[1]).toHaveAttribute('max', '2024-12-31T00:00');
  });
});
