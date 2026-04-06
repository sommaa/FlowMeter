/**
 * Reconciliation Modal for configuring and executing data reconciliation.
 *
 * This modal provides a comprehensive interface for defining mass/energy balance equations,
 * configuring measurement uncertainties, and viewing reconciliation results. It uses SymPy
 * for symbolic equation parsing and OSQP for constrained least-squares optimization.
 *
 * Data reconciliation adjusts noisy measurements to satisfy conservation laws (mass balance,
 * energy balance, etc.) while minimizing changes weighted by measurement uncertainty (sigma).
 * This is critical in process industries for validating sensor data and detecting instrument drift.
 *
 * Features:
 * - Two-tab interface: Configuration and Results & Report
 * - Equation editor with variable name canonicalization (matches backend logic)
 * - Interactive variable selector with search filtering
 * - Two sigma modes: fixed global value or per-variable custom values
 * - Non-negative constraint option (x ≥ 0)
 * - Live results display with instrument error report table
 * - Automatic dataset refresh to include new "_rec" columns
 * - Download reconciled data as Excel file
 *
 * The Configuration tab provides:
 * - Textarea for balance equations (one per line, e.g., "In = Out1 + Out2")
 * - Right panel context switcher: variable selector OR sigma editor
 * - Global sigma mode: single value applied to all variables
 * - Per-variable sigma mode: custom uncertainty for each measurement
 * - Constraint checkboxes for non-negative enforcement
 *
 * The Results tab displays:
 * - Success banner with file download button
 * - Detailed error metrics table: mean error, MAE, avg/max change, rel error %, std error
 * - All metrics shown with scientific precision (4 sig figs)
 *
 * Workflow:
 * 1. User enters balance equations using canonical variable names
 * 2. User configures sigma (measurement uncertainty) mode
 * 3. User sets constraints (non-negative if applicable)
 * 4. User clicks "Run Reconciliation" → backend solves optimization
 * 5. Results appear in Results tab with download link
 * 6. Dataset automatically refreshed with new "_rec" columns
 * 7. All visualizations refreshed to show reconciled data
 *
 * Variable Name Canonicalization:
 * - Spaces converted to underscores
 * - Parentheses and slashes removed
 * - Leading/trailing underscores stripped
 * - Must match backend logic exactly for equation parsing
 *
 * @module components/features/Reconciliation/ReconciliationModal
 */

import React, { useState, useRef } from 'react';
import { Scale, Play, Download, AlertTriangle, FileText, Settings, Search, ChevronRight } from 'lucide-react';
import { Button, Input, Checkbox } from '@/components/common';
import { useStore } from '@/store';
import { reconciliationApi } from '@/services/api';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

/**
 * Props for the ReconciliationModal component.
 *
 * @interface ReconciliationModalProps
 * @property {boolean} isOpen - Whether the modal is currently open
 * @property {() => void} onClose - Callback when modal is closed
 */
