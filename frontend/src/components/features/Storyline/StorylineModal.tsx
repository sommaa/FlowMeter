/**
 * Storyline Modal for tracking and visualizing key events alongside process data.
 *
 * This modal provides a timeline interface for recording significant events that occurred
 * during the process run (e.g., equipment maintenance, recipe changes, upsets, startups).
 * Events are displayed as vertical timeline markers on time-series visualizations and
 * serve as contextual annotations for data analysis.
 *
 * Features:
 * - Two-pane layout: Form (left) and Event List (right)
 * - Add/edit/delete events with full CRUD interface
 * - Custom color markers for visual categorization
 * - Datetime picker for precise event timing
 * - Vertical timeline visualization with numbered badges
 * - Hover-based action buttons (edit/delete)
 * - Automatic sorting by date (newest first)
 * - Form state management with validation
 *
 * Events are stored in Zustand global state and persisted across sessions.
 * They appear as colored vertical lines on compatible visualizations (line, scatter)
 * with hover tooltips showing event details.
 *
 * Common Use Cases:
 * - Equipment maintenance: "Pump #3 serviced" (yellow marker)
 * - Process upsets: "Feed interruption" (red marker)
 * - Recipe changes: "Switched to batch #42" (blue marker)
 * - Quality samples: "Product sample taken" (green marker)
 *
 * @module components/features/Storyline/StorylineModal
 */

import React, { useState } from 'react';
import { useStore } from '@/store';
import { X, Plus, Trash2, Calendar, Edit2, BookOpen } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog";

