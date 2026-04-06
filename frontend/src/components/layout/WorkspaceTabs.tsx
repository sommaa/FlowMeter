/**
 * Workspace Tabs component for managing and switching between multiple workspaces.
 *
 * This component provides a tabbed interface for creating, switching, renaming, and
 * closing workspaces. Each workspace maintains its own set of visualizations and
 * configuration, allowing users to organize different analysis views or datasets.
 *
 * Features:
 * - Tab-based workspace switching with visual active state
 * - Inline renaming via double-click
 * - Close tabs (requires at least 1 workspace to remain)
 * - Add new workspace via plus button
 * - Folder icons (closed/open) indicating active state
 * - Keyboard shortcuts (Enter to save, Escape to cancel)
 * - Hover animations and shadow effects
 * - Scrollable horizontal tab list
 *
 * Workspaces are persisted in Zustand store and automatically saved/restored
 * across sessions, maintaining visualizations, settings, and state independently.
 *
 * @module components/layout/WorkspaceTabs
 */

import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store';
import { X, Plus, Folder, FolderOpen, Pencil, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { templateApi } from '@/services/api';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/common";


/**
 * Workspace Tabs component.
 *
 * Renders a horizontal tab bar for workspace management:
 *
 * **Container**:
 * - Flex row layout with horizontal scrolling (overflow-x-auto)
 * - Min height: 40px (prevents collapse)
 * - Padding: px-1 pb-1 (bottom padding for shadow visibility)
 * - Gap-2 between tabs
 *
 * **Workspace Tab**:
 * - **Structure**:
 *   - Folder icon (Folder or FolderOpen based on active state)
 *   - Workspace name (truncated if long)
 *   - Close button (X icon, hover reveal)
 * - **Size**:
 *   - Min width: 100px
 *   - Max width: 180px
 *   - Padding: px-3 py-1.5
 *   - Rounded-lg with border and shadow
 * - **Active State**:
 *   - Background: bg-primary
 *   - Text: text-primary-foreground
 *   - Border: border-primary
 *   - Shadow: shadow-md
 *   - Scale: transform scale-105 (slight enlargement)
 *   - Z-index: z-10 (above siblings)
 *   - Icon: FolderOpen
 * - **Inactive State**:
 *   - Background: bg-card
 *   - Text: text-muted-foreground
 *   - Border: border-border
 *   - Shadow: shadow-sm
 *   - Hover: bg-muted, shadow-md
 *   - Icon: Folder
 *
 * **Interactions**:
 * - **Click**: Switches to workspace (switchWorkspace)
 * - **Double-click**: Enters rename mode
 * - **Hover**: Shows close button (opacity transition)
 * - **Close button click**: Removes workspace (requires >1 workspace)
 *
 * **Inline Renaming**:
 * - **Trigger**: Double-click workspace tab
 * - **UI**: Replaces name with inline input
 *   - Border-bottom style (border-primary/50)
 *   - Background: transparent
 *   - Auto-focus and auto-select text
 * - **Save**: Blur, Enter key, or direct save call
 * - **Cancel**: Escape key
 * - **Validation**: Trims whitespace, rejects empty names
 *
 * **Close Button**:
 * - **Visibility**:
 *   - Active tab: Always visible (opacity-100)
 *   - Inactive tabs: Hover only (group-hover:opacity-100)
 * - **Disabled when**:
 *   - Editing mode active
 *   - Only 1 workspace remains (prevents deleting last workspace)
 * - **Styling**:
 *   - Active: hover:bg-primary-foreground/20
 *   - Inactive: hover:bg-destructive/10 hover:text-destructive
 *   - Size: w-3 h-3 icon, p-0.5 button
 *   - Rounded-lg
 *
 * **Add Workspace Button**:
 * - Position: Right of all tabs
 * - Size: 28x28 px (h-7 w-7)
 * - Icon: Plus (16x16 px)
 * - Background: bg-card with border
 * - Hover: bg-muted, border-primary/50, text-primary
 * - Tooltip: "New Workspace"
 * - Calls: addWorkspace() → Creates new workspace with default name
 *
 * **State Management**:
 * - **Zustand Store**:
 *   - `activeWorkspaceId`: ID of currently active workspace
 *   - `workspaceMeta`: Array of { id, name } for all workspaces
 *   - `switchWorkspace(id)`: Activates workspace
 *   - `addWorkspace()`: Creates new workspace
 *   - `removeWorkspace(id)`: Deletes workspace
 *   - `updateWorkspaceName(id, name)`: Renames workspace
 *
 * - **Local State**:
 *   - `editingId`: ID of workspace being renamed (or null)
 *   - `editName`: Temporary name during editing
 *   - `inputRef`: Ref for auto-focus on edit input
 *
 * **Focus Management**:
 * - useEffect hook watches editingId
 * - On edit start: focus() and select() input text
 * - Allows immediate typing without manual selection
 *
 * **Keyboard Shortcuts**:
 * - **Enter**: Saves rename and exits edit mode
 * - **Escape**: Cancels rename and exits edit mode
 * - **Tab**: Native browser tab navigation (no custom handling)
 *
 * **Animations**:
 * - Tab transitions: duration-300 (smooth state changes)
 * - Opacity transitions: duration-200 (close button reveal)
 * - Scale transform: Active tab slightly larger
 * - All transitions: ease-in-out timing
 *
 * **Scroll Behavior**:
 * - Horizontal auto-scroll for many workspaces
 * - No custom scroll logic (native overflow-x-auto)
 * - Scrollbar auto-hides on some browsers
 *
 * **Workspace Persistence**:
 * - Each workspace stores:
 *   - Visualizations array
 *   - UI state (date range, filters, etc.)
 *   - Comments
 *   - Reconciliation config
 * - Switching workspaces swaps entire state
 * - Independent undo/redo history per workspace
 *
 * @returns {JSX.Element} Horizontal workspace tab bar
 *
 * @example
 * ```tsx
 * // Rendered in TopBar
 * <WorkspaceTabs />
 * ```
 */
export const WorkspaceTabs: React.FC = () => {
    const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
    const workspaceMeta = useStore((state) => state.workspaceMeta);
    const switchWorkspace = useStore((state) => state.switchWorkspace);
    const addWorkspace = useStore((state) => state.addWorkspace);
    const removeWorkspace = useStore((state) => state.removeWorkspace);
    const updateWorkspaceName = useStore((state) => state.updateWorkspaceName);
    const currentTemplateName = useStore((state) => state.currentTemplateName);
    const setCurrentTemplateName = useStore((state) => state.setCurrentTemplateName);
    const setPlantName = useStore((state) => state.setPlantName);
    const setNotification = useStore((state) => state.setNotification);
    const setError = useStore((state) => state.setError);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Rename Dialog State
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [existingTemplateNames, setExistingTemplateNames] = useState<string[]>([]);
    const [isRenaming, setIsRenaming] = useState(false);

    const fetchExistingNames = async () => {
        try {
            const templates = await templateApi.listSaved();
            setExistingTemplateNames(templates.map(t => t.name));
        } catch { /* ignore */ }
    };

    const renameNameDuplicate = renameValue.trim() !== currentTemplateName && existingTemplateNames.includes(renameValue.trim());

    useEffect(() => {
        if (editingId && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingId]);

    const handleStartEdit = (id: string, currentName: string) => {
        setEditingId(id);
        setEditName(currentName);
    };

    const handleSaveEdit = () => {
        if (editingId && editName.trim()) {
            updateWorkspaceName(editingId, editName.trim());
            // Keep plantName in sync when renaming the active workspace
            if (editingId === activeWorkspaceId) {
                setPlantName(editName.trim());
            }
        }
        setEditingId(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSaveEdit();
        if (e.key === 'Escape') setEditingId(null);
    };

    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const checkScroll = () => {
        if (scrollContainerRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
            setShowLeftArrow(scrollLeft > 0);
            // Use a small threshold (1px) for float calculation inaccuracies
            setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
        }
    };

    useEffect(() => {
        checkScroll();
        window.addEventListener('resize', checkScroll);
        return () => window.removeEventListener('resize', checkScroll);
    }, [workspaceMeta]);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const scrollAmount = 200;
            const newScrollLeft = direction === 'left'
                ? scrollContainerRef.current.scrollLeft - scrollAmount
                : scrollContainerRef.current.scrollLeft + scrollAmount;

            scrollContainerRef.current.scrollTo({
                left: newScrollLeft,
                behavior: 'smooth'
            });
        }
    };

    return (
        <div className="flex items-center gap-2 max-w-full">
            {/* Tabs Container with Arrows */}
            <div className="relative flex-1 flex items-center min-w-0 group/tabs">
                {/* Left Arrow */}
                {showLeftArrow && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            scroll('left');
                        }}
                        className="absolute left-0 z-20 p-1 rounded-lg bg-card border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                )}

                {/* Scroll Container */}
                <div
                    ref={scrollContainerRef}
                    onScroll={checkScroll}
                    className="flex items-center overflow-x-auto min-h-[40px] px-1 pb-1 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                >
                    <div className="flex items-center gap-2 px-1">
                        {workspaceMeta.map((workspace) => {
                            const isActive = workspace.id === activeWorkspaceId;
                            const isEditing = workspace.id === editingId;

                            return (
                                <div
                                    key={workspace.id}
                                    role="button"
                                    onClick={() => !isEditing && switchWorkspace(workspace.id)}
                                    onDoubleClick={() => !isEditing && handleStartEdit(workspace.id, workspace.name)}
                                    className={cn(
                                        "group relative flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors duration-150 cursor-pointer min-w-[100px] max-w-[180px] rounded-lg border shrink-0",
                                        isActive
                                            ? "bg-accent text-foreground border-border"
                                            : "bg-transparent text-muted-foreground border-transparent hover:bg-accent hover:text-foreground"
                                    )}
                                >
                                    {/* Icon */}
                                    <div className={cn("shrink-0 transition-colors", isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>
                                        {isActive ? <FolderOpen className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5" />}
                                    </div>

                                    {/* Content */}
                                    {isEditing ? (
                                        <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                ref={inputRef}
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                onBlur={handleSaveEdit}
                                                onKeyDown={handleKeyDown}
                                                className="w-full bg-transparent border-b border-primary/50 text-inherit px-0.5 py-0 text-xs outline-none focus:border-primary"
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex-1 min-w-0 truncate text-xs pb-[1px]">
                                            {workspace.name}
                                        </div>
                                    )}

                                    {/* Pencil Icon for renaming (Active only) */}
                                    {isActive && !isEditing && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setRenameValue(workspace.name);
                                                fetchExistingNames();
                                                setRenameDialogOpen(true);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded-sm"
                                            title="Rename Template & Workspace"
                                        >
                                            <Pencil className="w-3 h-3 text-muted-foreground" />
                                        </button>
                                    )}

                                    {/* Controls (Close) */}
                                    <div className={cn(
                                        "ml-auto flex items-center gap-1 transition-opacity duration-150",
                                        isActive ? "opacity-60 group-hover:opacity-100" : "opacity-0 group-hover:opacity-100"
                                    )}>
                                        {!isEditing && workspaceMeta.length > 1 && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeWorkspace(workspace.id);
                                                }}
                                                className="p-0.5 rounded transition-colors flex items-center justify-center text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                                                title="Close Workspace"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right Arrow */}
                {showRightArrow && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            scroll('right');
                        }}
                        className="absolute right-0 z-20 p-1 rounded-lg bg-card border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Add Button - Outside scroll container */}
            <button
                onClick={addWorkspace}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-150 shrink-0"
                title="New Workspace"
            >
                <Plus className="w-4 h-4" />
            </button>

            {/* Rename Template Dialog */}
            <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Rename Template</DialogTitle>
                        <DialogDescription>
                            This will rename the template file, workspace, and current session.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={async (e) => {
                        e.preventDefault();
                        if (!renameValue.trim() || renameNameDuplicate) return;
                        setIsRenaming(true);
                        try {
                            if (currentTemplateName) {
                                await templateApi.renameSaved(currentTemplateName, renameValue.trim());
                                setCurrentTemplateName(renameValue.trim());
                            }

                            setPlantName(renameValue.trim());
                            updateWorkspaceName(activeWorkspaceId, renameValue.trim());
                            setRenameDialogOpen(false);
                            setNotification(currentTemplateName
                                ? `Template renamed to "${renameValue.trim()}"`
                                : `Workspace renamed to "${renameValue.trim()}"`
                            );
                        } catch (err: any) {
                            setError(err.message || 'Failed to rename template');
                        } finally {
                            setIsRenaming(false);
                        }
                    }} className="space-y-4 py-2">
                        <div className="space-y-1">
                            <Label htmlFor="rename-template-name">New Name</Label>
                            <Input
                                id="rename-template-name"
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                            />
                            {renameNameDuplicate && (
                                <p className="text-xs text-destructive">A template with this name already exists.</p>
                            )}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" variant="primary" icon={<Save className="w-4 h-4" />} disabled={isRenaming || !renameValue.trim() || renameNameDuplicate}>Rename</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div >
    );
};
