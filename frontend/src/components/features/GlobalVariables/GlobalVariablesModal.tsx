/**
 * Global Variables Modal for defining computed columns available across all visualizations.
 *
 * This modal provides an interface for creating, editing, and managing global variables—
 * computed columns defined by mathematical formulas that reference existing dataset columns.
 * Global variables are evaluated once during dataset load and become available as regular
 * columns in all visualization dropdowns, formulas, and analysis tools.
 *
 * Use Cases:
 * - Derived metrics: Efficiency = col['Output'] / col['Input'] * 100
 * - Unit conversions: Temp_F = col['Temp_C'] * 9/5 + 32
 * - Complex calculations: Energy = col['Mass'] * col['Cp'] * (col['T_out'] - col['T_in'])
 * - Normalized values: Normalized = (col['Value'] - col['Value'].mean()) / col['Value'].std()
 *
 * Features:
 * - Add/edit/delete global variables with CRUD interface
 * - Formula editor with column reference insertion
 * - Live column search and filtering
 * - Cursor-aware insertion (preserves selection position)
 * - Variable name sanitization (alphanumeric + underscore only)
 * - React Portal rendering (escapes sidebar z-index stacking)
 * - Persistent storage in Zustand store
 * - Info tooltip with usage examples
 *
 * Formulas use pandas eval() syntax with numpy functions available:
 * - Operators: +, -, *, /, **, %
 * - Functions: np.log, np.exp, np.sqrt, np.abs, etc.
 * - Column references: col['Column Name'] (exact match required)
 *
 * @module components/features/GlobalVariables/GlobalVariablesModal
 */

import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
    X,
    Plus,
    Trash2,
    Edit2,
    Variable,
    Calculator,
    Info,
    Search
} from 'lucide-react';
import { useStore } from '@/store';
import { GlobalVariable } from '@/types';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Props for the GlobalVariablesModal component.
 *
 * @interface GlobalVariablesModalProps
 * @property {boolean} isOpen - Whether the modal is currently open
 * @property {() => void} onClose - Callback when modal is closed
 */
interface GlobalVariablesModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Internal state for editing an existing global variable.
 *
 * @interface EditingState
 * @property {string} originalName - Original name for lookup in global variables array
 * @property {string} name - New name being edited
 * @property {string} formula - New formula being edited
 * @property {string} description - New description being edited
 */
interface EditingState {
    originalName: string;
    name: string;
    formula: string;
    description: string;
}

