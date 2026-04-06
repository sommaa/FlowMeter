import { useState, useCallback, useEffect } from 'react';

/**
 * Options for configuring sidebar resize behavior.
 */
interface UseSidebarResizeOptions {
    /** Minimum sidebar width in pixels (default: 320) */
    minWidth?: number;
    /** Maximum sidebar width in pixels (default: 600) */
    maxWidth?: number;
}

/**
 * Return value from useSidebarResize hook.
 */
interface UseSidebarResizeReturn {
    /** Whether a resize drag is currently active */
    isResizing: boolean;
    /** Handler to attach to resize handle's onMouseDown event */
    handleMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Custom hook for implementing drag-to-resize sidebar functionality.
 *
 * Provides mouse event handlers and state management for resizable sidebars.
 * Handles drag initiation, continuous resize during drag, and cleanup on release.
 *
 * Features:
 * - Width constraints with configurable min/max bounds
 * - Visual feedback: changes cursor to 'col-resize' during drag
 * - Prevents text selection during drag (userSelect: 'none')
 * - Automatic event listener cleanup on unmount
 * - Clamps width to stay within minWidth-maxWidth range
 *
 * The hook manages document-level mouse events to support dragging beyond
 * the resize handle element, providing a smooth UX. Uses clientX directly
 * as the new width, assuming the sidebar is positioned from the left edge.
 *
 * @param setSidebarWidth - Callback to update sidebar width state
 * @param options - Optional min/max width configuration
 * @returns Object with isResizing flag and handleMouseDown handler
 *
 * @example
 * ```tsx
 * const [sidebarWidth, setSidebarWidth] = useState(320);
 * const { isResizing, handleMouseDown } = useSidebarResize(setSidebarWidth, {
 *   minWidth: 280,
 *   maxWidth: 500
 * });
 *
 * return (
 *   <div style={{ width: sidebarWidth }}>
 *     <div
 *       className="resize-handle"
 *       onMouseDown={handleMouseDown}
 *       style={{ cursor: isResizing ? 'col-resize' : 'ew-resize' }}
 *     />
 *   </div>
 * );
 * ```
 */
export function useSidebarResize(
    setSidebarWidth: (width: number) => void,
    options: UseSidebarResizeOptions = {}
): UseSidebarResizeReturn {
    const { minWidth = 320, maxWidth = 600 } = options;
    const [isResizing, setIsResizing] = useState(false);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizing) return;
        const newWidth = Math.min(maxWidth, Math.max(minWidth, e.clientX));
        setSidebarWidth(newWidth);
    }, [isResizing, setSidebarWidth, minWidth, maxWidth]);

    const handleMouseUp = useCallback(() => {
        setIsResizing(false);
    }, []);

    useEffect(() => {
        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        } else {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing, handleMouseMove, handleMouseUp]);

    return { isResizing, handleMouseDown };
}