interface ReconciliationModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Reconciliation Modal component.
 *
 * Renders a two-tab modal for data reconciliation configuration and results:
 *
 * **Configuration Tab** (Left Pane):
 * - **Equations Editor** (50% height):
 *   - Multiline textarea for balance equations
 *   - One equation per line (e.g., "Feed = Product + Waste")
 *   - Variables must use canonical names (shown in right panel)
 *   - Monospace font for clarity
 *   - Spellcheck disabled
 *
 * - **Constraints Section**:
 *   - Checkbox: "Enforce Non-Negative Results (x ≥ 0)"
 *   - Applied during OSQP optimization
 *
 * - **Sigma Mode Section**:
 *   - Dropdown: "Fixed for All (Global)" or "Per-Variable (Custom)"
 *   - Global mode: single input for sigma value (default: 1.0)
 *   - Per-variable mode: right panel switches to sigma editor
 *
 * **Configuration Tab** (Right Pane):
 * - **Search bar**: Filters variables by name or canonical name
 * - **Variable Selector Mode** (sigma_mode = "fixed_all"):
 *   - Click variable → inserts canonical name at cursor in equations
 *   - Shows original name + canonical name (monospace)
 *   - Hover effect with chevron icon
 *   - Restores focus to textarea after insertion
 *
 * - **Sigma Editor Mode** (sigma_mode = "from_config"):
 *   - Each variable has number input for custom sigma
 *   - Empty values default to global sigma
 *   - Real-time updates to reconciliation config
 *
 * **Results Tab**:
 * - Success banner with green styling:
 *   - Scale icon in success-colored circle
 *   - "Reconciliation Complete" heading
 *   - File name display
 *   - "Download Excel" button
 *
 * - Instrument Error Report Table:
 *   - Columns: Variable, Mean Error, MAE, Avg Change, Max Change, Rel Error %, Std Error
 *   - All numeric values shown with 4 sig figs (toPrecision(4))
 *   - Relative error as percentage (toFixed(2))
 *   - Hover highlighting on rows
 *   - Monospace font for numbers
 *
 * **Footer**:
 * - Error display (if reconciliation fails)
 * - "Close" button (always visible)
 * - "Run Reconciliation" button (only on config tab, disabled if no dataset)
 * - Loading spinner during execution
 *
 * **State Management**:
 * - reconciliationConfig: Zustand store (equations, sigma_mode, fixed_sigma, sigma_values, non_negative)
 * - reconciliationResults: Zustand store (report, file_name, reconciled_file_url)
 * - Local state: activeTab, isRunning, error, equationsStr, searchTerm, renamingId
 *
 * **Side Effects**:
 * - On modal open: Syncs local equations string from store
 * - On results available: Auto-switches to results tab
 * - On reconciliation success:
 *   1. Sets results in store
 *   2. Refreshes current dataset (to load "_rec" columns)
 *   3. Refreshes all plots (to show reconciled data)
 *
 * **Variable Canonicalization Logic**:
 * ```typescript
 * const toCanonicalName = (name: string): string => {
 *   let s = name.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
 *   s = s.replace(/[()/]/g, ' ');
 *   s = s.replace(/[^0-9a-zA-Z]+/g, '_');
 *   return s.replace(/^_+|_+$/g, '');
 * };
 * ```
 * - Non-breaking spaces → regular spaces
 * - Multiple spaces → single space
 * - Parentheses/slashes → spaces
 * - Non-alphanumeric → underscores
 * - Trim leading/trailing underscores
 * - **Must match backend implementation exactly**
 *
 * **Equation Parsing**:
 * - Split by newlines, trim each line
 * - Filter out empty lines
 * - Pass to backend as string array
 * - Backend uses SymPy to parse symbolic equations
 *
 * **Error Handling**:
 * - Network errors during API call
 * - Invalid equation syntax (caught by backend)
 * - Missing variables in dataset
 * - OSQP optimization failures
 *
 * @param {ReconciliationModalProps} props - Component props
 * @returns {JSX.Element} Reconciliation configuration and results modal
 *
 * @example
 * ```tsx
 * <ReconciliationModal
 *   isOpen={showReconciliation}
 *   onClose={() => setShowReconciliation(false)}
 * />
 * ```
 */