/**
 * Global Variables Modal component.
 *
 * Renders a full-screen modal using React Portal for managing global variables:
 *
 * **Portal Rendering**:
 * - Uses ReactDOM.createPortal to render directly into document.body
 * - Escapes sidebar z-index stacking context
 * - Fixed z-index of 100 (above all other UI elements)
 * - Semi-transparent black backdrop (bg-black/50)
 * - Click backdrop to close
 *
 * **Header**:
 * - Variable icon in primary-colored circle
 * - Title: "Global Variables"
 * - Description: "Define computed columns available to all plots"
 * - Close button (X icon)
 *
 * **Info Box** (blue background):
 * - Info icon
 * - Explanation of global variables
 * - Example syntax: `col['TagA'] * 2`
 * - Displayed prominently at top of content
 *
 * **Add New Form** (shown when isAdding=true):
 * - Primary-colored border and background tint
 * - Plus icon header "New Variable"
 * - Two-column grid:
 *   - **Name**: Text input (auto-focus, sanitized to alphanumeric + underscore)
 *   - **Description**: Text input (optional)
 * - **Formula** input:
 *   - Calculator icon prefix
 *   - Monospace font
 *   - Ref for cursor position tracking
 *   - Placeholder: "col['Input'] / col['Output'] * 100"
 *   - Hint: "Supported: +, -, *, /, **, np.log, np.exp, etc."
 * - **Available Columns Panel**:
 *   - Shows count: "Available columns (N):"
 *   - Search input with Search icon
 *   - Scrollable column pills (max-height: 6rem)
 *   - Click pill → Inserts `col['ColName']` at cursor
 *   - Truncated at 180px with title tooltip
 *   - Hover highlights in primary color
 *   - "No columns match" message if search empty
 * - **Footer Buttons**:
 *   - Cancel (ghost) → Resets form, closes add mode
 *   - Save Variable (primary) → Adds to store, disabled if name/formula empty
 *
 * **Edit Form** (shown when editing!=null):
 * - Same layout as Add New Form
 * - Pre-populated with existing variable data
 * - Edit2 icon header "Edit Variable"
 * - Update button instead of Save Variable
 * - Finds variable by originalName, updates at index
 *
 * **Existing Variables List**:
 * - Grid of variable cards (gap-2)
 * - Each card shows:
 *   - **Name**: Primary-colored pill, monospace, truncated
 *   - **Formula**: Muted background, monospace, truncated
 *   - **Description**: Small muted text, truncated
 *   - **Actions** (hover reveal on desktop):
 *     - Edit button (Edit2 icon)
 *     - Delete button (Trash2 icon, destructive color)
 * - Hover: Border highlights in primary, shadow appears
 * - Empty state: "No global variables defined yet..." (centered, muted)
 *
 * **Column Reference Insertion**:
 * - handleInsertColumn(col, isEdit):
 *   - Gets appropriate ref (new vs. edit)
 *   - Reads current cursor position (selectionStart/End)
 *   - Inserts `col['ColName']` at cursor
 *   - Restores focus and moves cursor to end of insertion
 *   - setTimeout(0) for DOM update timing
 *   - Falls back to append if ref not available
 *
 * **Variable Name Sanitization**:
 * - Regex: `/[^a-zA-Z0-9_]/g` → '_'
 * - Ensures valid Python identifier
 * - Applied on save (not during typing)
 *
 * **State Management**:
 * - **Zustand Store**:
 *   - `globalVariables`: Array<GlobalVariable>
 *   - `addGlobalVariable(variable)`: Adds new variable
 *   - `updateGlobalVariable(index, variable)`: Updates existing
 *   - `removeGlobalVariable(index)`: Deletes variable
 *   - `currentDataset`: For column names
 *
 * - **Local State**:
 *   - `isAdding`: Show add form
 *   - `editing`: EditingState or null
 *   - `newName`, `newFormula`, `newDescription`: Add form fields
 *   - `columnSearch`: Search filter for column selector
 *
 * **Column Name Memoization**:
 * - useMemo on currentDataset?.column_names
 * - Prevents infinite re-renders from reference changes
 * - Empty array fallback if no dataset
 *
 * **Search Filtering**:
 * - Case-insensitive column name matching
 * - Filters allColumns array
 * - Instant feedback as user types
 *
 * **Form Reset Logic**:
 * - Clears all form fields
 * - Resets column search
 * - Closes add/edit mode
 * - Called on cancel, save success
 *
 * **Footer**:
 * - Border-top separator
 * - Muted background
 * - Single "Close" button (ghost variant)
 *
 * **Responsive Design**:
 * - Max width: 2xl (672px)
 * - Max height: 85vh (prevents overflow)
 * - Padding: 1rem on mobile
 * - Two-column grid switches to single on mobile (grid-cols-1 md:grid-cols-2)
 *
 * **Accessibility**:
 * - Click backdrop to close (stopPropagation on content)
 * - Keyboard focus management
 * - Auto-focus on first input in forms
 * - Semantic button labels
 *
 * **Animation**:
 * - Add/edit forms: animate-in fade-in zoom-in-95 duration-200
 * - Smooth transitions for all interactions
 *
 * @param {GlobalVariablesModalProps} props - Component props
 * @returns {JSX.Element | null} Global variables modal or null if closed
 *
 * @example
 * ```tsx
 * <GlobalVariablesModal
 *   isOpen={showGlobalVars}
 *   onClose={() => setShowGlobalVars(false)}
 * />
 * ```
 */
