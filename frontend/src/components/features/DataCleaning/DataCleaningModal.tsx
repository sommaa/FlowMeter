/**
 * Data Cleaning Modal for configuring data preprocessing during file upload.
 *
 * This modal opens automatically after file selection in FileUpload, allowing users
 * to configure comprehensive data cleaning and preprocessing options before ingestion.
 * It provides a multi-section interface for:
 * - Header row selection
 * - Missing value (NaN) handling strategies
 * - Custom NaN value recognition
 * - Value substitution rules (find/replace)
 * - Row filtering based on column conditions
 * - Time-series resampling and aggregation
 *
 * Configuration is persisted in localStorage and auto-loaded on next upload,
 * streamlining repeated workflows with similar data formats.
 *
 * Features:
 * - Six missing value strategies (keep, drop, fill zero, interpolate, forward/backward fill)
 * - Dynamic replacement rules with add/remove capability
 * - Conditional row filters with 8 operators (<, <=, >, >=, ==, !=, contains, not_contains)
 * - Pandas-style resampling frequencies (e.g., '1H', '1D', '1W')
 * - Seven aggregation methods (mean, sum, min, max, first, last, median)
 * - Tooltips explaining each section
 * - Responsive layout with scrollable content
 *
 * The modal is Step 2 in the upload workflow:
 * 1. User selects/drops file in FileUpload
 * 2. **This modal opens for cleaning configuration**
 * 3. User clicks "Process & Upload" → Backend applies transformations
 * 4. Dataset loaded into application
 *
 * @module components/features/DataCleaning/DataCleaningModal
 */

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, HelpCircle, FileSpreadsheet, Filter, Clock } from 'lucide-react';
import { CleaningConfig } from '@/types';
import { Button, SimpleTooltip } from '@/components/common';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";

/**
 * Props for the DataCleaningModal component.
 *
 * @interface DataCleaningModalProps
 * @property {boolean} isOpen - Whether the modal is currently open
 * @property {() => void} onClose - Callback when modal is closed (cancels upload)
 * @property {(config: CleaningConfig) => void} onUpload - Callback when user confirms upload with config
 * @property {string} fileName - Name of file being uploaded (displayed in header)
 * @property {string[]} [columnNames] - Column names from file (optional, for filter dropdown)
 */
interface DataCleaningModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpload: (config: CleaningConfig) => void;
    fileName: string;
    columnNames?: string[];
}