/**
 * Storyline Modal component.
 *
 * Renders a two-pane modal for managing storyline events:
 *
 * **Header**:
 * - BookOpen icon (primary color)
 * - Title: "Storyline"
 * - Description: "Track and visualize key events alongside your process data."
 *
 * **Left Pane** (Sidebar, 320px width):
 * - **Default State** (not adding/editing):
 *   - "Add New Event" button (primary, full-width)
 *   - Footer text: "Events added here will typically be linked to your dataset's timeline."
 *
 * - **Add/Edit Form** (when isAdding=true):
 *   - Close button (X icon, top-right)
 *   - Header: "New Event" or "Edit Event"
 *   - **Form Fields**:
 *     - **Title**: Text input (auto-focus, required)
 *     - **Date & Time**: datetime-local input (HTML5 picker)
 *     - **Description**: Textarea (min-height: 80px, resizable)
 *     - **Marker Color**: Color picker + hex input
 *       - Visual color swatch (40x40 px)
 *       - Hex text input (monospace, synced with picker)
 *       - Default: #6366f1 (indigo)
 *   - **Footer Buttons**:
 *     - Cancel (secondary, flex-1) → Resets form
 *     - Add Event / Save Changes (primary, flex-1) → Submits
 *   - Animated entrance: fade-in + zoom-in-95 (200ms)
 *
 * **Right Pane** (Main Area):
 * - **Header**: "Event History" (sticky, with border-bottom)
 * - **Empty State**:
 *   - Centered Calendar icon (opacity 20%, large)
 *   - "No events recorded."
 *   - "Add an event to get started."
 *
 * - **Timeline List** (vertical layout):
 *   - Vertical line connecting all events (absolute positioned, bg-border/50)
 *   - Each event card:
 *     - **Numbered Badge** (absolute left):
 *       - Circular (20x20 px)
 *       - White text on event color background
 *       - Sequential numbering (1, 2, 3...)
 *       - Ring effect (ring-4 ring-background)
 *       - Hover: scale-110 transform
 *     - **Card Content**:
 *       - Title (font-medium, text-sm)
 *       - Actions (hover reveal):
 *         - Edit button (Edit2 icon)
 *         - Delete button (Trash2 icon, destructive)
 *       - Timestamp (locale-formatted, text-primary)
 *       - Description (whitespace-pre-wrap, muted)
 *     - Hover: Shadow-md + primary border tint
 *     - Editing state: Ring-1 ring-primary
 *
 * **State Management**:
 * - **Zustand Store**:
 *   - `isStorylineOpen`: Modal visibility
 *   - `setStorylineOpen(boolean)`: Toggle modal
 *   - `storylineEvents`: Array of events with id, date, title, description, color
 *   - `addStorylineEvent(data)`: Creates new event with UUID
 *   - `removeStorylineEvent(id)`: Deletes event
 *   - `updateStorylineEvent(id, data)`: Updates existing event
 *
 * - **Local State**:
 *   - `isAdding`: Show form mode
 *   - `editingId`: ID of event being edited (or null)
 *   - `formData`: { date, title, description, color }
 *     - date: ISO string from datetime-local input
 *     - title: Event name
 *     - description: Event details
 *     - color: Hex color code
 *
 * **Form Lifecycle**:
 * 1. User clicks "Add New Event" → isAdding=true, form appears
 * 2. User fills fields (title required, date defaults to now)
 * 3. User selects marker color (color picker + hex input)
 * 4. User clicks "Add Event" → addStorylineEvent(formData)
 * 5. Form resets, isAdding=false, new event appears in timeline
 *
 * **Edit Flow**:
 * 1. User hovers event card → Edit button appears
 * 2. User clicks Edit → handleEdit(event)
 * 3. Form populates with event data, editingId set
 * 4. User modifies fields
 * 5. User clicks "Save Changes" → updateStorylineEvent(editingId, formData)
 * 6. Form resets, event updates in timeline
 *
 * **Delete Flow**:
 * 1. User hovers event card → Delete button appears
 * 2. User clicks Trash → removeStorylineEvent(event.id)
 * 3. Event immediately removed from timeline
 * 4. No confirmation dialog (consider adding for safety)
 *
 * **Date Handling**:
 * - Input: HTML5 datetime-local (YYYY-MM-DDTHH:mm format)
 * - Display: Locale-formatted with toLocaleString()
 * - Storage: ISO string (new Date().toISOString())
 * - Conversion: slice(0, 16) for datetime-local compatibility
 *
 * **Color Management**:
 * - Color picker: Native HTML5 input[type="color"]
 * - Hex input: Synced with picker, allows manual entry
 * - Default: #6366f1 (indigo-500)
 * - Applied to timeline badge background
 * - Stored as hex string in event object
 *
 * **Timeline Styling**:
 * - Vertical line: absolute left-[29.5px] (precise centering)
 * - Line extends from top-2 to bottom-4
 * - Badge positioned left-1 top-3 (relative to card)
 * - Numbered badges: Bold white text, centered
 * - Sequential numbering using map index + 1
 *
 * **Responsive Layout**:
 * - Max width: 5xl (1024px)
 * - Max height: 85vh
 * - Two-pane flex layout (flex-col md:flex-row)
 * - Sidebar: 320px on desktop, full-width on mobile
 * - Border switches: border-b (mobile) → border-r (desktop)
 *
 * **Validation**:
 * - Title required (!formData.title returns early)
 * - Date required (!formData.date returns early)
 * - Description optional (can be empty)
 * - Color always has default
 *
 * **Footer**:
 * - Single "Close" button (ghost variant)
 * - Border-top separator
 * - Muted background
 *
 * **Integration with Visualizations**:
 * - Events passed to InteractivePlot component
 * - Rendered as vertical lines (shapes) on time-series plots
 * - Hover shows tooltip with title + description
 * - Color matches event.color from this modal
 *
 * @returns {JSX.Element} Storyline management modal
 *
 * @example
 * ```tsx
 * // Triggered from TopBar or sidebar
 * <StorylineModal />
 * ```
 */
