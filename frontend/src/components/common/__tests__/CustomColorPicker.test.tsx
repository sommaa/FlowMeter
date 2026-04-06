import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CustomColorPicker } from '@/components/common/CustomColorPicker';

// Mock the debounce hook to return the value immediately
vi.mock('@/hooks/use-debounce', () => ({
  useDebounce: (value: string, _delay: number) => value,
}));

// Mock the constants
vi.mock('@/lib/constants', () => ({
  CHART_COLORS: ['#0072BD', '#D95319', '#EDB120', '#7E2F8E', '#77AC30'],
}));

describe('CustomColorPicker', () => {
  const defaultProps = {
    value: '#0072BD',
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the trigger button with the correct background color', () => {
    render(<CustomColorPicker {...defaultProps} />);
    const trigger = screen.getByRole('button', { name: 'Pick Color' });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveStyle({ backgroundColor: '#0072BD' });
  });

  it('applies additional className to the trigger', () => {
    render(<CustomColorPicker {...defaultProps} className="extra-class" />);
    const trigger = screen.getByRole('button', { name: 'Pick Color' });
    expect(trigger).toHaveClass('extra-class');
  });

  it('opens the popover when trigger is clicked', () => {
    render(<CustomColorPicker {...defaultProps} />);
    const trigger = screen.getByRole('button', { name: 'Pick Color' });
    fireEvent.click(trigger);
    expect(screen.getByText('Hex Color')).toBeInTheDocument();
    expect(screen.getByText('Presets')).toBeInTheDocument();
  });

  it('renders the hex input with the current value when popover is open', () => {
    render(<CustomColorPicker {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick Color' }));
    const hexInput = screen.getByPlaceholderText('#000000');
    expect(hexInput).toHaveValue('#0072BD');
  });

  it('renders preset color buttons', () => {
    render(<CustomColorPicker {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick Color' }));
    // We have 5 mock CHART_COLORS
    const presetButtons = screen.getAllByTitle(/^#/);
    // Filter to only the preset buttons (not the trigger or system picker)
    const presets = presetButtons.filter(el => el.tagName === 'BUTTON');
    expect(presets.length).toBe(5);
  });

  it('updates local value when hex input changes', () => {
    render(<CustomColorPicker {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick Color' }));
    const hexInput = screen.getByPlaceholderText('#000000');
    fireEvent.change(hexInput, { target: { value: '#FF0000' } });
    expect(hexInput).toHaveValue('#FF0000');
  });

  it('calls onChange when hex input value changes (debounced)', () => {
    render(<CustomColorPicker {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick Color' }));
    const hexInput = screen.getByPlaceholderText('#000000');
    fireEvent.change(hexInput, { target: { value: '#FF0000' } });
    // Since debounce is mocked to return immediately, onChange should fire
    expect(defaultProps.onChange).toHaveBeenCalledWith('#FF0000');
  });

  it('resets to external value on blur when hex is invalid', () => {
    render(<CustomColorPicker {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick Color' }));
    const hexInput = screen.getByPlaceholderText('#000000');
    fireEvent.change(hexInput, { target: { value: 'invalid' } });
    fireEvent.blur(hexInput);
    expect(hexInput).toHaveValue('#0072BD');
  });

  it('does not reset on blur when hex is valid', () => {
    render(<CustomColorPicker {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick Color' }));
    const hexInput = screen.getByPlaceholderText('#000000');
    fireEvent.change(hexInput, { target: { value: '#AABBCC' } });
    fireEvent.blur(hexInput);
    expect(hexInput).toHaveValue('#AABBCC');
  });

  it('selects a preset color and closes the popover', () => {
    render(<CustomColorPicker {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick Color' }));
    const presetButton = screen.getByTitle('#D95319');
    fireEvent.click(presetButton);
    // After clicking a preset, onChange should be called with that color
    expect(defaultProps.onChange).toHaveBeenCalledWith('#D95319');
    // Popover should close, so hex input should no longer be visible
    expect(screen.queryByText('Hex Color')).not.toBeInTheDocument();
  });

  it('syncs local value when external value prop changes', () => {
    const { rerender } = render(<CustomColorPicker {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick Color' }));
    const hexInput = screen.getByPlaceholderText('#000000');
    expect(hexInput).toHaveValue('#0072BD');

    rerender(<CustomColorPicker {...defaultProps} value="#FF5733" />);
    expect(hexInput).toHaveValue('#FF5733');
  });
});