/**
 * Data Cleaning Modal component.
 *
 * Renders a comprehensive data preprocessing configuration interface:
 *
 * **Header**:
 * - FileSpreadsheet icon (primary color)
 * - Title: "Data Cleaning Configuration"
 * - Description: Shows file name in monospace font
 *
 * **General Settings Grid** (2 columns):
 * - **Header Row Index**:
 *   - Number input (0-based indexing)
 *   - Default: 0 (first row contains column names)
 *   - Hint: "Row number containing column names (0-based)"
 *
 * - **Treat Value as NaN**:
 *   - Text input for custom NaN markers
 *   - Examples: "-999", "NULL", "#N/A"
 *   - Backend converts these to pandas NaN during parse
 *
 * **Missing Value Strategy** (6 buttons, 3 columns on desktop):
 * - **Keep as NaN**: No action (default)
 * - **Drop Rows**: Remove rows with any NaN
 * - **Fill with Zero**: Replace NaN with 0
 * - **Linear Interpolation**: Pandas interpolate() method
 * - **Forward Fill**: Propagate last valid value forward
 * - **Backward Fill**: Propagate next valid value backward
 * - Selected button highlighted with primary border and background
 *
 * **Value Substitutions Section**:
 * - Tooltip: "Replace specific values or characters (e.g., replace \",\" with \".\")"
 * - "Add Rule" button (primary color, ghost variant)
 * - Dynamic list of replacement rules:
 *   - Each rule: Input (Find) → Input (Replace) → Trash button
 *   - Animate in with fade + slide
 *   - Empty state: Dashed border card "No substitution rules defined."
 * - Common use cases:
 *   - Decimal separator fix ("," → ".")
 *   - Unit removal ("kg" → "")
 *   - String normalization ("TRUE" → "1")
 *
 * **Row Filters Section**:
 * - Tooltip: "Remove rows based on column values (e.g., remove startup phase where feed flow < 50)"
 * - "Add Filter" button
 * - Dynamic list of filter rules:
 *   - Each rule: Column selector → Operator dropdown → Value input → Trash button
 *   - Operator options:
 *     - < (less than)
 *     - <= (less or equal)
 *     - > (greater than)
 *     - >= (greater or equal)
 *     - = (equals)
 *     - ≠ (not equals)
 *     - contains (string matching)
 *     - not contains (string exclusion)
 *   - Column input: Combobox if columnNames provided, else text input
 *   - Empty state: Dashed border card "No filter rules defined."
 * - Applied sequentially (AND logic)
 *
 * **Aggregation & Resampling Section**:
 * - Tooltip: "Resample time-series data to a different frequency (e.g., convert hourly data to daily averages)"
 * - Clock icon header
 * - Two-column grid:
 *   - **Frequency**:
 *     - Text input with pandas offset aliases
 *     - Examples: '1H' (hourly), '1D' (daily), '1W' (weekly), '5min' (5 minutes)
 *     - Empty: No resampling (keeps original frequency)
 *   - **Aggregation Method**:
 *     - Dropdown: Mean, Sum, Min, Max, First, Last, Median
 *     - Applied to each resampled bin
 *     - Default: Mean (average)
 *
 * **Footer**:
 * - "Cancel" button (ghost) → Closes modal, discards config
 * - "Process & Upload" button (primary) → Saves config, triggers upload
 *
 * **Persistence**:
 * - Config saved to localStorage on submit: `'dataCleaningConfig'`
 * - Auto-loaded on mount (useEffect)
 * - Streamlines repeated uploads with similar data
 * - Graceful error handling if parse fails
 *
 * **State Management**:
 * - Local state for entire CleaningConfig:
 *   - header_row: number
 *   - nan_strategy: 'none' | 'drop' | 'fill_zero' | 'interpolate' | 'fill_forward' | 'fill_backward'
 *   - custom_nan_value: string
 *   - replacements: Array<{target: string, value: string}>
 *   - filters: Array<{column: string, operator: string, value: string}>
 *   - resample_frequency: string
 *   - aggregation_method: 'mean' | 'sum' | 'min' | 'max' | 'first' | 'last' | 'median'
 *
 * **Dynamic List Handlers**:
 * - handleAddReplacement: Adds empty rule to replacements array
 * - handleRemoveReplacement: Removes rule by index
 * - updateReplacement: Updates field (target/value) by index
 * - handleAddFilter: Adds empty filter to filters array
 * - handleRemoveFilter: Removes filter by index
 * - updateFilter: Updates field (column/operator/value) by index
 *
 * **Upload Flow**:
 * 1. User clicks "Process & Upload"
 * 2. Config saved to localStorage (JSON stringify)
 * 3. onUpload(config) called → Parent (FileUpload) uploads file with config
 * 4. Backend applies transformations during pandas read_excel/read_csv
 * 5. Modal closes automatically
 *
 * **Early Return**:
 * - Returns null if !isOpen (performance optimization)
 * - Prevents unnecessary DOM rendering
 *
 * **Responsive Design**:
 * - Max width: 2xl (672px)
 * - Max height: 90vh (prevents overflow on small screens)
 * - Scrollable content area
 * - Grid layouts adapt to screen size (grid-cols-2, grid-cols-3)
 *
 * **Accessibility**:
 * - Keyboard navigation for all controls
 * - Focus management (auto-focus on first input)
 * - Semantic HTML (labels, inputs, buttons)
 * - Tooltip hover delays for desktop
 *
 * @param {DataCleaningModalProps} props - Component props
 * @returns {JSX.Element | null} Data cleaning configuration modal or null
 *
 * @example
 * ```tsx
 * <DataCleaningModal
 *   isOpen={isCleaningOpen}
 *   onClose={() => setCleaningOpen(false)}
 *   onUpload={(config) => uploadFile(selectedFile, config)}
 *   fileName="process_data.xlsx"
 *   columnNames={['Temperature', 'Pressure', 'Flow']}
 * />
 * ```
 */
