/**
 * Export Download Modal for generating and downloading HTML reports.
 *
 * This modal provides the final step in the report export workflow, allowing users
 * to select a date range and trigger report generation. It integrates with the
 * DateRangePicker for filtering and provides quick access to export configuration.
 *
 * Features:
 * - Date range selection for filtering exported data
 * - Visual date range picker with dashed border highlight
 * - Quick link to export configuration modal
 * - Loading state during report generation
 * - Disabled state when no dataset loaded
 * - Auto-close on successful export
 *
 * The modal triggers the exportReport action which:
 * 1. Collects all visualizations and data within date range
 * 2. Renders charts as static images using Plotly
 * 3. Applies branding from export configuration
 * 4. Generates standalone HTML file with embedded assets
 * 5. Triggers browser download
 *
 * @module components/layout/ExportDownloadModal
 */

import React from 'react';
import { Download, Settings2, MessageSquareText, CalendarDays, BarChart3, LineChart } from 'lucide-react';
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

/**
 * Props for the ExportDownloadModal component.
 *
 * @interface ExportDownloadModalProps
 * @property {boolean} isOpen - Whether the modal is currently open
 * @property {() => void} onClose - Callback when modal is closed
 */
interface ExportDownloadModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Export Download Modal component.
 *
 * Renders a simple modal for date range selection and export triggering:
 *
 * **Header**:
 * - Title: "Export Report"
 * - Description: "Select the data range you wish to include in your report."
 *
 * **Date Range Section**:
 * - Label: "Date Range"
 * - **DateRangePicker** (centered in dashed box):
 *   - Background: bg-muted/30
 *   - Border: border-dashed (visual emphasis)
 *   - Padding: p-4 (spacious click target)
 *   - Rounded-lg corners
 * - Help text below:
 *   - "Only data within this range will be included in the exported HTML file."
 *   - Text-xs, text-muted-foreground, centered
 *
 * **Footer** (flex layout, space-between):
 * - **Left**: Configure button
 *   - Secondary variant
 *   - Settings2 icon
 *   - Label: "Configure" (hidden on mobile via sr-only)
 *   - Opens ExportSettingsModal (via setExportConfigOpen)
 *   - Keeps current modal open (dual-modal workflow)
 *
 * - **Right**: Action buttons (flex gap-2)
 *   - **Cancel** button:
 *     - Ghost variant
 *     - Closes modal without action
 *   - **Download Report** button:
 *     - Primary variant
 *     - Download icon
 *     - Loading state: Shows spinner during export
 *     - Disabled if: !currentDataset
 *     - Triggers: handleDownload → exportReport()
 *
 * **Export Flow**:
 * 1. User clicks "Download Report"
 * 2. handleDownload async function:
 *    - Calls exportReport() (Zustand action)
 *    - Waits for completion (async/await)
 *    - Closes modal on success
 * 3. exportReport action:
 *    - Collects current date range from store
 *    - Fetches data within range
 *    - Generates Plotly chart images
 *    - Renders HTML template with branding
 *    - Creates Blob and downloads file
 * 4. Browser initiates download
 * 5. Modal closes automatically
 *
 * **State Management**:
 * - **Zustand Store**:
 *   - `exportReport()`: Async action generating HTML report
 *   - `isExporting`: Boolean loading state
 *   - `currentDataset`: Required for export (determines disabled state)
 *   - `setExportConfigOpen(true)`: Opens settings modal
 * - No local state (fully controlled by store)
 *
 * **Date Range Integration**:
 * - DateRangePicker component manages its own state in Zustand
 * - exportReport() reads date range from store automatically
 * - No props needed to pass date range
 * - User's selected range applied during export
 *
 * **Dual Modal Workflow**:
 * - Configure button opens ExportSettingsModal
 * - Current modal remains open (doesn't close)
 * - Allows back-and-forth configuration
 * - Settings modal can overlay this modal (higher z-index)
 * - User can adjust branding, then return to export
 *
 * **Loading State**:
 * - Button shows spinner during isExporting=true
 * - User cannot click button again while exporting
 * - Prevents duplicate export requests
 * - Typical export time: 2-10 seconds depending on chart count
 *
 * **Disabled State**:
 * - Download button disabled if no dataset loaded
 * - Prevents export attempt without data
 * - Visual feedback: Grayed out button
 *
 * **Responsive Design**:
 * - Max width: sm (640px)
 * - Configure button label hidden on mobile (sr-only sm:not-sr-only)
 * - Footer layout: Flex column on mobile, row on desktop
 * - Date picker adapts to container width
 *
 * @param {ExportDownloadModalProps} props - Component props
 * @returns {JSX.Element} Export download modal
 *
 * @example
 * ```tsx
 * <ExportDownloadModal
 *   isOpen={showExportDownload}
 *   onClose={() => setShowExportDownload(false)}
 * />
 * ```
 */
export const ExportDownloadModal: React.FC<ExportDownloadModalProps> = ({ isOpen, onClose }) => {
    const exportReport = useStore((state) => state.exportReport);
    const isExporting = useStore((state) => state.isExporting);
    const currentDataset = useStore((state) => state.currentDataset);
    const setExportConfigOpen = useStore((state) => state.setExportConfigOpen);

    const [showComments, setShowComments] = React.useState(true);
    const [showStoryline, setShowStoryline] = React.useState(true);
    const [showStatistics, setShowStatistics] = React.useState(true);
    const [showVisualizations, setShowVisualizations] = React.useState(true);

    const handleDownload = async () => {
        await exportReport({
            comments: showComments,
            storyline: showStoryline,
            statistics: showStatistics,
            visualizations: showVisualizations,
        });
        onClose();
    };

    const sections = [
        { label: 'Comments', checked: showComments, onChange: setShowComments, icon: <MessageSquareText className="w-4 h-4 text-muted-foreground" /> },
        { label: 'Storyline Events', checked: showStoryline, onChange: setShowStoryline, icon: <CalendarDays className="w-4 h-4 text-muted-foreground" /> },
        { label: 'Data Statistics', checked: showStatistics, onChange: setShowStatistics, icon: <BarChart3 className="w-4 h-4 text-muted-foreground" /> },
        { label: 'Visualizations', checked: showVisualizations, onChange: setShowVisualizations, icon: <LineChart className="w-4 h-4 text-muted-foreground" /> },
    ];

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Export Report</DialogTitle>
                    <DialogDescription>
                        Select the data range and sections to include in your report.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label>Date Range</Label>
                        <div className="flex justify-center p-4 border border-dashed rounded-lg bg-muted/30">
                            <DateRangePicker />
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                            Only data within this range will be included in the exported HTML file.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Report Sections</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {sections.map((s) => (
                                <label
                                    key={s.label}
                                    className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors select-none"
                                >
                                    <input
                                        type="checkbox"
                                        checked={s.checked}
                                        onChange={(e) => s.onChange(e.target.checked)}
                                        className="rounded border-input h-4 w-4 accent-primary"
                                    />
                                    <span className="text-sm flex items-center gap-1.5">{s.icon} {s.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                <DialogFooter className="sm:justify-between">
                    <Button
                        variant="secondary"
                        className="gap-2"
                        onClick={() => {
                            // Keep this modal open, just open the settings on top
                            setExportConfigOpen(true);
                        }}
                    >
                        <Settings2 className="w-4 h-4" />
                        <span className="sr-only sm:not-sr-only">Configure</span>
                    </Button>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button
                            variant="primary"
                            onClick={handleDownload}
                            loading={isExporting}
                            disabled={!currentDataset}
                            icon={<Download className="w-4 h-4" />}
                        >
                            Download Report
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
