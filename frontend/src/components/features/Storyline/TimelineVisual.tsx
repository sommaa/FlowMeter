/**
 * Timeline Visual component for rendering storyline events on a horizontal timeline.
 *
 * This component displays storyline events as vertical markers positioned along a
 * horizontal timeline axis. It's typically rendered at the top of the dashboard to
 * provide chronological context for time-series data visualizations.
 *
 * Features:
 * - Horizontal timeline axis spanning dataset date range
 * - Event markers positioned proportionally by date
 * - Hover tooltips showing event title and date
 * - Animated hover effects (bar height increase, dot scale)
 * - Auto-padding for single-date or empty timelines
 * - Responsive width with fixed height
 *
 * The timeline uses the dataset's date_range if available, otherwise calculates
 * range from event dates. Events outside the visible range are clipped.
 *
 * @module components/features/Storyline/TimelineVisual
 */

import React, { useMemo } from 'react';
import { useStore } from '@/store';
// import { format } from 'date-fns';
// checking package.json, date-fns is NOT in dependencies. I'll use native Date or simple formatting.

/**
 * Props for the TimelineVisual component.
 *
 * @interface TimelineVisualProps
 * @property {number} [height=150] - Height of timeline container in pixels
 */
interface TimelineVisualProps {
    height?: number;
}

/**
 * Timeline Visual component.
 *
 * Renders a horizontal timeline with event markers:
 *
 * **Container**:
 * - Full width, fixed height (default 150px)
 * - Muted card background with border
 * - Rounded corners, padding
 * - Select-none (prevents text selection)
 * - Relative positioning for absolute children
 * - Overflow hidden (clips out-of-range events)
 *
 * **Timeline Axis**:
 * - Horizontal bar (height: 4px, bg-border-prominent)
 * - Rounded full (pill shape)
 * - Centered vertically in container
 * - Spans full width with 32px horizontal padding
 *
 * **Date Labels**:
 * - Start date: Absolute positioned at left (bottom of axis)
 * - End date: Absolute positioned at right (bottom of axis)
 * - Small muted text (text-xs, text-muted-foreground)
 * - Whitespace-nowrap prevents wrapping
 * - Formatted with toLocaleDateString()
 *
 * **Event Markers**:
 * - Positioned absolutely along axis
 * - Left: Calculated as percentage of timeline range
 * - Transform: translateX(-50%) for center alignment
 * - Each marker consists of:
 *   - **Vertical Bar**:
 *     - Default: h-16, w-0.5, bg-primary/70
 *     - Hover: h-24, bg-primary (full opacity)
 *     - Transition: all 300ms
 *     - Rounded full (pill shape)
 *   - **Dot**:
 *     - Size: w-3 h-3
 *     - bg-primary, rounded-full
 *     - Shadow-sm for depth
 *     - Ring-2 ring-background (creates border effect)
 *     - Hover: scale-125 transform
 *     - Margin-top: 1 (gap from bar)
 *   - **Tooltip**:
 *     - Positioned absolute bottom-full mb-2
 *     - bg-popover with border and shadow
 *     - Opacity 0 by default, 100 on group hover
 *     - Pointer-events-none (doesn't block interaction)
 *     - z-50 (above all other UI)
 *     - Content:
 *       - Event title (font-semibold)
 *       - Event date (text-[10px], muted)
 *     - Whitespace-nowrap prevents wrapping
 *
 * **Date Range Calculation** (useMemo):
 * - **Priority 1**: Use currentDataset.date_range if available
 * - **Priority 2**: Calculate from event dates (min/max)
 * - **Default**: Current date if no data
 * - **Padding**: Add ±1 day if min === max (prevents division by zero)
 * - Returns: { minDate: timestamp, maxDate: timestamp }
 *
 * **Position Calculation**:
 * - getPosition(dateStr): Converts event date to left percentage (0-100%)
 * - Formula: ((eventTime - minTime) / totalRange) * 100
 * - Clamps to 0-100% range (events outside are not rendered)
 * - Returns 50% if range is zero (fallback)
 *
 * **Event Filtering**:
 * - Events with left < 0 or left > 100 return null (out of view)
 * - Prevents rendering markers outside visible timeline
 * - Improves performance for large event lists
 *
 * **Hover Interactions**:
 * - Group: Applies hover state to all child elements
 * - Hover z-10: Brings marker above siblings
 * - Transition-all duration-300: Smooth animations
 * - Bar grows taller, dot scales up
 * - Tooltip fades in
 *
 * **State Management**:
 * - Reads from Zustand store:
 *   - `storylineEvents`: Array of events to display
 *   - `currentDataset`: For date_range fallback
 * - No local state (stateless component)
 *
 * **Performance Optimizations**:
 * - useMemo for date range calculation (only recalc on data change)
 * - Early return null for out-of-range events
 * - CSS transforms for positioning (GPU accelerated)
 *
 * **Responsive Behavior**:
 * - Full width adapts to container
 * - Fixed height prevents layout shift
 * - Horizontal padding scales with width
 *
 * @param {TimelineVisualProps} props - Component props
 * @returns {JSX.Element} Horizontal timeline with event markers
 *
 * @example
 * ```tsx
 * <TimelineVisual height={120} />
 * ```
 */
