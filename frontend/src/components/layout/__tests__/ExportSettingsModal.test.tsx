import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportSettingsModal } from '@/components/layout/ExportSettingsModal';
import { useStore } from '@/store';

// Mock the store
vi.mock('@/store', () => ({
  useStore: vi.fn(),
}));

// Mock complex child components
vi.mock('@/components/common', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
  DebouncedInput: ({ id, value, onChange, ...props }: any) => (
    <input
      id={id}
      data-testid={id}
      defaultValue={value}
      onChange={(e: any) => onChange(e.target.value)}
      {...props}
    />
  ),
  CustomColorPicker: ({ value, onChange, ...props }: any) => (
    <input
      type="color"
      data-testid={`color-picker-${value}`}
      value={value}
      onChange={(e: any) => onChange(e.target.value)}
      {...props}
    />
  ),
}));

describe('ExportSettingsModal', () => {
  const mockSetExportConfig = vi.fn();
  const mockOnClose = vi.fn();

  const defaultExportConfig = {
    authorName: 'John Smith',
    jobTitle: 'Engineer',
    location: 'Houston',
    primaryColor: '#3b82f6',
    secondaryColor: '#6366f1',
    logoBase64: '',
  };

  const defaultStoreState = {
    exportConfig: defaultExportConfig,
    setExportConfig: mockSetExportConfig,
  };

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector(defaultStoreState)
    );
  });

  it('renders the modal title and description when open', () => {
    render(<ExportSettingsModal {...defaultProps} />);
    expect(screen.getByText('Export Configuration')).toBeInTheDocument();
    expect(
      screen.getByText('Configure the settings for your generated reports.')
    ).toBeInTheDocument();
  });

  it('does not render content when isOpen is false', () => {
    render(<ExportSettingsModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Export Configuration')).not.toBeInTheDocument();
  });

  it('renders Author Name, Job Title, and Location labels', () => {
    render(<ExportSettingsModal {...defaultProps} />);
    expect(screen.getByText('Author Name')).toBeInTheDocument();
    expect(screen.getByText('Job Title')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
  });

  it('renders Primary Color and Secondary Color labels', () => {
    render(<ExportSettingsModal {...defaultProps} />);
    expect(screen.getByText('Primary Color')).toBeInTheDocument();
    expect(screen.getByText('Secondary Color')).toBeInTheDocument();
  });

  it('displays the hex color codes from config', () => {
    render(<ExportSettingsModal {...defaultProps} />);
    expect(screen.getByText('#3b82f6')).toBeInTheDocument();
    expect(screen.getByText('#6366f1')).toBeInTheDocument();
  });

  it('renders the Company Logo upload area', () => {
    render(<ExportSettingsModal {...defaultProps} />);
    expect(screen.getByText('Company Logo')).toBeInTheDocument();
    expect(screen.getByText('Click to upload logo (PNG/JPG)')).toBeInTheDocument();
  });

  it('shows logo preview when logoBase64 is set', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        exportConfig: {
          ...defaultExportConfig,
          logoBase64: 'data:image/png;base64,abc123',
        },
      })
    );
    render(<ExportSettingsModal {...defaultProps} />);
    expect(screen.getByText('Logo selected')).toBeInTheDocument();
    const img = screen.getByAltText('Preview');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'data:image/png;base64,abc123');
  });

  it('calls onClose when Done button is clicked', () => {
    render(<ExportSettingsModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Done'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('updates author name when input changes', () => {
    render(<ExportSettingsModal {...defaultProps} />);
    const authorInput = screen.getByTestId('author-name');
    fireEvent.change(authorInput, { target: { value: 'Jane Doe' } });
    expect(mockSetExportConfig).toHaveBeenCalledWith({ authorName: 'Jane Doe' });
  });

  it('has a hidden file input for logo upload', () => {
    render(<ExportSettingsModal {...defaultProps} />);
    const fileInput = document.body.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();
    expect(fileInput?.getAttribute('accept')).toBe('image/*');
    expect(fileInput?.classList.contains('hidden')).toBe(true);
  });
});
