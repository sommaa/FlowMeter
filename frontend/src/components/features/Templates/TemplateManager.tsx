/**
 * Template Manager for saving, loading, and organizing visualization templates.
 *
 * This component provides a comprehensive template management system that allows users to:
 * - Save current dashboard configuration as reusable templates
 * - Load templates to quickly restore complex setups
 * - Upload/download templates as JSON files for sharing
 * - Rename and delete saved templates
 * - Check template compatibility with current dataset
 *
 * Templates store the complete application state including:
 * - All visualization configurations (charts, settings, formulas)
 * - Reconciliation configuration (equations, sigma values)
 * - Global variables and column descriptions
 * - AI guidance text and storyline events
 * - Comments and plant name metadata
 *
 * Features:
 * - Persistent server-side storage in `data/templates/` directory
 * - Compatibility checking (highlights templates matching current dataset)
 * - Smart sorting (compatible templates shown first)
 * - Inline renaming with keyboard shortcuts (Enter/Escape)
 * - Confirmation dialogs for destructive actions
 * - File upload/download for template portability
 * - Real-time file size and modification date display
 *
 * The modal has a two-pane layout:
 * - Left sidebar: Save/upload actions and storage info
 * - Right main area: Template list with search, sort, and actions
 *
 * @module components/features/Templates/TemplateManager
 */

import React, { useState, useEffect } from 'react';
import {
    Save,
    FileText,
    Trash2,
    RefreshCw,
    AlertCircle,
    FileDown,
    ArrowRight,
    Pencil,
    Check,
    X,
    Upload
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SavedTemplate } from '@/types';
import { templateApi } from '@/services/api';
import { useStore } from '@/store';
import { Button } from '@/components/common';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog";
import { ConfirmationModal } from '@/components/common/ConfirmationModal';