export const TimelineVisual: React.FC<TimelineVisualProps> = ({ height = 150 }) => {
    const events = useStore((state) => state.storylineEvents);
    const currentDataset = useStore((state) => state.currentDataset);

    const { minDate, maxDate } = useMemo(() => {
        let min = new Date().getTime();
        let max = new Date().getTime();

        // Use dataset range if available
        if (currentDataset?.date_range) {
            min = new Date(currentDataset.date_range.start).getTime();
            max = new Date(currentDataset.date_range.end).getTime();
        } else if (events.length > 0) {
            // Fallback to events range
            const timestamps = events.map(e => new Date(e.date).getTime());
            min = Math.min(...timestamps);
            max = Math.max(...timestamps);
        }

        // Add padding if min == max or no data
        if (min === max) {
            min -= 86400000; // -1 day
            max += 86400000; // +1 day
        }

        return { minDate: min, maxDate: max };
    }, [currentDataset, events]);

    const getPosition = (dateStr: string) => {
        const time = new Date(dateStr).getTime();
        const range = maxDate - minDate;
        if (range === 0) return 50;
        return ((time - minDate) / range) * 100;
    };

    return (
        <div className="w-full bg-card/50 rounded-lg border border-border p-4 mb-4 select-none relative overflow-hidden" style={{ height }}>
            <div className="absolute inset-0 flex items-center px-8">
                {/* Timeline Axis */}
                <div className="h-1 w-full bg-border-prominent relative rounded-full">
                    {/* Start/End Dates */}
                    <div className="absolute -bottom-6 left-0 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(minDate).toLocaleDateString()}
                    </div>
                    <div className="absolute -bottom-6 right-0 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(maxDate).toLocaleDateString()}
                    </div>
                </div>

                {/* Events */}
                <div className="absolute inset-x-8 h-full top-0">
                    {events.map((event) => {
                        const left = getPosition(event.date);
                        if (left < 0 || left > 100) return null; // Out of view

                        return (
                            <div
                                key={event.id}
                                className="absolute h-full flex flex-col items-center justify-center group hover:z-10 transition-all duration-300"
                                style={{ left: `${left}%`, transform: 'translateX(-50%)' }}
                            >
                                {/* The Vertical Bar */}
                                <div className="w-0.5 h-16 bg-primary/70 group-hover:bg-primary group-hover:h-24 transition-all duration-300 rounded-full" />

                                {/* The Dot */}
                                <div className="w-3 h-3 bg-primary rounded-full shadow-sm ring-2 ring-background mt-1 group-hover:scale-125 transition-transform" />

                                {/* Tooltip/Label */}
                                <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-2 bg-popover text-popover-foreground text-xs rounded-md px-2 py-1 shadow-md border border-border whitespace-nowrap transition-opacity pointer-events-none z-50">
                                    <div className="font-semibold">{event.title}</div>
                                    <div className="text-[10px] text-muted-foreground">{new Date(event.date).toLocaleDateString()}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