export const ReconciliationModal: React.FC<ReconciliationModalProps> = ({
    isOpen,
    onClose,
}) => {
    // Use individual selectors instead of useStore() to ensure proper reactivity
    const currentDataset = useStore((state) => state.currentDataset);
    const reconciliationConfig = useStore((state) => state.reconciliationConfig);
    const updateReconciliationConfig = useStore((state) => state.updateReconciliationConfig);
    const reconciliationResults = useStore((state) => state.reconciliationResults);
    const setReconciliationResults = useStore((state) => state.setReconciliationResults);

    const [activeTab, setActiveTab] = useState<'config' | 'results'>('config');
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Local state for editing equations string
    const [equationsStr, setEquationsStr] = useState(
        (reconciliationConfig.equations || []).join('\n')
    );
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    // Sync local state with store when config changes or modal opens
    React.useEffect(() => {
        if (isOpen) {
            setEquationsStr((reconciliationConfig.equations || []).join('\n'));
        }
    }, [reconciliationConfig.equations, isOpen]);

    // Switch to results tab if results become available while open
    React.useEffect(() => {
        if (isOpen && reconciliationResults) {
            setActiveTab('results');
        }
    }, [reconciliationResults, isOpen]);

    // Search state for right panel
    const [searchTerm, setSearchTerm] = useState('');

    const handleRunReconciliation = async () => {
        if (!currentDataset) return;

        setIsRunning(true);
        setError(null);

        // Parse equations
        const equationsList = equationsStr
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        // Update store
        updateReconciliationConfig({ equations: equationsList });

        try {
            const response = await reconciliationApi.reconcile(currentDataset.id, {
                ...reconciliationConfig,
                equations: equationsList
            });

            setReconciliationResults(response);

            // Refresh dataset to show new columns (must await to get _rec columns in state)
            await useStore.getState().refreshCurrentDataset();

            // Refresh all plots to use the newly available _rec columns
            useStore.getState().refreshAllPlots();

            // Active tab switch handled by effect
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Reconciliation failed');
        } finally {
            setIsRunning(false);
        }
    };

    const downloadFile = () => {
        if (reconciliationResults) {
            window.open(reconciliationResults.reconciled_file_url, '_blank');
        }
    };

    // Helper to canonicalize variable names (must match backend logic)
    const toCanonicalName = (name: string): string => {
        let s = name.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
        s = s.replace(/[()/]/g, ' ');
        s = s.replace(/[^0-9a-zA-Z]+/g, '_');
        return s.replace(/^_+|_+$/g, '');
    };

    const insertVariable = (variable: string) => {
        const canonical = toCanonicalName(variable);
        if (textAreaRef.current) {
            const start = textAreaRef.current.selectionStart;
            const end = textAreaRef.current.selectionEnd;
            const text = equationsStr;
            const newText = text.substring(0, start) + canonical + text.substring(end);
            setEquationsStr(newText);

            // Restore focus and move cursor
            setTimeout(() => {
                if (textAreaRef.current) {
                    textAreaRef.current.focus();
                    textAreaRef.current.setSelectionRange(start + canonical.length, start + canonical.length);
                }
            }, 0);
        } else {
            setEquationsStr(prev => prev + canonical);
        }
    };

    // Filter variables based on search
    const filteredVariables = (currentDataset?.numeric_columns || []).filter(col =>
        col.toLowerCase().includes(searchTerm.toLowerCase()) ||
        toCanonicalName(col).toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-background">
                <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <Scale className="w-5 h-5 text-muted-foreground" />
                        Data Reconciliation
                    </DialogTitle>
                    <DialogDescription>
                        Validate and adjust measurements using mass/energy balance equations
                    </DialogDescription>
                </DialogHeader>

                {/* Tabs */}
                <div className="px-6 border-b flex gap-6 flex-shrink-0 bg-background">
                    <button
                        onClick={() => setActiveTab('config')}
                        className={cn(
                            "py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
                            activeTab === 'config'
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Settings className="w-4 h-4" />
                        Configuration
                    </button>
                    <button
                        onClick={() => setActiveTab('results')}
                        disabled={!reconciliationResults}
                        className={cn(
                            "py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
                            activeTab === 'results'
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground",
                            !reconciliationResults && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <FileText className="w-4 h-4" />
                        Results & Report
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-hidden flex min-h-0">
                    {activeTab === 'config' && (
                        <>
                            {/* Left Pane: Editor & Settings */}
                            <div className="flex-1 p-6 overflow-y-auto border-r space-y-6">
                                {/* Equations Input */}
                                <div className="space-y-2 h-1/2 flex flex-col">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-medium">
                                            Balance Equations
                                        </label>
                                        <span className="text-xs text-muted-foreground">
                                            One per line (e.g., <code>In = Out1 + Out2</code>)
                                        </span>
                                    </div>
                                    <textarea
                                        ref={textAreaRef}
                                        value={equationsStr}
                                        onChange={(e) => setEquationsStr(e.target.value)}
                                        placeholder="Enter equations here..."
                                        className="flex-1 w-full p-4 font-mono text-sm bg-muted/50 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                                        spellCheck={false}
                                    />
                                </div>

                                {/* Common Settings */}
                                <div className="space-y-4 pt-4 border-t">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-medium">Constraints</h4>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <Checkbox
                                                checked={reconciliationConfig.non_negative}
                                                onChange={(e) => updateReconciliationConfig({ non_negative: e.target.checked })}
                                                className="border-input"
                                            />
                                            <span className="text-sm text-foreground">
                                                Enforce Non-Negative Results (x ≥ 0)
                                            </span>
                                        </label>
                                    </div>
                                </div>

                                {/* Sigma Mode Selection */}
                                <div className="space-y-4">
                                    <h4 className="font-medium">Measurement Uncertainty (Sigma)</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm text-muted-foreground">Sigma Mode</label>
                                            <select
                                                value={reconciliationConfig.sigma_mode}
                                                onChange={(e) => updateReconciliationConfig({ sigma_mode: e.target.value as 'fixed_all' | 'from_config' })}
                                                className="w-full px-3 py-2 bg-background border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                                            >
                                                <option value="fixed_all">Fixed for All (Global)</option>
                                                <option value="from_config">Per-Variable (Custom)</option>
                                            </select>
                                        </div>

                                        {reconciliationConfig.sigma_mode === 'fixed_all' && (
                                            <div className="space-y-2">
                                                <label className="text-sm text-muted-foreground">Global Sigma Value</label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={reconciliationConfig.fixed_sigma}
                                                    onChange={(e) => updateReconciliationConfig({ fixed_sigma: parseFloat(e.target.value) })}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Right Pane: Contextual Helper */}
                            <div className="w-80 bg-muted/10 flex flex-col border-l">
                                <div className="p-4 border-b bg-background">
                                    <h4 className="font-medium mb-2">
                                        {reconciliationConfig.sigma_mode === 'from_config'
                                            ? 'Uncertainty Configuration'
                                            : 'Variable Selector'}
                                    </h4>

                                    {/* Search */}
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <input
                                            type="text"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            placeholder="Search variables..."
                                            className="w-full pl-8 pr-3 py-2 text-sm bg-muted/30 border rounded-lg focus:ring-2 focus:ring-primary"
                                        />
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                    {reconciliationConfig.sigma_mode === 'from_config' ? (
                                        // Sigma Editor List
                                        filteredVariables.map(variable => {
                                            const canonical = toCanonicalName(variable);
                                            return (
                                                <div key={variable} className="flex items-center gap-2 p-2 bg-card border rounded-lg">
                                                    <div className="flex-1 overflow-hidden">
                                                        <div className="text-xs font-medium truncate" title={variable}>
                                                            {variable}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground font-mono truncate" title={canonical}>
                                                            {canonical}
                                                        </div>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        className="w-20 px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-primary bg-background text-foreground placeholder:text-muted-foreground"
                                                        placeholder="Sigma"
                                                        value={reconciliationConfig.sigma_values[canonical] || ''}
                                                        onChange={(e) => {
                                                            const val = parseFloat(e.target.value);
                                                            updateReconciliationConfig({
                                                                sigma_values: {
                                                                    ...reconciliationConfig.sigma_values,
                                                                    [canonical]: isNaN(val) ? 0 : val
                                                                }
                                                            });
                                                        }}
                                                    />
                                                </div>
                                            );
                                        })
                                    ) : (
                                        // Variable Selector List
                                        filteredVariables.map(variable => {
                                            const canonical = toCanonicalName(variable);
                                            return (
                                                <button
                                                    key={variable}
                                                    onClick={() => insertVariable(variable)}
                                                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted hover:shadow-sm border border-transparent hover:border-border rounded-md transition-all flex items-center justify-between group"
                                                >
                                                    <div className="overflow-hidden">
                                                        <div className="truncate" title={variable}>{variable}</div>
                                                        <div className="text-[10px] text-muted-foreground font-mono truncate" title={canonical}>
                                                            {canonical}
                                                        </div>
                                                    </div>
                                                    <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-muted-foreground" />
                                                </button>
                                            );
                                        })
                                    )}

                                    {filteredVariables.length === 0 && (
                                        <p className="text-center text-xs text-muted-foreground mt-4">No variables found</p>
                                    )}
                                </div>

                                {reconciliationConfig.sigma_mode === 'from_config' && (
                                    <div className="p-3 border-t bg-muted/20">
                                        <p className="text-xs text-muted-foreground text-center">
                                            Empty values default to global setting
                                        </p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {activeTab === 'results' && reconciliationResults && (
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="flex items-center justify-between p-4 bg-success-50/50 rounded-lg border border-success-200">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-success-100 rounded-full">
                                        <Scale className="w-5 h-5 text-success-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-success-900">Reconciliation Complete</p>
                                        <p className="text-sm text-success-700">
                                            File generated: {reconciliationResults.file_name}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="success"
                                    size="sm"
                                    onClick={downloadFile}
                                    icon={<Download className="w-4 h-4" />}
                                >
                                    Download Excel
                                </Button>
                            </div>

                            <div>
                                <h4 className="font-medium mb-4">Instrument Error Report</h4>
                                <div className="overflow-x-auto border rounded-lg">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                                            <tr>
                                                <th className="px-4 py-3">Variable</th>
                                                <th className="px-4 py-3 text-right">Mean Error</th>
                                                <th className="px-4 py-3 text-right">MAE</th>
                                                <th className="px-4 py-3 text-right">Avg Change</th>
                                                <th className="px-4 py-3 text-right">Max Change</th>
                                                <th className="px-4 py-3 text-right">Rel Error %</th>
                                                <th className="px-4 py-3 text-right">Std Error</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y bg-card">
                                            {reconciliationResults.report.map((row, i) => (
                                                <tr key={i} className="hover:bg-muted/50">
                                                    <td className="px-4 py-3 font-medium text-foreground">
                                                        {row.variable}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                                                        {row.mean_error.toPrecision(4)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                                                        {row.mae.toPrecision(4)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                                                        {row.avg_abs_change.toPrecision(4)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                                                        {row.max_abs_change.toPrecision(4)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                                                        {row.rel_error_pct.toFixed(2)}%
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                                                        {row.std_error.toPrecision(4)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t bg-muted/10 rounded-b-xl flex items-center justify-between flex-shrink-0">
                    <div className="flex-1">
                        {error && (
                            <div className="flex items-center gap-2 text-destructive text-sm">
                                <AlertTriangle className="w-4 h-4" />
                                {error}
                            </div>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={onClose}>
                            Close
                        </Button>
                        {activeTab === 'config' && (
                            <Button
                                variant="primary"
                                onClick={handleRunReconciliation}
                                loading={isRunning}
                                disabled={!currentDataset}
                                icon={<Play className="w-4 h-4" />}
                            >
                                Run Reconciliation
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
