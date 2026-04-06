import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Props for the SimpleTooltip component.
 */
interface SimpleTooltipProps {
    /** Tooltip text content to display */
    content: string;
    /** Element that triggers the tooltip on hover */
    children: React.ReactNode;
    /** Side to display tooltip relative to trigger (default: "right") */
    side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * Lightweight tooltip component with customizable positioning.
 *
 * Displays a small text tooltip on hover with automatic positioning
 * relative to the trigger element. The tooltip is rendered as a portal
 * to document.body to avoid z-index and overflow clipping issues.
 *
 * Features:
 * - Four positioning options: top, right, bottom, left
 * - Fixed 8px offset from trigger element
 * - Fade-in animation (150ms duration)
 * - Black semi-transparent background (80% opacity)
 * - Prevents text wrapping with whitespace-nowrap
 * - High z-index (9999) to appear above other content
 * - Dynamically calculates position based on trigger's bounding rect
 *
 * Positioning behavior:
 * - **right**: Centered vertically, 8px to the right
 * - **left**: Centered vertically, 8px to the left (transformed -100%)
 * - **top**: Centered horizontally, 8px above (transformed -100%)
 * - **bottom**: Centered horizontally, 8px below
 *
 * @example
 * ```tsx
 * <SimpleTooltip content="Delete visualization" side="top">
 *   <button><Trash className="w-4 h-4" /></button>
 * </SimpleTooltip>
 * ```
 *
 * @example
 * ```tsx
 * <SimpleTooltip content="Settings">
 *   <Settings className="w-5 h-5" />
 * </SimpleTooltip>
 * ```
 */
export const SimpleTooltip: React.FC<SimpleTooltipProps> = ({
    content,
    children,
    side = 'right'
}) => {
    const [tooltipState, setTooltipState] = useState<{
        visible: boolean;
        top: number;
        left: number;
    } | null>(null);
    const triggerRef = useRef<HTMLDivElement>(null);

    const getTransformStyle = useCallback(() => {
        switch (side) {
            case 'right':
                return 'translateY(-50%)';
            case 'left':
                return 'translate(-100%, -50%)';
            case 'top':
                return 'translate(-50%, -100%)';
            case 'bottom':
                return 'translateX(-50%)';
            default:
                return '';
        }
    }, [side]);

    const handleMouseEnter = useCallback(() => {
        if (!triggerRef.current) return;

        const rect = triggerRef.current.getBoundingClientRect();
        const offset = 8;

        let top = 0;
        let left = 0;

        switch (side) {
            case 'right':
                top = rect.top + rect.height / 2;
                left = rect.right + offset;
                break;
            case 'left':
                top = rect.top + rect.height / 2;
                left = rect.left - offset;
                break;
            case 'top':
                top = rect.top - offset;
                left = rect.left + rect.width / 2;
                break;
            case 'bottom':
                top = rect.bottom + offset;
                left = rect.left + rect.width / 2;
                break;
        }

        setTooltipState({ visible: true, top, left });
    }, [side]);

    const handleMouseLeave = useCallback(() => {
        setTooltipState(null);
    }, []);

    const tooltip = tooltipState && createPortal(
        <div
            className="fixed px-2 py-1 text-xs font-medium text-white bg-black/80 rounded-md pointer-events-none whitespace-nowrap animate-in fade-in duration-150"
            style={{
                top: tooltipState.top,
                left: tooltipState.left,
                transform: getTransformStyle(),
                zIndex: 9999
            }}
        >
            {content}
        </div>,
        document.body
    );

    return (
        <>
            <div
                ref={triggerRef}
                className="flex items-center justify-center"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {children}
            </div>
            {tooltip}
        </>
    );
};
