/**
 * TopBar component providing primary navigation and global controls.
 *
 * This fixed-position header spans the full width of the application and provides:
 * - Logo and sidebar toggle controls
 * - Add Visualization button
 * - Storyline event management with visibility toggle
 * - Workspace tabs (center-aligned)
 * - Template manager access
 * - Global date range filter
 * - Notification center
 * - Settings menu
 *
 * The TopBar dynamically adjusts its left section width to match the sidebar,
 * creating a cohesive visual alignment. It provides context-aware controls that
 * appear/disappear based on dataset availability.
 *
 * Layout Structure:
 * - **Left**: Logo section (matches sidebar width)
 * - **Center**: Workspace tabs (absolute positioned)
 * - **Right**: Templates, date picker, notifications, settings
 *
 * @module components/layout/TopBar
 */

import React, { useState } from 'react';
import { Plus, BookOpen, LayoutTemplate, ChevronLeft, Save } from 'lucide-react';
import { useStore } from '@/store';
import { Button, SettingsMenu, Logo } from '@/components/common';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { NotificationCenter } from '@/components/layout/NotificationCenter';
import { WorkspaceTabs } from '@/components/layout/WorkspaceTabs';
import { templateApi } from '@/services/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmationModal } from '@/components/common/ConfirmationModal';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

/**
 * Storyline button with integrated toggle switch.
 *
 * This internal component combines two controls:
 * - Left button: Opens StorylineModal to manage events
 * - Right toggle: Shows/hides event markers on visualizations
 *
 * The toggle provides instant visual feedback without opening the modal,
 * allowing users to quickly hide markers during analysis if needed.
 *
 * **Structure**:
 * - Muted background with border, rounded-full
 * - Two sections separated by vertical divider:
 *   - **Button**: BookOpen icon + "Storyline" label
 *   - **Toggle**: Animated switch (primary when on, muted when off)
 * - Toggle switch:
 *   - Background changes color (primary vs. muted)
 *   - White dot slides left/right (transform translateX)
 *   - Tooltip on hover explains state
 *
 * @returns {JSX.Element} Combined storyline button with toggle
 */
