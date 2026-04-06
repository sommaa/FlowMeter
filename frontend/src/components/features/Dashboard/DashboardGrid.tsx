/**
 * Dashboard Grid component for managing and displaying visualization cards.
 *
 * This component renders the main dashboard area containing all active visualizations
 * in a responsive grid layout. It provides:
 * - Drag-and-drop reordering using @dnd-kit
 * - Responsive column layout (1-3 columns based on user preference)
 * - Empty state handling (no data vs. no visualizations)
 * - Onboarding integration (hides if onboarding wizard active)
 *
 * The grid adapts to user-configured column count:
 * - 1 column: Full-width cards on all screens
 * - 2 columns: Single column on mobile, two columns on desktop (lg+)
 * - 3 columns: Single column on mobile, two on desktop (lg+), three on wide screens (2xl+)
 *
 * Features:
 * - Pointer and keyboard-based drag-and-drop (accessibility)
 * - Closest-center collision detection for smooth UX
 * - Rectangular sorting strategy (optimized for grid layouts)
 * - Empty state with contextual messaging and action buttons
 * - Floating "Add Visualization" button at bottom of grid
 *
 * Empty States:
 * - **No Dataset**: Shows "No Data Loaded" with database icon, prompts file upload
 * - **No Visualizations**: Shows "Dashboard is Empty" with grid icon, "Create Visualization" button
 * - **Onboarding Active**: Returns null to let wizard handle UI
 *
 * @module components/features/Dashboard/DashboardGrid
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Plus, LayoutGrid, Database } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    rectSortingStrategy,
} from '@dnd-kit/sortable';
import { useStore } from '@/store';
import { VisualizationCard } from '@/components/visualizations';
import { Button } from '@/components/common';
import type { VisualizationConfig } from '@/types';

/**
 * Dashboard Grid component.
 *
 * Renders the main visualization dashboard with drag-and-drop reordering:
 *
 * **Layout**:
 * - Responsive CSS grid based on visualizationColumns setting
 * - Column configurations:
 *   - `visualizationColumns = 1`: `grid-cols-1` (always single column)
 *   - `visualizationColumns = 2`: `grid-cols-1 lg:grid-cols-2` (responsive)
 *   - `visualizationColumns = 3`: `grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3` (responsive)
 * - 1.5rem gap between cards (`gap-6`)
 * - Full-width stretch to fill available space
 *
 * **Drag-and-Drop**:
 * - Uses @dnd-kit/core for accessibility and performance
 * - Sensors: PointerSensor (mouse/touch), KeyboardSensor (arrow keys)
 * - Collision: closestCenter (smooth drop target detection)
 * - Strategy: rectSortingStrategy (optimized for 2D grids)
 * - On drop: Calls reorderVisualizations(oldIndex, newIndex)
 * - Live reordering without API calls (state-only)
 *
 * **Empty State Logic**:
 * - If `visualizations.length === 0`:
 *   - If `!hasOnboarded && !currentDataset`: Return null (wizard shows)
 *   - If `currentDataset`: Show "Dashboard is Empty" with "Create Visualization" button
 *   - If `!currentDataset`: Show "No Data Loaded" with upload prompt
 *
 * **Empty State UI**:
 * - Dashed border card with muted background
 * - Centered layout with icon, heading, description, action button
 * - Icons:
 *   - LayoutGrid: Dashboard empty (has dataset)
 *   - Database: No data loaded (no dataset)
 * - Primary action button only shows if dataset loaded
 *
 * **Grid Content**:
 * - DndContext wraps entire grid for drag-and-drop
 * - SortableContext provides sortable item IDs
 * - Maps visualizations to VisualizationCard components
 * - Passes config and column count to each card
 * - Each card renders its own plot, controls, and interactions
 *
 * **Add Button**:
 * - Floating at bottom of grid (centered)
 * - Only visible if dataset loaded
 * - Calls addVisualization() → creates new viz with default config
 * - Icon: Plus (lucide-react)
 *
 * **State Management**:
 * - Reads from Zustand store:
 *   - `visualizations`: Array of VisualizationConfig
 *   - `visualizationColumns`: 1, 2, or 3 (user preference)
 *   - `currentDataset`: Loaded dataset or null
 *   - `hasOnboarded`: Whether user completed onboarding wizard
 * - Actions:
 *   - `reorderVisualizations(oldIndex, newIndex)`: Reorder array
 *   - `addVisualization()`: Create new viz
 *
 * **Performance**:
 * - VisualizationCard handles its own memoization
 * - Drag-and-drop optimized with @dnd-kit (no re-renders during drag)
 * - Grid layout uses native CSS (no JS calculations)
 *
 * **Accessibility**:
 * - Keyboard navigation for drag-and-drop (arrow keys, space/enter)
 * - Semantic HTML with proper button labels
 * - Screen reader announcements via @dnd-kit
 *
 * @returns {JSX.Element | null} Dashboard grid or empty state (null if onboarding active)
 *
 * @example
 * ```tsx
 * // Used in main App component
 * <DashboardGrid />
 * ```
 */
export const DashboardGrid: React.FC = () => {
    const visualizations = useStore((state) => state.visualizations);
    const visualizationColumns = useStore((state) => state.visualizationColumns);
    const reorderVisualizations = useStore((state) => state.reorderVisualizations);
    const addVisualization = useStore((state) => state.addVisualization);
    const currentDataset = useStore((state) => state.currentDataset);
    const hasOnboarded = useStore((state) => state.hasOnboarded);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor)
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = visualizations.findIndex((v: VisualizationConfig) => v.id === active.id);
            const newIndex = visualizations.findIndex((v: VisualizationConfig) => v.id === over.id);
            reorderVisualizations(oldIndex, newIndex);
        }
    };

    if (visualizations.length === 0) {
        if (!hasOnboarded && !currentDataset) return null; // Let wizard handle it

        return (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                <div className="p-3 rounded-xl bg-muted mb-4">
                    {currentDataset ? <LayoutGrid className="w-6 h-6 text-muted-foreground" /> : <Database className="w-6 h-6 text-muted-foreground" />}
                </div>
                <h3 className="text-base font-medium mb-1.5">
                    {currentDataset ? 'Dashboard is empty' : 'No data loaded'}
                </h3>
                <p className="text-sm text-muted-foreground mb-5 max-w-xs">
                    {currentDataset
                        ? 'Add your first visualization to start monitoring your process data.'
                        : 'Upload a dataset via the sidebar to get started.'}
                </p>
                {currentDataset && (
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => addVisualization()}
                        icon={<Plus className="w-4 h-4" />}
                    >
                        Create Visualization
                    </Button>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-6">


            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={visualizations.map((v: VisualizationConfig) => v.id)}
                    strategy={rectSortingStrategy}
                >
                    <div
                        className={cn('grid gap-6', {
                            'grid-cols-1': visualizationColumns === 1,
                            'grid-cols-1 lg:grid-cols-2': visualizationColumns === 2,
                            'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3': visualizationColumns === 3,
                        })}
                    >
                        {visualizations.map((viz: VisualizationConfig) => (
                            <VisualizationCard
                                key={viz.id}
                                config={viz}
                                columns={visualizationColumns}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            {currentDataset && (
                <div className="flex justify-center py-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addVisualization()}
                        icon={<Plus className="w-4 h-4" />}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        Add Visualization
                    </Button>
                </div>
            )}
        </div>
    );
};