export const DataCleaningModal: React.FC<DataCleaningModalProps> = ({
    isOpen,
    onClose,
    onUpload,
    fileName,
    columnNames = [],
}) => {
    const [config, setConfig] = useState<CleaningConfig>({
        header_row: 0,
        nan_strategy: 'none',
        custom_nan_value: '',
        replacements: [],
        filters: [],
        resample_frequency: '',
        aggregation_method: 'mean',
    });

    // Load saved config on mount
    useEffect(() => {
        const savedConfig = localStorage.getItem('dataCleaningConfig');
        if (savedConfig) {
            try {
                const parsed = JSON.parse(savedConfig);
                setConfig((prev) => ({ ...prev, ...parsed }));
            } catch (e) {
                console.error('Failed to parse saved cleaning config:', e);
            }
        }
    }, []);

    const handleUpload = () => {
        // Save config to persistence
        localStorage.setItem('dataCleaningConfig', JSON.stringify(config));
        onUpload(config);
    };

    if (!isOpen) return null;

    const handleAddReplacement = () => {
        setConfig((prev) => ({
            ...prev,
            replacements: [...prev.replacements, { target: '', value: '' }],
        }));
    };

    const handleRemoveReplacement = (index: number) => {
        setConfig((prev) => ({
            ...prev,
            replacements: prev.replacements.filter((_, i) => i !== index),
        }));
    };

    const updateReplacement = (index: number, field: 'target' | 'value', val: string) => {
        const newReplacements = [...config.replacements];
        newReplacements[index] = { ...newReplacements[index], [field]: val };
        setConfig({ ...config, replacements: newReplacements });
    };

    const handleAddFilter = () => {
        setConfig((prev) => ({
            ...prev,
            filters: [...prev.filters, { column: '', operator: '<' as const, value: '', action: 'remove' as const }],
        }));
    };

    const handleRemoveFilter = (index: number) => {
        setConfig((prev) => ({
            ...prev,
            filters: prev.filters.filter((_, i) => i !== index),
        }));
    };

    const updateFilter = (index: number, field: 'column' | 'operator' | 'value' | 'action', val: string) => {
        const newFilters = [...config.filters];
        newFilters[index] = { ...newFilters[index], [field]: val };
        setConfig({ ...config, filters: newFilters });
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 py-6 pb-2">
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-primary" />
                        Data Cleaning Configuration
                    </DialogTitle>
                    <DialogDescription>
                        Configure import settings for <span className="font-mono text-primary font-medium">{fileName}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6">
                    <div className="py-4 space-y-6">
                        {/* General Settings */}
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>Header Row Index</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={config.header_row}
                                    onChange={(e) => setConfig({ ...config, header_row: parseInt(e.target.value) || 0 })}
                                />
                                <p className="text-[0.8rem] text-muted-foreground">Row number containing column names (0-based)</p>
                            </div>

                            <div className="space-y-2">
                                <Label>Treat Value as NaN</Label>
                                <Input
                                    type="text"
                                    placeholder="e.g. -999 or NULL"
                                    value={config.custom_nan_value || ''}
                                    onChange={(e) => setConfig({ ...config, custom_nan_value: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Missing Value Strategy */}
                        <div className="space-y-3">
                            <Label>Missing Value Strategy</Label>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                {[
                                    { value: 'none', label: 'Keep as NaN' },
                                    { value: 'drop', label: 'Drop Rows' },
                                    { value: 'fill_zero', label: 'Fill with Zero' },
                                    { value: 'interpolate', label: 'Linear Interpolation' },
                                    { value: 'fill_forward', label: 'Forward Fill' },
                                    { value: 'fill_backward', label: 'Backward Fill' },
                                ].map((option) => (
                                    <button
                                        key={option.value}
                                        onClick={() => setConfig({ ...config, nan_strategy: option.value as CleaningConfig['nan_strategy'] })}
                                        className={cn(
                                            "rounded-lg border px-3 py-2 text-sm transition-all text-left",
                                            config.nan_strategy === option.value
                                                ? 'border-primary bg-primary/10 text-primary font-medium'
                                                : 'border-border bg-background hover:bg-muted text-foreground'
                                        )}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Value Substitutions */}
                        <div className="space-y-3 pt-2">
                            <div className="flex items-center justify-between">
                                <Label className="flex items-center gap-2">
                                    Value Substitutions
                                    <SimpleTooltip side="top" content='Replace specific values or characters (e.g., replace "," with ".")'>
                                        <HelpCircle size={14} className="text-muted-foreground" />
                                    </SimpleTooltip>
                                </Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleAddReplacement}
                                    className="h-8 text-primary hover:text-primary/80 hover:bg-primary/10"
                                >
                                    <Plus size={16} className="mr-1" /> Add Rule
                                </Button>
                            </div>

                            {config.replacements.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground bg-muted/20">
                                    No substitution rules defined.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {config.replacements.map((replacement, index) => (
                                        <div key={index} className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                            <div className="flex-1">
                                                <Input
                                                    type="text"
                                                    placeholder="Find..."
                                                    value={replacement.target}
                                                    onChange={(e) => updateReplacement(index, 'target', e.target.value)}
                                                    className="h-9"
                                                />
                                            </div>
                                            <div className="text-muted-foreground">→</div>
                                            <div className="flex-1">
                                                <Input
                                                    type="text"
                                                    placeholder="Replace with..."
                                                    value={replacement.value}
                                                    onChange={(e) => updateReplacement(index, 'value', e.target.value)}
                                                    className="h-9"
                                                />
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveReplacement(index)}
                                                className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 size={16} />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Row Filters */}
                        <div className="space-y-3 pt-2">
                            <div className="flex items-center justify-between">
                                <Label className="flex items-center gap-2">
                                    <Filter size={16} className="text-muted-foreground" />
                                    Row Filters
                                    <SimpleTooltip side="top" content="Remove rows based on column values (e.g., remove startup phase where feed flow < 50)">
                                        <HelpCircle size={14} className="text-muted-foreground" />
                                    </SimpleTooltip>
                                </Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleAddFilter}
                                    className="h-8 text-primary hover:text-primary/80 hover:bg-primary/10"
                                >
                                    <Plus size={16} className="mr-1" /> Add Filter
                                </Button>
                            </div>

                            {config.filters.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground bg-muted/20">
                                    No filter rules defined.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {config.filters.map((filter, index) => {
                                        const operatorLabels: Record<string, string> = {
                                            '<': '<', '<=': '<=', '>': '>', '>=': '>=',
                                            '==': '=', '!=': '!=', 'contains': 'contains', 'not_contains': 'not contains',
                                        };
                                        const opLabel = operatorLabels[filter.operator] || filter.operator;
                                        const actionLabel = filter.action === 'keep' ? 'Kept' : 'Removed';
                                        const hasFullRule = filter.column && filter.value;

                                        return (
                                            <div key={index} className="rounded-lg border border-border bg-muted/10 p-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        {columnNames.length > 0 ? (
                                                            <Combobox
                                                                options={columnNames}
                                                                value={filter.column}
                                                                onChange={(value) => updateFilter(index, 'column', value)}
                                                                placeholder="Select variable..."
                                                                className="w-full"
                                                            />
                                                        ) : (
                                                            <Input
                                                                type="text"
                                                                placeholder="Column name..."
                                                                value={filter.column}
                                                                onChange={(e) => updateFilter(index, 'column', e.target.value)}
                                                                className="h-9"
                                                            />
                                                        )}
                                                    </div>
                                                    <Select
                                                        value={filter.operator}
                                                        onValueChange={(val) => updateFilter(index, 'operator', val)}
                                                    >
                                                        <SelectTrigger className="h-9 w-[130px] shrink-0">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="<">&lt; (less than)</SelectItem>
                                                            <SelectItem value="<=">≤ (less or equal)</SelectItem>
                                                            <SelectItem value=">">&gt; (greater than)</SelectItem>
                                                            <SelectItem value=">=">≥ (greater or equal)</SelectItem>
                                                            <SelectItem value="==">= (equals)</SelectItem>
                                                            <SelectItem value="!=">≠ (not equals)</SelectItem>
                                                            <SelectItem value="contains">contains</SelectItem>
                                                            <SelectItem value="not_contains">not contains</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <div className="flex-1 min-w-0">
                                                        <Input
                                                            type="text"
                                                            placeholder="Value..."
                                                            value={filter.value}
                                                            onChange={(e) => updateFilter(index, 'value', e.target.value)}
                                                            className="h-9"
                                                        />
                                                    </div>
                                                    <Select
                                                        value={filter.action || 'remove'}
                                                        onValueChange={(val) => updateFilter(index, 'action', val)}
                                                    >
                                                        <SelectTrigger className={cn(
                                                            "h-9 w-[100px] shrink-0 font-medium",
                                                            filter.action === 'keep'
                                                                ? 'border-primary/30 text-primary'
                                                                : 'border-muted-foreground/30 text-muted-foreground'
                                                        )}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="remove">Remove</SelectItem>
                                                            <SelectItem value="keep">Keep</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleRemoveFilter(index)}
                                                        className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                    >
                                                        <Trash2 size={16} />
                                                    </Button>
                                                </div>
                                                {hasFullRule && (
                                                    <p className="text-xs text-muted-foreground pl-1">
                                                        Rows where <span className="font-mono font-medium text-foreground">{filter.column}</span>
                                                        {' '}{opLabel}{' '}
                                                        <span className="font-mono font-medium text-foreground">{filter.value}</span>
                                                        {' '}will be{' '}
                                                        <span className={cn(
                                                            "font-semibold",
                                                            filter.action === 'keep' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                                                        )}>
                                                            {actionLabel}
                                                        </span>
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Aggregation / Resampling */}
                    <div className="space-y-3 p-2">
                        <div className="flex items-center gap-2">
                            <Label className="flex items-center gap-2">
                                <Clock size={16} className="text-muted-foreground" />
                                Aggregation & Resampling
                                <SimpleTooltip side="top" content="Resample time-series data to a different frequency (e.g., convert hourly data to daily averages).">
                                    <HelpCircle size={14} className="text-muted-foreground" />
                                </SimpleTooltip>
                            </Label>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Frequency (e.g. '1H', '1D')</Label>
                                <Input
                                    placeholder="None (keep original)"
                                    value={config.resample_frequency || ''}
                                    onChange={(e) => setConfig({ ...config, resample_frequency: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Aggregation Method</Label>
                                <Select
                                    value={config.aggregation_method || 'mean'}
                                    onValueChange={(val: any) => setConfig({ ...config, aggregation_method: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="mean">Mean (Average)</SelectItem>
                                        <SelectItem value="sum">Sum</SelectItem>
                                        <SelectItem value="min">Minimum</SelectItem>
                                        <SelectItem value="max">Maximum</SelectItem>
                                        <SelectItem value="first">First</SelectItem>
                                        <SelectItem value="last">Last</SelectItem>
                                        <SelectItem value="median">Median</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                </div>


                <DialogFooter className="px-6 py-4 border-t bg-muted/10 gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleUpload}>
                        Process & Upload
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog >
    );
};