export const GlobalVariablesModal: React.FC<GlobalVariablesModalProps> = ({ isOpen, onClose }) => {
    const globalVariables = useStore((state) => state.globalVariables);
    const addGlobalVariable = useStore((state) => state.addGlobalVariable);
    const updateGlobalVariable = useStore((state) => state.updateGlobalVariable);
    const removeGlobalVariable = useStore((state) => state.removeGlobalVariable);
    const currentDataset = useStore((state) => state.currentDataset);

    // Stable reference for columns to prevent infinite re-renders
    const allColumns = React.useMemo(
        () => currentDataset?.column_names ?? [],
        [currentDataset?.column_names]
    );

    const [isAdding, setIsAdding] = useState(false);
    const [editing, setEditing] = useState<EditingState | null>(null);

    // New variable state
    const [newName, setNewName] = useState('');
    const [newFormula, setNewFormula] = useState('');
    const [newDescription, setNewDescription] = useState('');

    // Column search for variable selector
    const [columnSearch, setColumnSearch] = useState('');

    // Refs for formula inputs to handle cursor position
    const newFormulaRef = useRef<HTMLInputElement>(null);
    const editFormulaRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    // Filter columns based on search
    const filteredColumns = allColumns.filter(col =>
        col.toLowerCase().includes(columnSearch.toLowerCase())
    );

    // Insert column reference at cursor position
    const handleInsertColumn = (col: string, isEdit: boolean) => {
        const inputRef = isEdit ? editFormulaRef : newFormulaRef;
        const currentValue = isEdit ? (editing?.formula || '') : newFormula;
        const setValue = isEdit
            ? (val: string) => setEditing(prev => prev ? { ...prev, formula: val } : null)
            : setNewFormula;

        const input = inputRef.current;
        if (!input) {
            setValue(currentValue + `col['${col}']`);
            return;
        }

        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        const insertion = `col['${col}']`;

        const newValue =
            currentValue.substring(0, start) +
            insertion +
            currentValue.substring(end);

        setValue(newValue);

        // Restore focus and cursor position
        setTimeout(() => {
            input.focus();
            input.setSelectionRange(start + insertion.length, start + insertion.length);
        }, 0);
    };

    const handleSaveNew = () => {
        if (!newName.trim() || !newFormula.trim()) return;

        addGlobalVariable({
            name: newName.trim().replace(/[^a-zA-Z0-9_]/g, '_'),
            formula: newFormula.trim(),
            description: newDescription.trim(),
        });

        // Reset all form state
        setNewName('');
        setNewFormula('');
        setNewDescription('');
        setColumnSearch('');
        setIsAdding(false);
    };

    const handleCancelNew = () => {
        setNewName('');
        setNewFormula('');
        setNewDescription('');
        setColumnSearch('');
        setIsAdding(false);
    };

    const handleStartEdit = (variable: GlobalVariable) => {
        // Reset search when starting edit
        setColumnSearch('');
        setEditing({
            originalName: variable.name,
            name: variable.name,
            formula: variable.formula,
            description: variable.description || '',
        });
    };

    const handleSaveEdit = () => {
        if (!editing || !editing.name.trim() || !editing.formula.trim()) return;

        const index = globalVariables.findIndex(v => v.name === editing.originalName);
        if (index === -1) return;

        updateGlobalVariable(index, {
            name: editing.name.trim().replace(/[^a-zA-Z0-9_]/g, '_'),
            formula: editing.formula.trim(),
            description: editing.description.trim(),
        });

        // Reset state
        setColumnSearch('');
        setEditing(null);
    };

    const handleCancelEdit = () => {
        setColumnSearch('');
        setEditing(null);
    };

    // Use Portal to escape parent stacking contexts (Sidebar z-index)
    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-border" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b shrink-0 bg-muted/30">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Variable className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">Global Variables</h2>
                            <p className="text-xs text-muted-foreground">Define computed columns available to all plots</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-muted rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">

                    {/* Info Box */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 p-3 rounded-lg text-sm flex items-start gap-2 border border-blue-100 dark:border-blue-800/30">
                        <Info className="w-4 h-4 mt-0.5 shrink-0" />
                        <p>
                            Global variables create new columns computed from your data.
                            Use standard math operations and reference existing columns (e.g., <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">col['TagA'] * 2</code>).
                        </p>
                    </div>

                    {/* Variable List */}
                    <div className="space-y-3">
                        {!isAdding && !editing && (
                            <div className="flex justify-end">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setIsAdding(true)}
                                    icon={<Plus className="w-4 h-4" />}
                                >
                                    Add Variable
                                </Button>
                            </div>
                        )}

                        {/* Add New Form */}
                        {isAdding && (
                            <div className="border border-primary rounded-lg p-4 bg-primary/5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-center gap-2 mb-2">
                                    <Plus className="w-4 h-4 text-primary" />
                                    <h3 className="font-medium text-primary">New Variable</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Name</Label>
                                        <Input
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                            placeholder="e.g., Efficiency"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Description (Optional)</Label>
                                        <Input
                                            value={newDescription}
                                            onChange={(e) => setNewDescription(e.target.value)}
                                            placeholder="Calculation logic..."
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Formula</Label>
                                    <div className="relative">
                                        <Calculator className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            ref={newFormulaRef}
                                            value={newFormula}
                                            onChange={(e) => setNewFormula(e.target.value)}
                                            placeholder="col['Input'] / col['Output'] * 100"
                                            className="pl-9 font-mono text-sm"
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Supported: +, -, *, /, **, np.log, np.exp, etc.
                                    </p>
                                </div>

                                {/* Variable Selector */}
                                {allColumns.length > 0 && (
                                    <div className="space-y-1.5 bg-muted/30 rounded-lg p-2 border border-border">
                                        <p className="text-xs font-medium text-muted-foreground">
                                            Available columns ({allColumns.length}):
                                        </p>
                                        <div className="relative">
                                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                                            <Input
                                                value={columnSearch}
                                                onChange={(e) => setColumnSearch(e.target.value)}
                                                placeholder="Search columns..."
                                                className="pl-6 h-7 text-xs"
                                            />
                                        </div>
                                        <div className="max-h-24 overflow-y-auto p-1.5 bg-background/50 rounded border border-border">
                                            <div className="flex flex-wrap gap-1">
                                                {filteredColumns.length > 0 ? (
                                                    filteredColumns.map(col => (
                                                        <button
                                                            key={col}
                                                            type="button"
                                                            onClick={() => handleInsertColumn(col, false)}
                                                            className="px-1.5 py-0.5 text-xs bg-background hover:bg-primary/10 hover:text-primary border border-input rounded transition-colors truncate max-w-[180px]"
                                                            title={`Insert col['${col}']`}
                                                        >
                                                            {col}
                                                        </button>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">
                                                        No columns match "{columnSearch}"
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-end gap-2 pt-2">
                                    <Button variant="ghost" size="sm" onClick={handleCancelNew}>Cancel</Button>
                                    <Button variant="primary" size="sm" onClick={handleSaveNew} disabled={!newName.trim() || !newFormula.trim()}>Save Variable</Button>
                                </div>
                            </div>
                        )}

                        {/* Edit Form */}
                        {editing && (
                            <div className="border border-primary rounded-lg p-4 bg-primary/5 space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Edit2 className="w-4 h-4 text-primary" />
                                    <h3 className="font-medium text-primary">Edit Variable</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Name</Label>
                                        <Input
                                            value={editing.name}
                                            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Description</Label>
                                        <Input
                                            value={editing.description}
                                            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Formula</Label>
                                    <div className="relative">
                                        <Calculator className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            ref={editFormulaRef}
                                            value={editing.formula}
                                            onChange={(e) => setEditing({ ...editing, formula: e.target.value })}
                                            className="pl-9 font-mono text-sm"
                                        />
                                    </div>
                                </div>

                                {/* Variable Selector */}
                                {allColumns.length > 0 && (
                                    <div className="space-y-1.5 bg-muted/30 rounded-lg p-2 border border-border">
                                        <p className="text-xs font-medium text-muted-foreground">
                                            Available columns ({allColumns.length}):
                                        </p>
                                        <div className="relative">
                                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                                            <Input
                                                value={columnSearch}
                                                onChange={(e) => setColumnSearch(e.target.value)}
                                                placeholder="Search columns..."
                                                className="pl-6 h-7 text-xs"
                                            />
                                        </div>
                                        <div className="max-h-24 overflow-y-auto p-1.5 bg-background/50 rounded border border-border">
                                            <div className="flex flex-wrap gap-1">
                                                {filteredColumns.length > 0 ? (
                                                    filteredColumns.map(col => (
                                                        <button
                                                            key={col}
                                                            type="button"
                                                            onClick={() => handleInsertColumn(col, true)}
                                                            className="px-1.5 py-0.5 text-xs bg-background hover:bg-primary/10 hover:text-primary border border-input rounded transition-colors truncate max-w-[180px]"
                                                            title={`Insert col['${col}']`}
                                                        >
                                                            {col}
                                                        </button>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">
                                                        No columns match "{columnSearch}"
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-end gap-2 pt-2">
                                    <Button variant="ghost" size="sm" onClick={handleCancelEdit}>Cancel</Button>
                                    <Button variant="primary" size="sm" onClick={handleSaveEdit} disabled={!editing.name.trim() || !editing.formula.trim()}>Update</Button>
                                </div>
                            </div>
                        )}

                        {/* Existing Variables List */}
                        {globalVariables.length > 0 ? (
                            <div className="grid gap-2">
                                {globalVariables.map((variable, index) => (
                                    <div
                                        key={variable.name}
                                        className="flex items-start justify-between p-3 rounded-lg border border-border bg-card/50 hover:bg-card hover:border-primary/50 transition-all group overflow-hidden"
                                    >
                                        <div className="flex-1 min-w-0 pr-4 overflow-hidden">
                                            <div className="flex items-center gap-2 mb-1 min-w-0 overflow-hidden">
                                                <span className="font-mono text-sm font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded truncate" title={variable.name}>
                                                    {variable.name}
                                                </span>
                                            </div>
                                            <div className="text-xs font-mono text-muted-foreground bg-muted/50 p-1.5 rounded truncate" title={variable.formula}>
                                                {variable.formula}
                                            </div>
                                            {variable.description && (
                                                <p className="text-xs text-muted-foreground mt-1 truncate" title={variable.description}>
                                                    {variable.description}
                                                </p>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleStartEdit(variable)}
                                                className="p-1.5 hover:bg-background rounded transition-colors"
                                                title="Edit"
                                            >
                                                <Edit2 className="w-4 h-4 text-muted-foreground" />
                                            </button>
                                            <button
                                                onClick={() => removeGlobalVariable(index)}
                                                className="p-1.5 hover:bg-destructive/10 rounded transition-colors"
                                                title="Remove"
                                            >
                                                <Trash2 className="w-4 h-4 text-destructive" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : !isAdding && (
                            <p className="text-sm text-muted-foreground text-center py-6">
                                No global variables defined yet. Add one to use computed values across all visualizations.
                            </p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t shrink-0 bg-muted/10 flex justify-end">
                    <Button variant="ghost" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
};
