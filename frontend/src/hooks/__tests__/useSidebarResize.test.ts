import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarResize } from '../useSidebarResize';

describe('useSidebarResize', () => {
    it('returns isResizing false initially', () => {
        const setSidebarWidth = vi.fn();
        const { result } = renderHook(() => useSidebarResize(setSidebarWidth));
        expect(result.current.isResizing).toBe(false);
    });

    it('returns handleMouseDown function', () => {
        const setSidebarWidth = vi.fn();
        const { result } = renderHook(() => useSidebarResize(setSidebarWidth));
        expect(typeof result.current.handleMouseDown).toBe('function');
    });

    it('sets isResizing true on mouseDown', () => {
        const setSidebarWidth = vi.fn();
        const { result } = renderHook(() => useSidebarResize(setSidebarWidth));

        act(() => {
            result.current.handleMouseDown({
                preventDefault: vi.fn(),
            } as any);
        });

        expect(result.current.isResizing).toBe(true);
    });

    it('sets cursor to col-resize during drag', () => {
        const setSidebarWidth = vi.fn();
        const { result } = renderHook(() => useSidebarResize(setSidebarWidth));

        act(() => {
            result.current.handleMouseDown({
                preventDefault: vi.fn(),
            } as any);
        });

        expect(document.body.style.cursor).toBe('col-resize');
        expect(document.body.style.userSelect).toBe('none');
    });

    it('updates width on mousemove during drag', () => {
        const setSidebarWidth = vi.fn();
        const { result } = renderHook(() => useSidebarResize(setSidebarWidth));

        act(() => {
            result.current.handleMouseDown({
                preventDefault: vi.fn(),
            } as any);
        });

        act(() => {
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 }));
        });

        expect(setSidebarWidth).toHaveBeenCalledWith(400);
    });

    it('clamps width to minWidth', () => {
        const setSidebarWidth = vi.fn();
        const { result } = renderHook(() =>
            useSidebarResize(setSidebarWidth, { minWidth: 300 })
        );

        act(() => {
            result.current.handleMouseDown({
                preventDefault: vi.fn(),
            } as any);
        });

        act(() => {
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 }));
        });

        expect(setSidebarWidth).toHaveBeenCalledWith(300);
    });

    it('clamps width to maxWidth', () => {
        const setSidebarWidth = vi.fn();
        const { result } = renderHook(() =>
            useSidebarResize(setSidebarWidth, { maxWidth: 500 })
        );

        act(() => {
            result.current.handleMouseDown({
                preventDefault: vi.fn(),
            } as any);
        });

        act(() => {
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 800 }));
        });

        expect(setSidebarWidth).toHaveBeenCalledWith(500);
    });

    it('stops resizing on mouseup', () => {
        const setSidebarWidth = vi.fn();
        const { result } = renderHook(() => useSidebarResize(setSidebarWidth));

        act(() => {
            result.current.handleMouseDown({
                preventDefault: vi.fn(),
            } as any);
        });

        expect(result.current.isResizing).toBe(true);

        act(() => {
            document.dispatchEvent(new MouseEvent('mouseup'));
        });

        expect(result.current.isResizing).toBe(false);
        expect(document.body.style.cursor).toBe('');
        expect(document.body.style.userSelect).toBe('');
    });
});