/**
 * Template Manager component.
 *
 * Renders a modal for managing visualization templates with full CRUD operations:
 *
 * **Layout**:
 * - **Left Sidebar** (fixed width, muted background):
 *   - "Save Current Config" button (primary)
 *   - "Upload Template" button with hidden file input overlay
 *   - Storage location info at bottom
 *
 * - **Right Main Area** (scrollable):
 *   - Error banner (if any operation fails)
 *   - Loading state (spinner during initial load)
 *   - Empty state (if no templates saved)
 *   - Template cards grid (sorted by compatibility)
 *
 * **Template Card**:
 * - **Header Row**:
 *   - Template name (editable inline if in rename mode)
 *   - Compatibility badge:
 *     - "Recommended" (primary) if ≥90% of required variables present
 *     - "{N}% Match" (amber) if ≥50% present
 *     - "Incompatible" (gray) if <50% present
 *
 * - **Metadata Row**:
 *   - File size in KB (size_bytes / 1024)
 *   - Last modified date and time
 *   - Missing variables list (if incompatible, truncated at 200px)
 *
 * - **Action Buttons** (show on hover on desktop, always visible on mobile):
 *   - Apply (ArrowRight icon, primary color) → Loads template
 *   - Rename (Pencil icon) → Enters inline edit mode
 *   - Download (FileDown icon) → Exports as JSON
 *   - Delete (Trash2 icon, destructive color) → Removes template
 *
 * **Inline Renaming**:
 * - Click Rename button → Input replaces name display
 * - Enter: Submits rename
 * - Escape: Cancels edit
 * - Check/X buttons for touch devices
 * - Auto-focus on input field
 *
 * **Compatibility Checking**:
 * - Each template has `required_variables` array (column names)
 * - Compares with `currentDataset.column_names`
 * - Missing variables shown in tooltip and metadata row
 * - Templates sorted: compatible first, then by missing count ascending
 *
 * **Save Template Flow**:
 * 1. Click "Save Current Config" → Opens save dialog
 * 2. Enter template name
 * 3. Submit → Calls `templateApi.savePersistent(name, config, false)`
 * 4. If name exists → Shows overwrite confirmation
 * 5. On confirm → Calls with `overwrite=true`
 * 6. Success → Reloads template list, shows notification
 *
 * **Load Template Flow**:
 * 1. Click Apply button → Shows confirmation dialog
 * 2. User confirms → Calls `templateApi.loadSaved(name)`
 * 3. Normalizes keys (handles legacy camelCase vs snake_case)
 * 4. Calls `loadTemplate()` with all config sections
 * 5. Success → Closes modal, shows notification
 *
 * **Upload Template**:
 * - Hidden file input with visible button overlay
 * - Accepts `.json` files only
 * - Parses JSON, normalizes keys
 * - Saves to server with filename as template name
 * - Auto-overwrites if name conflicts
 * - Clears input value after upload (allows re-upload same file)
 *
 * **Download Template**:
 * - Fetches template JSON from server
 * - Creates Blob with `application/json` MIME type
 * - Triggers browser download via temporary anchor element
 * - Filename: `{template_name}.json`
 * - Cleanup: Revokes object URL after download
 *
 * **Delete Template**:
 * - Shows danger-variant confirmation modal
 * - On confirm → Calls `templateApi.deleteSaved(name)`
 * - Success → Reloads list, shows notification
 * - Action cannot be undone (permanent deletion)
 *
 * **Rename Template**:
 * - Inline editing mode with input replacement
 * - Submit → Calls `templateApi.renameSaved(oldName, newName)`
 * - Empty or unchanged names cancel edit
 * - Error handling for duplicate names
 *
 * **State Management**:
 * - **Zustand Store**:
 *   - `isTemplateManagerOpen`: Modal visibility
 *   - `currentDataset`: For compatibility checks
 *   - `getTemplate()`: Serializes current config
 *   - `loadTemplate()`: Deserializes and applies config
 *   - `setNotification()`: Shows success/error toasts
 *
 * - **Local State**:
 *   - `templates`: Array of SavedTemplate from server
 *   - `loading`: Initial load spinner state
 *   - `error`: Error message display
 *   - `saveDialogOpen`: Save dialog visibility
 *   - `saveName`: Template name input value
 *   - `renamingId`: ID of template being renamed (or null)
 *   - `renameValue`: Rename input field value
 *   - `uploading`: Upload in progress state
 *   - `confirmationState`: Confirmation modal config (type, data, isOpen)
 *
 * **Confirmation Types**:
 * - `delete`: Destructive, shows "Delete Template" title
 * - `load`: Primary, shows "Load Template" title
 * - `overwrite`: Destructive, shows "Overwrite Template" title
 *
 * **Legacy Compatibility**:
 * - Handles both `snake_case` and `camelCase` keys
 * - Normalizes on load:
 *   - `plant_name || plantName`
 *   - `reconciliation_config || reconciliationConfig`
 * - Ensures version and created fields exist
 *
 * **Empty State**:
 * - Centered FileText icon (opacity 20%)
 * - "No saved templates found." message
 * - Hint: "Save your current configuration or upload a file."
 *
 * **Loading State**:
 * - Centered spinner (RefreshCw with animate-spin)
 * - "Loading templates..." message
 *
 * **Error Display**:
 * - Red-bordered banner at top of main area
 * - AlertCircle icon
 * - Error message from caught exceptions
 * - Persists until next successful operation
 *
 * **Storage Info**:
 * - Located at bottom of sidebar
 * - Shows storage location: `data/templates/`
 * - Styled as code block for clarity
 *
 * @returns {JSX.Element} Template manager modal with nested dialogs
 *
 * @example
 * ```tsx
 * // Triggered from TopBar or sidebar
 * <TemplateManager />
 * ```
 */
