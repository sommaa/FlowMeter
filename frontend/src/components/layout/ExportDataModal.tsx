import React from 'react';
import { Download, Database, GitBranch, Calculator, FunctionSquare } from 'lucide-react';
import { Button } from '@/components/common';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useStore } from '@/store';

interface ExportDataModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ExportDataModal: React.FC<ExportDataModalProps> = ({ isOpen, onClose }) => {
    const exportData = useStore((state) => state.exportData);
    const isDataExporting = useStore((state) => state.isDataExporting);
    const currentDataset = useStore((state) => state.currentDataset);
    const globalVariables = useStore((state) => state.globalVariables);
    const visualizations = useStore((state) => state.visualizations);

    const [originalData, setOriginalData] = React.useState(true);
    const [reconciledVars, setReconciledVars] = React.useState(true);
    const [globalVars, setGlobalVars] = React.useState(true);
    const [formulaResults, setFormulaResults] = React.useState(false);

    const hasRecColumns = currentDataset?.column_names?.some(c => c.endsWith('_rec')) ?? false;
    const hasGlobalVars = globalVariables.length > 0;
    const hasFormulaVizs = visualizations.some(v => v.viz_type === 'formula');

    const handleDownload = async () => {
        await exportData({
            original_data: originalData,
            reconciled_variables: reconciledVars,
            global_variables: globalVars,
            formula_results: formulaResults,
        });
    };

    const sections = [
        { label: 'Original Data', checked: originalData, onChange: setOriginalData, disabled: false, icon: <Database className="w-4 h-4 text-muted-foreground" /> },
        { label: 'Reconciled Variables', checked: reconciledVars, onChange: setReconciledVars, disabled: !hasRecColumns, icon: <GitBranch className="w-4 h-4 text-muted-foreground" /> },
        { label: 'Global Variables', checked: globalVars, onChange: setGlobalVars, disabled: !hasGlobalVars, icon: <Calculator className="w-4 h-4 text-muted-foreground" /> },
        { label: 'Formula Results', checked: formulaResults, onChange: setFormulaResults, disabled: !hasFormulaVizs, icon: <FunctionSquare className="w-4 h-4 text-muted-foreground" /> },
    ];

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Export Data to Excel</DialogTitle>
                    <DialogDescription>
                        Select the data range and categories to include in the Excel file.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label>Date Range</Label>
                        <div className="flex justify-center p-4 border border-dashed rounded-lg bg-muted/30">
                            <DateRangePicker />
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                            Only data within this range will be included in the exported file.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Data Sections</Label>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                            {sections.map((s) => (
                                <label
                                    key={s.label}
                                    className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors select-none ${s.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50'
                                        }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={s.checked && !s.disabled}
                                        onChange={(e) => !s.disabled && s.onChange(e.target.checked)}
                                        disabled={s.disabled}
                                        className="rounded border-input h-4 w-4 shrink-0 accent-primary"
                                    />
                                    {s.icon}
                                    <span className="text-sm leading-none whitespace-nowrap">{s.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button
                            variant="primary"
                            onClick={handleDownload}
                            loading={isDataExporting}
                            disabled={!currentDataset}
                            icon={<Download className="w-4 h-4" />}
                        >
                            Download Excel
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