const StorylineButtonWithToggle: React.FC = () => {
    const setStorylineOpen = useStore((state) => state.setStorylineOpen);
    const isStorylineEnabled = useStore((state) => state.isStorylineEnabled);
    const setStorylineEnabled = useStore((state) => state.setStorylineEnabled);

    return (
        <div className="flex items-center h-8 rounded-lg bg-secondary text-secondary-foreground overflow-hidden border border-border transition-colors">
            {/* Button part - opens modal */}
            <button
                onClick={() => setStorylineOpen(true)}
                className="flex items-center gap-1.5 px-3 h-full hover:bg-accent transition-colors text-xs font-medium"
            >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Storyline</span>
            </button>

            {/* Divider */}
            <div className="w-px h-4 bg-border" />

            {/* Toggle switch */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setStorylineEnabled(!isStorylineEnabled);
                }}
                className="px-2 h-full flex items-center hover:bg-accent transition-colors"
                title={isStorylineEnabled ? "Hide events on charts" : "Show events on charts"}
            >
                <div className={`relative w-7 h-3.5 rounded-full transition-colors ${isStorylineEnabled ? 'bg-primary' : 'bg-foreground/20'}`}>
                    <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full shadow-sm transition-transform ${isStorylineEnabled ? 'bg-primary-foreground translate-x-3.5' : 'bg-card translate-x-0.5'}`} />
                </div>
            </button>
        </div>
    );
};

/**
 * Props for the TopBar component.
 *
 * @interface TopBarProps
 * @property {() => void} onAddVisualization - Callback to create new visualization
 * @property {number} sidebarWidth - Current sidebar width in pixels (for alignment)
 * @property {boolean} isSidebarExpanded - Whether sidebar is expanded or collapsed
 * @property {() => void} onToggleSidebar - Callback to toggle sidebar expansion
 */
interface TopBarProps {
    onAddVisualization: () => void;
    sidebarWidth: number;
    isSidebarExpanded: boolean;
    onToggleSidebar: () => void;
}

/**
 * TopBar component.
 *
 * Renders a fixed header with three main sections:
 *
 * **Container**:
 * - Fixed position (top-0 left-0 right-0)
 * - Height: 64px (h-16)
 * - Z-index: 30 (below modals, above main content)
 * - Background: bg-card with border-bottom
 * - Flex row layout with centered items
 *
 * **Logo Section** (Left):
 * - Width: Matches sidebarWidth prop (synced with sidebar)
 * - Transition: width changes smoothly with sidebar (duration-300 ease-in-out)
 * - Border-right separator
 * - **Collapsed State**:
 *   - Centered logo (-rotate-90 for visual effect)
 *   - Click logo → Opens sidebar
 * - **Expanded State**:
 *   - Left-aligned logo + "FlowMeter" wordmark
 *   - Logo in default rotation (rotate-0)
 *   - "Flow" in primary color, "Meter" in foreground
 *   - ChevronLeft button on right → Collapses sidebar
 * - Logo transitions: rotate and fade (duration-300)
 *
 * **Main Content Area** (Center):
 * - Flex-1 (takes remaining width)
 * - Padding: px-4
 * - Three subsections:
 *
 *   1. **Left Section** (Add Visualization & Storyline):
 *      - Only visible if currentDataset exists
 *      - **Add Visualization Button**:
 *        - Primary variant, rounded-full
 *        - Plus icon with label
 *        - Height: 36px (h-9)
 *        - Calls onAddVisualization callback
 *      - **StorylineButtonWithToggle**:
 *        - Combined button + toggle
 *        - Opens StorylineModal
 *        - Toggle shows/hides event markers
 *
 *   2. **Center Section** (Workspaces):
 *      - Absolute positioned at center (left-1/2 -translate-x-1/2)
 *      - WorkspaceTabs component
 *      - Allows switching between multiple workspaces
 *      - Center alignment ensures visual balance
 *
 *   3. **Right Section** (Templates, Date, Settings):
 *      - **Templates Button**:
 *        - Secondary variant, rounded-full
 *        - LayoutTemplate icon + label
 *        - Opens Template Manager modal
 *      - **DateRangePicker**:
 *        - Global date filter for all visualizations
 *        - Popover-based picker
 *      - **Divider**: Vertical line separator (w-px h-4 bg-border)
 *      - **NotificationCenter**:
 *        - Bell icon with unread count badge
 *        - Popover showing recent notifications
 *      - **SettingsMenu**:
 *        - Gear icon dropdown
 *        - Theme, workspace, export settings
 *
 * **Responsive Behavior**:
 * - Logo section width syncs with sidebar
 * - Main content area flexes to fill remaining space
 * - Center workspace tabs always centered regardless of sidebar state
 * - Right controls remain right-aligned
 *
 * **Conditional Rendering**:
 * - Add Visualization + Storyline only show if dataset loaded
 * - All other controls always visible
 * - ChevronLeft collapse button only in expanded state
 *
 * **State Management**:
 * - **Zustand Store**:
 *   - `currentDataset`: Controls visibility of dataset-dependent buttons
 *   - `toggleTemplateManager()`: Opens template manager
 * - **Props**: Sidebar state managed by parent (App component)
 *
 * **Styling**:
 * - All buttons use rounded-full for consistent pill shape
 * - Height: h-9 (36px) for uniform button sizes
 * - Gap-2 spacing between elements
 * - Transition-all for smooth state changes
 *
 * **Interactions**:
 * - Click logo → Toggles sidebar
 * - Click ChevronLeft → Collapses sidebar
 * - Click Add Visualization → Creates new chart
 * - Click Templates → Opens template manager
 * - Storyline button → Opens modal
 * - Storyline toggle → Shows/hides markers (no modal)
 *
 * @param {TopBarProps} props - Component props
 * @returns {JSX.Element} Fixed top navigation bar
 *
 * @example
 * ```tsx
 * <TopBar
 *   onAddVisualization={() => addVisualization()}
 *   sidebarWidth={256}
 *   isSidebarExpanded={true}
 *   onToggleSidebar={() => setSidebarExpanded(!sidebarExpanded)}
 * />
 * ```
 */
export const TopBar: React.FC<TopBarProps> = ({ onAddVisualization, sidebarWidth, isSidebarExpanded, onToggleSidebar }) => {
    const currentDataset = useStore((state) => state.currentDataset);
    const toggleTemplateManager = useStore((state) => state.toggleTemplateManager);
    const visualizations = useStore((state) => state.visualizations);
    const currentTemplateName = useStore((state) => state.currentTemplateName);
    const setCurrentTemplateName = useStore((state) => state.setCurrentTemplateName);
    const getTemplate = useStore((state) => state.getTemplate);
    const setNotification = useStore((state) => state.setNotification);
    const setError = useStore((state) => state.setError);
    const plantName = useStore((state) => state.plantName);
    const setPlantName = useStore((state) => state.setPlantName);
    const updateWorkspaceName = useStore((state) => state.updateWorkspaceName);
    const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);

    const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
    const [saveTemplateName, setSaveTemplateName] = useState('');
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const [quickSaveConfirmOpen, setQuickSaveConfirmOpen] = useState(false);
    const [existingTemplateNames, setExistingTemplateNames] = useState<string[]>([]);

    const fetchExistingNames = async () => {
        try {
            const templates = await templateApi.listSaved();
            setExistingTemplateNames(templates.map(t => t.name));
        } catch { /* ignore */ }
    };

    // Duplicate name check
    const saveNameDuplicate = existingTemplateNames.includes(saveTemplateName.trim());

    return (
        <>
            <header className="fixed top-0 left-0 right-0 h-14 z-30 bg-card border-b border-border flex items-center">

                {/* Logo Section - Matches sidebar width */}
                <div
                    className={`h-full flex items-center border-r border-border shrink-0 transition-all duration-200 ease-out ${isSidebarExpanded ? 'justify-between px-4' : 'justify-center'}`}
                    style={{ width: sidebarWidth }}
                >
                    {/* Logo - clickable to open sidebar */}
                    <button
                        onClick={onToggleSidebar}
                        className="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer"
                    >
                        <div className={`transition-transform duration-200 ease-out ${isSidebarExpanded ? 'rotate-0' : '-rotate-90'}`}>
                            <Logo size={28} />
                        </div>
                        {isSidebarExpanded && (
                            <span className="text-lg font-semibold tracking-tight text-foreground">
                                <span className="text-foreground">Flow</span><span className="text-muted-foreground">Meter</span>
                            </span>
                        )}
                    </button>

                    {/* Close button when expanded */}
                    {isSidebarExpanded && (
                        <button
                            onClick={onToggleSidebar}
                            className="p-1 rounded-lg hover:bg-accent transition-colors"
                            title="Collapse sidebar"
                        >
                            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                        </button>
                    )}
                </div>

                {/* Main TopBar Content */}
                <div className="flex-1 flex items-center justify-between px-4 h-full">

                    {/* Left Section - Add Visualization & Storyline */}
                    <div className="flex items-center gap-2">
                        {currentDataset && (
                            <>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={onAddVisualization}
                                    className="h-8 px-3.5 rounded-lg text-xs font-medium active:scale-[0.98]"
                                    icon={<Plus className="w-3.5 h-3.5" />}
                                >
                                    Add Visualization
                                </Button>
                                <StorylineButtonWithToggle />
                            </>
                        )}
                    </div>

                    {/* Center Section - Workspaces */}
                    <div className="absolute left-1/2 -translate-x-1/2 max-w-[40vw]">
                        <WorkspaceTabs />
                    </div>

                    {/* Right Section - Templates, Date, Settings */}
                    <div className="flex items-center gap-2">
                        {/* Template Controls Group */}
                        <div className="flex items-center h-8 rounded-lg bg-secondary text-secondary-foreground overflow-hidden border border-border transition-colors">
                            <button
                                onClick={async () => {
                                    if (currentTemplateName) {
                                        setQuickSaveConfirmOpen(true);
                                    } else {
                                        setSaveTemplateName(plantName || '');
                                        fetchExistingNames();
                                        setSaveTemplateDialogOpen(true);
                                    }
                                }}
                                disabled={!currentDataset || visualizations.length === 0 || isSavingTemplate}
                                className="flex items-center gap-1.5 px-3 h-full hover:bg-accent transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Save className="w-3.5 h-3.5" />
                                <span>Save</span>
                            </button>

                            {/* Divider */}
                            <div className="w-px h-4 bg-border" />

                            <button
                                onClick={toggleTemplateManager}
                                className="flex items-center gap-1.5 px-3 h-full hover:bg-accent transition-colors text-xs font-medium"
                            >
                                <LayoutTemplate className="w-3.5 h-3.5" />
                                <span>Templates</span>
                            </button>
                        </div>
                        <DateRangePicker />

                        {/* Divider */}
                        <div className="w-px h-4 bg-border mx-1" />

                        <NotificationCenter />
                        <SettingsMenu />
                    </div>
                </div>
            </header>

            {/* Save Template Dialog */}
            <Dialog open={saveTemplateDialogOpen} onOpenChange={setSaveTemplateDialogOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Save New Template</DialogTitle>
                        <DialogDescription>
                            A new template file will be created.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={async (e) => {
                        e.preventDefault();
                        if (!saveTemplateName.trim() || saveNameDuplicate) return;
                        setIsSavingTemplate(true);
                        try {
                            const config = getTemplate();
                            await templateApi.savePersistent(saveTemplateName, config, false);
                            setSaveTemplateDialogOpen(false);
                            setCurrentTemplateName(saveTemplateName);
                            setPlantName(saveTemplateName);
                            updateWorkspaceName(activeWorkspaceId, saveTemplateName);
                            setNotification(`Template "${saveTemplateName}" saved successfully`);
                        } catch (err: any) {
                            if (err.message && (err.message.includes('409') || err.message.includes('already exists'))) {
                                // Refresh names list in case it was stale
                                fetchExistingNames();
                                setError('A template with this name already exists.');
                            } else {
                                setError(err.message || 'Failed to save template');
                            }
                        } finally {
                            setIsSavingTemplate(false);
                        }
                    }} className="space-y-4 py-2">
                        <div className="space-y-1">
                            <Label htmlFor="topbar-template-name">Template Name</Label>
                            <Input
                                id="topbar-template-name"
                                autoFocus
                                value={saveTemplateName}
                                onChange={(e) => setSaveTemplateName(e.target.value)}
                                placeholder="My Template"
                            />
                            {saveNameDuplicate && (
                                <p className="text-xs text-destructive">A template with this name already exists.</p>
                            )}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" onClick={() => setSaveTemplateDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" variant="primary" icon={<Save className="w-4 h-4" />} disabled={isSavingTemplate || !saveTemplateName.trim() || saveNameDuplicate}>Save</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Quick-save overwrite confirmation */}
            <ConfirmationModal
                isOpen={quickSaveConfirmOpen}
                onClose={() => setQuickSaveConfirmOpen(false)}
                onConfirm={async () => {
                    if (!currentTemplateName) return;
                    setIsSavingTemplate(true);
                    try {
                        const config = getTemplate();
                        await templateApi.savePersistent(currentTemplateName, config, true);
                        setNotification(`Template "${currentTemplateName}" saved`);
                    } catch (err: any) {
                        setError(err.message || 'Failed to save template');
                    } finally {
                        setIsSavingTemplate(false);
                    }
                }}
                title="Save Template"
                message={`This will overwrite the existing template "${currentTemplateName}". Continue?`}
                variant="primary"
                confirmLabel="Save"
            />
        </>
    );
};
