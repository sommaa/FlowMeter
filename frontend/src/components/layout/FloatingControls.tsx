/**
 * Floating Controls component for global dashboard layout adjustments.
 *
 * This component renders a fixed-position control panel in the bottom-right corner
 * of the viewport, allowing users to adjust the dashboard grid column layout.
 * It provides quick access to switch between 1, 2, or 3 column layouts without
 * entering settings menus.
 *
 * Features:
 * - Fixed bottom-right positioning (floating above content)
 * - Three column layout options (1, 2, 3 columns)
 * - Visual icons representing each layout
 * - Active state highlighting
 * - Only visible when visualizations exist
 * - Smooth transition animations
 * - Hover shadow effect
 *
 * The control panel automatically hides when no visualizations are present,
 * preventing clutter on empty dashboards.
 *
 * @module components/layout/FloatingControls
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Rows, LayoutGrid, Grid } from 'lucide-react';
import { useStore } from '@/store';

/**
 * Floating Controls component.
 *
 * Renders a bottom-right floating panel for column layout selection:
 *
 * **Container**:
 * - Fixed position: bottom-6 right-6
 * - Z-index: 50 (above dashboard content, below modals)
 * - Background: bg-card with border
 * - Rounded-xl with shadow-sm
 * - Hover: shadow-md (elevation increase)
 * - Padding: p-1.5 (compact)
 * - Flex row layout with gap-1
 *
 * **Label**:
 * - Text: "COLUMNS" (uppercase, tracking-wider)
 * - Font size: text-[10px]
 * - Color: text-muted-foreground
 * - Padding: pl-2 pr-1 (left/right spacing)
 * - Font weight: font-medium
 *
 * **Column Buttons** (1, 2, 3):
 * - Circular icons representing layout:
 *   - **1 Column**: Rows icon (single vertical stack)
 *   - **2 Columns**: LayoutGrid icon (2x2 grid)
 *   - **3 Columns**: Grid icon (3x3 grid)
 * - Size: 16x16 px icons (w-4 h-4)
 * - Padding: p-2 (total 32x32px button)
 * - Rounded: rounded-lg
 * - Transition: all 200ms
 *
 * **Active State**:
 * - Background: bg-primary
 * - Text: text-primary-foreground
 * - Shadow: shadow-sm
 * - Determined by: visualizationColumns === cols
 *
 * **Inactive State**:
 * - Text: text-muted-foreground
 * - Hover background: hover:bg-muted/50
 * - Hover text: hover:text-foreground
 * - No shadow
 *
 * **Tooltips**:
 * - Title attribute on each button
 * - Text: "1 Column", "2 Columns", "3 Columns"
 * - Native browser tooltip on hover
 *
 * **Conditional Rendering**:
 * - Only renders if visualizations.length > 0
 * - Hides completely when dashboard empty
 * - Prevents visual clutter on empty state
 *
 * **State Management**:
 * - **Zustand Store**:
 *   - `visualizations`: Array of viz configs (for length check)
 *   - `visualizationColumns`: Current column count (1, 2, or 3)
 *   - `setVisualizationColumns(cols)`: Updates column layout
 * - No local state (stateless component)
 *
 * **Layout Impact**:
 * - Clicking button updates global visualizationColumns
 * - DashboardGrid responds to change via Zustand selector
 * - CSS grid classes update: grid-cols-1, grid-cols-2, or grid-cols-3
 * - Transition: All charts reflow smoothly via CSS transitions
 *
 * **Responsive Behavior**:
 * - Fixed position maintains corner placement on all screen sizes
 * - Bottom-right position avoids conflict with sidebar/topbar
 * - Small footprint (compact design)
 * - Touch-friendly button sizes (32x32px)
 *
 * **Accessibility**:
 * - Title tooltips provide context
 * - Visual icons clearly communicate layout
 * - Keyboard navigation supported (native button)
 * - High contrast between active/inactive states
 *
 * **Use Cases**:
 * - Single column: Detailed analysis, presentations
 * - Two columns: Balanced view, comparisons
 * - Three columns: Overview, monitoring dashboards
 *
 * @returns {JSX.Element | null} Floating column selector or null if no visualizations
 *
 * @example
 * ```tsx
 * // Automatically rendered in App.tsx
 * <FloatingControls />
 * ```
 */
export const FloatingControls: React.FC = () => {
    const visualizations = useStore((state) => state.visualizations);
    const visualizationColumns = useStore((state) => state.visualizationColumns);
    const setVisualizationColumns = useStore((state) => state.setVisualizationColumns);

    return (
        <>
            {/* Floating Column Selector */}
            {visualizations.length > 0 && (
                <div className="fixed bottom-6 right-6 z-50 flex items-center gap-0.5 bg-card p-1 rounded-lg border border-border shadow-sm transition-colors">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pl-2 pr-1">Columns</span>
                    {[1, 2, 3].map((cols) => (
                        <button
                            key={cols}
                            onClick={() => setVisualizationColumns(cols)}
                            className={cn(
                                "p-1.5 rounded-md transition-colors duration-150",
                                visualizationColumns === cols
                                    ? "bg-foreground text-background"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                            )}
                            title={`${cols} Column${cols > 1 ? 's' : ''}`}
                        >
                            {cols === 1 ? (
                                <Rows className="w-4 h-4" />
                            ) : cols === 2 ? (
                                <LayoutGrid className="w-4 h-4" />
                            ) : (
                                <Grid className="w-4 h-4" />
                            )}
                        </button>
                    ))}
                </div>
            )}


        </>
    );
};
