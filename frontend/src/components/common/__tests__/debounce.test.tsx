import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DebouncedInput, DebouncedTextArea, DebouncedColorPicker } from '@/components/common/debounce';

describe('DebouncedInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with the initial value', () => {
    render(<DebouncedInput value="hello" onChange={() => {}} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('hello');
  });

  it('renders a label when provided', () => {
    render(<DebouncedInput label="Search" value="" onChange={() => {}} />);
    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  it('does not render a label when not provided', () => {
    const { container } = render(<DebouncedInput value="" onChange={() => {}} />);
    expect(container.querySelector('label')).toBeNull();
  });

  it('updates the input value immediately on typing', () => {
    render(<DebouncedInput value="" onChange={() => {}} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'typed' } });
    expect(input).toHaveValue('typed');
  });

  it('does not call onChange on initial render', () => {
    const onChange = vi.fn();
    render(<DebouncedInput value="initial" onChange={onChange} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onChange with debounced value after delay', () => {
    const onChange = vi.fn();
    render(<DebouncedInput value="" onChange={onChange} debounceMs={300} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'search' } });

    // Not yet called
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onChange).not.toHaveBeenCalled();

    // Now called
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onChange).toHaveBeenCalledWith('search');
  });

  it('uses 500ms default debounce delay', () => {
    const onChange = vi.fn();
    render(<DebouncedInput value="" onChange={onChange} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'test' } });

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onChange).toHaveBeenCalledWith('test');
  });

  it('syncs with external value changes', () => {
    const { rerender } = render(
      <DebouncedInput value="old" onChange={() => {}} />
    );
    rerender(<DebouncedInput value="new" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('new');
  });

  it('passes through additional HTML input props', () => {
    render(
      <DebouncedInput
        value=""
        onChange={() => {}}
        placeholder="Type here..."
        disabled
      />
    );
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'Type here...');
    expect(input).toBeDisabled();
  });
});

describe('DebouncedTextArea', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with the initial value', () => {
    render(<DebouncedTextArea value="content" onChange={() => {}} />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('content');
  });

  it('renders a label when provided', () => {
    render(<DebouncedTextArea label="Description" value="" onChange={() => {}} />);
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  it('does not call onChange on initial render', () => {
    const onChange = vi.fn();
    render(<DebouncedTextArea value="initial" onChange={onChange} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onChange after debounce delay', () => {
    const onChange = vi.fn();
    render(<DebouncedTextArea value="" onChange={onChange} debounceMs={300} />);
    const textarea = screen.getByRole('textbox');

    fireEvent.change(textarea, { target: { value: 'new text' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onChange).toHaveBeenCalledWith('new text');
  });

  it('does not call onChange when debounced value matches external value', () => {
    const onChange = vi.fn();
    render(<DebouncedTextArea value="same" onChange={onChange} debounceMs={200} />);
    const textarea = screen.getByRole('textbox');

    // Type same value as external
    fireEvent.change(textarea, { target: { value: 'same' } });

    act(() => {
      vi.advanceTimersByTime(200);
    });
    // Should not fire because debounced value === external value
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('DebouncedColorPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a color input with the initial value', () => {
    const { container } = render(
      <DebouncedColorPicker value="#ff0000" onChange={() => {}} />
    );
    const input = container.querySelector('input[type="color"]');
    expect(input).toHaveValue('#ff0000');
  });

  it('uses 200ms default debounce delay', () => {
    const onChange = vi.fn();
    const { container } = render(
      <DebouncedColorPicker value="#000000" onChange={onChange} />
    );
    const input = container.querySelector('input[type="color"]')!;

    fireEvent.change(input, { target: { value: '#ff5733' } });

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onChange).toHaveBeenCalledWith('#ff5733');
  });

  it('does not call onChange on initial render', () => {
    const onChange = vi.fn();
    render(<DebouncedColorPicker value="#123456" onChange={onChange} />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
