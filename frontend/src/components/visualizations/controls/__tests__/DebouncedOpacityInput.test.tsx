import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DebouncedOpacityInput } from '../DebouncedOpacityInput';

describe('DebouncedOpacityInput', () => {
    it('renders with initial value', () => {
        render(<DebouncedOpacityInput value={0.5} onChange={() => {}} />);
        const input = screen.getByRole('textbox');
        expect(input).toHaveValue('0.5');
    });

    it('updates local value on typing', () => {
        render(<DebouncedOpacityInput value={0.5} onChange={() => {}} />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: '0.8' } });
        expect(input).toHaveValue('0.8');
    });

    it('calls onChange on blur with valid value', () => {
        const onChange = vi.fn();
        render(<DebouncedOpacityInput value={0.5} onChange={onChange} />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: '0.8' } });
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith(0.8);
    });

    it('calls onChange on Enter key', () => {
        const onChange = vi.fn();
        render(<DebouncedOpacityInput value={0.5} onChange={onChange} />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: '0.3' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith(0.3);
    });

    it('clamps values above 1 to 1', () => {
        const onChange = vi.fn();
        render(<DebouncedOpacityInput value={0.5} onChange={onChange} />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: '1.5' } });
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith(1);
    });

    it('clamps values below 0 to 0', () => {
        const onChange = vi.fn();
        render(<DebouncedOpacityInput value={0.5} onChange={onChange} />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: '-0.3' } });
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith(0);
    });

    it('defaults NaN to 0.1', () => {
        const onChange = vi.fn();
        render(<DebouncedOpacityInput value={0.5} onChange={onChange} />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'abc' } });
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith(0.1);
    });

    it('does not call onChange if value unchanged', () => {
        const onChange = vi.fn();
        render(<DebouncedOpacityInput value={0.5} onChange={onChange} />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: '0.5' } });
        fireEvent.blur(input);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('syncs with external value changes', () => {
        const { rerender } = render(<DebouncedOpacityInput value={0.5} onChange={() => {}} />);
        const input = screen.getByRole('textbox');
        expect(input).toHaveValue('0.5');
        rerender(<DebouncedOpacityInput value={0.7} onChange={() => {}} />);
        expect(input).toHaveValue('0.7');
    });
});