export const TemplateManager: React.FC = () => {
    const isTemplateManagerOpen = useStore((state) => state.isTemplateManagerOpen);
    const toggleTemplateManager = useStore((state) => state.toggleTemplateManager);
    const setTemplateManagerOpen = useStore((state) => state.setTemplateManagerOpen);
    const getTemplate = useStore((state) => state.getTemplate);
    const loadTemplate = useStore((state) => state.loadTemplate);
    const setNotification = useStore((state) => state.setNotification);
    const setCurrentTemplateName = useStore((state) => state.setCurrentTemplateName);
    const currentDataset = useStore((state) => state.currentDataset);
    const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
    const updateWorkspaceName = useStore((state) => state.updateWorkspaceName);
    const setPlantName = useStore((state) => state.setPlantName);

    const [templates, setTemplates] = useState<SavedTemplate[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Save Dialog State
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [saveName, setSaveName] = useState('');

    // Renaming State
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

    // Uploading State
    const [uploading, setUploading] = useState(false);

    // Confirmation States
    const [confirmationState, setConfirmationState] = useState<{
        type: 'delete' | 'load' | 'overwrite';
        data?: any;
        isOpen: boolean;
    }>({ type: 'delete', isOpen: false });

    // Load templates when modal opens or dataset changes
    useEffect(() => {
        if (isTemplateManagerOpen) {
            loadTemplates();
        }
    }, [isTemplateManagerOpen, currentDataset?.id]);

    const loadTemplates = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await templateApi.listSaved();
            setTemplates(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load templates');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const currentConfig = getTemplate();
        try {
            await templateApi.savePersistent(saveName, currentConfig, false);
            setSaveDialogOpen(false);

            const newName = saveName;
            setSaveName('');
            loadTemplates();

            setCurrentTemplateName(newName);
            setPlantName(newName);
            updateWorkspaceName(activeWorkspaceId, newName);

            setNotification(`Template "${newName}" saved successfully`);
        } catch (err: any) {
            if (err.message && (err.message.includes('409') || err.message.includes('already exists'))) {
                setConfirmationState({
                    type: 'overwrite',
                    isOpen: true,
                    data: { name: saveName, config: currentConfig }
                });
            } else {
                setError(err.message || 'Failed to save template');
            }
        }
    };

    const confirmOverwrite = async () => {
        if (confirmationState.type !== 'overwrite' || !confirmationState.data) return;
        try {
            await templateApi.savePersistent(confirmationState.data.name, confirmationState.data.config, true);
            setSaveDialogOpen(false);

            const newName = confirmationState.data.name;
            setSaveName('');
            loadTemplates();

            setCurrentTemplateName(newName);
            setPlantName(newName);
            updateWorkspaceName(activeWorkspaceId, newName);

            setNotification(`Template "${newName}" updated successfully`);
        } catch (retryErr: any) {
            setError(retryErr.message || 'Failed to overwrite template');
        }
    };

    const requestLoad = (name: string) => {
        if (!currentDataset) {
            setError("Please upload a dataset before loading a template.");
            return;
        }
        setConfirmationState({
            type: 'load',
            isOpen: true,
            data: { name }
        });
    };

    const confirmLoad = async () => {
        if (confirmationState.type !== 'load' || !confirmationState.data) return;
        const name = confirmationState.data.name;

        setLoading(true);
        try {
            const rawTemplate = await templateApi.loadSaved(name) as any;

            // Normalize keys (handle legacy camelCase vs snake_case)
            const template: any = {
                ...rawTemplate,
                plant_name: rawTemplate.plant_name || rawTemplate.plantName,
                reconciliation_config: rawTemplate.reconciliation_config || rawTemplate.reconciliationConfig,
                visualizations: rawTemplate.visualizations || [],
                comments: rawTemplate.comments,
                global_variables: rawTemplate.global_variables || [],
            };

            await loadTemplate(
                template.visualizations,
                template.plant_name,
                template.comments,
                template.reconciliation_config,
                template.global_variables,
                template.column_descriptions,
                template.ai_guidance_text,
                template.storyline_events,
                name
            );
            setTemplateManagerOpen(false);
            setNotification(`Template "${name}" loaded successfully`);
        } catch (err: any) {
            setError(err.message || 'Failed to load template');
        } finally {
            setLoading(false);
        }
    };

    const requestDelete = (name: string) => {
        setConfirmationState({
            type: 'delete',
            isOpen: true,
            data: { name }
        });
    };

    const confirmDelete = async () => {
        if (confirmationState.type !== 'delete' || !confirmationState.data) return;
        const name = confirmationState.data.name;
        try {
            await templateApi.deleteSaved(name);
            loadTemplates();
            setNotification(`Template "${name}" deleted`);
        } catch (err: any) {
            setError(err.message || 'Failed to delete template');
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploading(true);

        try {
            const rawTemplate = await templateApi.load(file) as any;
            const name = file.name.replace('.json', '');

            const template: any = {
                ...rawTemplate,
                plant_name: rawTemplate.plant_name || rawTemplate.plantName,
                reconciliation_config: rawTemplate.reconciliation_config || rawTemplate.reconciliationConfig,
                version: rawTemplate.version || "1.0",
                created: rawTemplate.created || new Date().toISOString(),
                visualizations: rawTemplate.visualizations || [],
            };

            await templateApi.savePersistent(name, template, true);
            loadTemplates();
            setNotification(`Template imported as "${name}"`);
        } catch (err: any) {
            setError(err.message || 'Failed to upload template');
        } finally {
            setUploading(false);
            event.target.value = '';
        }
    };

    const handleDownload = async (name: string) => {
        try {
            const template = await templateApi.loadSaved(name);
            const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setNotification(`Template "${name}" downloaded`);
        } catch (err: any) {
            setError(err.message || 'Failed to download template');
        }
    };

    const startRename = (template: SavedTemplate) => {
        setRenamingId(template.name);
        setRenameValue(template.name);
    };

    const submitRename = async () => {
        if (!renamingId || !renameValue.trim() || renamingId === renameValue) {
            setRenamingId(null);
            return;
        }
        try {
            await templateApi.renameSaved(renamingId, renameValue);
            loadTemplates();
            setRenamingId(null);
            setNotification(`Renamed template to "${renameValue}"`);
        } catch (err: any) {
            setError(err.message || 'Failed to rename template');
        }
    };

    return (
        <>
            <Dialog open={isTemplateManagerOpen} onOpenChange={(open) => !open && setTemplateManagerOpen(false)}>
                <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
                    <DialogHeader className="px-6 py-4 border-b shrink-0 bg-muted/20">
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-primary" />
                            Template Manager
                        </DialogTitle>
                        <DialogDescription>
                            Save current configurations or load existing templates.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                        {/* Sidebar */}
                        <div className="w-full md:w-64 bg-muted/30 border-b md:border-b-0 md:border-r border-border p-4 flex flex-col gap-4 shrink-0">
                            <Button
                                variant="primary"
                                className="w-full justify-center"
                                icon={<Save className="w-4 h-4" />}
                                onClick={() => setSaveDialogOpen(true)}
                            >
                                Save Current Config
                            </Button>

                            <div className="relative">
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileUpload}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    disabled={uploading}
                                />
                                <Button
                                    variant="secondary"
                                    className="w-full justify-center"
                                    icon={uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    disabled={uploading}
                                >
                                    {uploading ? 'Uploading...' : 'Upload Template'}
                                </Button>
                            </div>

                            <div className="mt-auto pt-4 border-t border-border">
                                <div className="text-xs text-muted-foreground">
                                    Storage Location:<br />
                                    <code className="bg-muted px-1 rounded">data/templates/</code>
                                </div>
                            </div>
                        </div>

                        {/* Main List */}
                        <div className="flex-1 p-4 overflow-y-auto bg-background">
                            {error && (
                                <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg flex items-center gap-2 border border-destructive/20">
                                    <AlertCircle className="w-4 h-4" />
                                    {error}
                                </div>
                            )}

                            {loading && !templates.length ? (
                                <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
                                    <RefreshCw className="w-5 h-5 animate-spin" />
                                    Loading templates...
                                </div>
                            ) : templates.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                                    <FileText className="w-12 h-12 opacity-20" />
                                    <p>No saved templates found.</p>
                                    <p className="text-xs">Save your current configuration or upload a file.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3">
                                    {/* Sort templates: best match first */}
                                    {[...templates].sort((a, b) => {
                                        if (!currentDataset) return 0;
                                        const cols = currentDataset.column_names || [];

                                        const getMatchScore = (t: SavedTemplate) => {
                                            const reqVars = t.required_variables || [];
                                            if (reqVars.length === 0) return -1; // No info → sort last
                                            const matched = reqVars.filter(v => cols.includes(v)).length;
                                            return matched / reqVars.length; // 0..1 ratio
                                        };

                                        return getMatchScore(b) - getMatchScore(a);
                                    }).map((tpl) => {
                                        // Compatibility Check with threshold
                                        const reqVars = tpl.required_variables || [];
                                        const missingVars = currentDataset
                                            ? reqVars.filter(v => !currentDataset.column_names.includes(v))
                                            : [];
                                        const matchRatio = reqVars.length > 0
                                            ? (reqVars.length - missingVars.length) / reqVars.length
                                            : 0;
                                        // Recommended if ≥90% of required variables present (and has requirements)
                                        const isCompatible = reqVars.length > 0 && matchRatio >= 0.9;

                                        return (
                                            <div
                                                key={tpl.name}
                                                className={cn(
                                                    "flex items-center justify-between p-3 rounded-lg border transition-all group bg-card/50 hover:bg-card hover:border-primary/50",
                                                    isCompatible && "border-primary/30"
                                                )}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        {renamingId === tpl.name ? (
                                                            <div className="flex items-center gap-2 mr-2">
                                                                <Input
                                                                    value={renameValue}
                                                                    onChange={(e) => setRenameValue(e.target.value)}
                                                                    className="h-8 text-sm"
                                                                    autoFocus
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') submitRename();
                                                                        if (e.key === 'Escape') setRenamingId(null);
                                                                    }}
                                                                />
                                                                <button onClick={submitRename} className="p-1 text-primary hover:bg-primary/10 rounded">
                                                                    <Check className="w-4 h-4" />
                                                                </button>
                                                                <button onClick={() => setRenamingId(null)} className="p-1 text-muted-foreground hover:bg-muted rounded">
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <h4 className="font-medium text-foreground truncate" title={tpl.name}>
                                                                {tpl.name}
                                                            </h4>
                                                        )}

                                                        {/* Compatibility Badges */}
                                                        {currentDataset && reqVars.length > 0 && (
                                                            isCompatible ? (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/15 text-primary">
                                                                    Recommended {missingVars.length > 0 && `(${Math.round(matchRatio * 100)}%)`}
                                                                </span>
                                                            ) : matchRatio >= 0.5 ? (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400" title={`Missing: ${missingVars.join(', ')}`}>
                                                                    {Math.round(matchRatio * 100)}% Match
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground" title={`Missing: ${missingVars.join(', ')}`}>
                                                                    Incompatible
                                                                </span>
                                                            )
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                        <span>{(tpl.size_bytes / 1024).toFixed(1)} KB</span>
                                                        <span>•</span>
                                                        <span>{new Date(tpl.last_modified).toLocaleDateString()} {new Date(tpl.last_modified).toLocaleTimeString()}</span>
                                                        {missingVars.length > 0 && (
                                                            <span className="text-destructive truncate max-w-[200px]" title={missingVars.join(', ')}>
                                                                Missing: {missingVars.join(', ')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => requestLoad(tpl.name)}
                                                        disabled={!currentDataset}
                                                        className={cn(
                                                            "h-8 w-8 p-0 hover:bg-primary/10",
                                                            !currentDataset ? "text-muted-foreground opacity-50 cursor-not-allowed" : "text-primary hover:text-primary"
                                                        )}
                                                        title={currentDataset ? "Apply Template" : "Dataset required"}
                                                    >
                                                        <ArrowRight className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => startRename(tpl)}
                                                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                                        title="Rename"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDownload(tpl.name)}
                                                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                                        title="Download JSON"
                                                    >
                                                        <FileDown className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => requestDelete(tpl.name)}
                                                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter className="p-4 border-t shrink-0 bg-muted/20">
                        <Button variant="ghost" onClick={toggleTemplateManager}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Save Dialog */}
            <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Save Template</DialogTitle>
                        <DialogDescription>
                            Enter a name for your template.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSaveSubmit} className="space-y-4 py-2">
                        <div className="space-y-1">
                            <Label htmlFor="template-name">Template Name</Label>
                            <Input
                                id="template-name"
                                autoFocus
                                value={saveName}
                                onChange={(e) => setSaveName(e.target.value)}
                                placeholder="My Template"
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" variant="primary" icon={<Save className="w-4 h-4" />}>Save</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Confirmation Dialogs */}
            <ConfirmationModal
                isOpen={confirmationState.isOpen}
                onClose={() => setConfirmationState(prev => ({ ...prev, isOpen: false }))}
                onConfirm={() => {
                    if (confirmationState.type === 'delete') confirmDelete();
                    if (confirmationState.type === 'load') confirmLoad();
                    if (confirmationState.type === 'overwrite') confirmOverwrite();
                }}
                title={
                    confirmationState.type === 'delete' ? 'Delete Template' :
                        confirmationState.type === 'load' ? 'Load Template' :
                            'Overwrite Template'
                }
                message={
                    confirmationState.type === 'delete' ? `Are you sure you want to delete "${confirmationState.data?.name}"? This cannot be undone.` :
                        confirmationState.type === 'load' ? `Load template "${confirmationState.data?.name}"? Unsaved changes will be lost.` :
                            `Template "${confirmationState.data?.name}" already exists. Do you want to overwrite it?`
                }
                variant={confirmationState.type === 'delete' || confirmationState.type === 'overwrite' ? 'danger' : 'primary'}
                confirmLabel={
                    confirmationState.type === 'delete' ? 'Delete' :
                        confirmationState.type === 'load' ? 'Load' :
                            'Overwrite'
                }
            />
        </>
    );
};