export const StorylineModal: React.FC = () => {
    const isOpen = useStore(state => state.isStorylineOpen);
    const setOpen = useStore(state => state.setStorylineOpen);
    const events = useStore(state => state.storylineEvents);
    const addEvent = useStore(state => state.addStorylineEvent);
    const removeEvent = useStore(state => state.removeStorylineEvent);
    const updateEvent = useStore(state => state.updateStorylineEvent);

    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Helper: produce local datetime string for datetime-local inputs (YYYY-MM-DDTHH:MM)
    // toISOString() converts to UTC which causes timezone offset bugs with datetime-local inputs
    const toLocalDateTimeInput = (d: Date) => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    // Form State
    const [formData, setFormData] = useState({
        date: toLocalDateTimeInput(new Date()),
        title: '',
        description: '',
        color: '#6366f1' // Default indigo
    });

    const resetForm = () => {
        setFormData({
            date: toLocalDateTimeInput(new Date()),
            title: '',
            description: '',
            color: '#6366f1'
        });
        setIsAdding(false);
        setEditingId(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title || !formData.date) return;

        if (editingId) {
            updateEvent(editingId, formData);
        } else {
            addEvent(formData);
        }
        resetForm();
    };

    const handleEdit = (event: typeof events[0]) => {
        setFormData({
            date: event.date.slice(0, 16),
            title: event.title,
            description: event.description,
            color: event.color || '#6366f1'
        });
        setEditingId(event.id);
        setIsAdding(true);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && setOpen(false)}>
            <DialogContent className="sm:max-w-5xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-6 py-4 border-b shrink-0 bg-muted/20">
                    <DialogTitle className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-primary" />
                        Storyline
                    </DialogTitle>
                    <DialogDescription>
                        Track and visualize key events alongside your process data.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">

                    {/* Left: Input Form / Sidebar Controls */}
                    <div className="w-full md:w-80 bg-muted/30 border-b md:border-b-0 md:border-r border-border p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
                        {!isAdding ? (
                            <Button
                                variant="primary"
                                className="w-full justify-center"
                                onClick={() => setIsAdding(true)}
                                icon={<Plus className="w-4 h-4" />}
                            >
                                Add New Event
                            </Button>
                        ) : (
                            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-semibold text-sm">{editingId ? 'Edit Event' : 'New Event'}</h3>
                                    <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <form onSubmit={handleSubmit} className="space-y-3">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">Title</label>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm transition-all shadow-sm"
                                            placeholder="Event Title"
                                            value={formData.title}
                                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                                            autoFocus
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">Date & Time</label>
                                        <input
                                            type="datetime-local"
                                            className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm transition-all shadow-sm"
                                            value={formData.date}
                                            onChange={e => setFormData({ ...formData, date: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">Description</label>
                                        <textarea
                                            className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm min-h-[80px] transition-all resize-y shadow-sm"
                                            placeholder="What happened?"
                                            value={formData.description}
                                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">Marker Color</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                className="w-10 h-10 rounded-md cursor-pointer border border-input shadow-sm"
                                                value={formData.color}
                                                onChange={e => setFormData({ ...formData, color: e.target.value })}
                                            />
                                            <input
                                                type="text"
                                                className="flex-1 px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary focus:border-primary outline-none text-sm transition-all shadow-sm font-mono"
                                                value={formData.color}
                                                onChange={e => setFormData({ ...formData, color: e.target.value })}
                                                placeholder="#6366f1"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-2 pt-2">
                                        <Button variant="secondary" size="sm" onClick={resetForm} type="button" className="flex-1">Cancel</Button>
                                        <Button variant="primary" size="sm" type="submit" className="flex-1">
                                            {editingId ? 'Save Changes' : 'Add Event'}
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {!isAdding && (
                            <div className="mt-auto pt-4 border-t border-border text-xs text-muted-foreground">
                                <p>Events added here will typically be linked to your dataset's timeline.</p>
                            </div>
                        )}
                    </div>

                    {/* Right: Event List (Vertical Timeline Style) */}
                    <div className="flex-1 p-4 overflow-y-auto bg-background">
                        <h3 className="font-semibold text-sm mb-6 sticky top-0 bg-background z-10 py-2 border-b">Event History</h3>

                        {events.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                                <Calendar className="w-12 h-12 opacity-20" />
                                <p>No events recorded.</p>
                                <p className="text-xs">Add an event to get started.</p>
                            </div>
                        ) : (
                            <div className="space-y-3 relative pl-4">
                                {/* Vertical Line */}
                                <div className="absolute left-[29.5px] top-2 bottom-4 w-px bg-border/50" />

                                {events.map((event, index) => (
                                    <div key={event.id} className="relative pl-10 group">
                                        {/* Numbered badge on line - uses event color */}
                                        <div
                                            className="absolute left-1 top-3 w-5 h-5 rounded-full ring-4 ring-background z-10 transition-transform group-hover:scale-110 flex items-center justify-center text-xs font-bold text-white"
                                            style={{ backgroundColor: event.color || '#6366f1' }}
                                        >
                                            {index + 1}
                                        </div>

                                        <div
                                            className={cn(
                                                "p-3 rounded-lg border border-border bg-card hover:shadow-md transition-all group-hover:border-primary/30",
                                                editingId === event.id && "ring-1 ring-primary border-primary"
                                            )}
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <h4 className="font-medium text-sm text-foreground">{event.title}</h4>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleEdit(event)}
                                                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => removeEvent(event.id)}
                                                        className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="text-xs text-primary mb-2 font-medium">
                                                {new Date(event.date).toLocaleString()}
                                            </div>

                                            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                                {event.description}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="p-4 border-t shrink-0 bg-muted/20">
                    <Button variant="ghost" onClick={() => setOpen(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
