/**
 * Data Info Modal for displaying comprehensive dataset metadata and statistics.
 *
 * This modal provides a detailed, read-only view of the currently loaded dataset,
 * showing file information, metrics, column types, and a complete column list.
 * It serves as a data dictionary and reference guide for users working with
 * complex process data.
 *
 * Features:
 * - File name and upload timestamp
 * - Key metrics grid (rows, columns, memory, upload time)
 * - Date range for time-series data
 * - Column type breakdown with color-coded badges
 * - Scrollable list of all column names
 * - DateTime column highlighting
 * - Responsive grid layout
 *
 * The modal is triggered from the sidebar or TopBar when users need to reference
 * dataset details while building visualizations or configuring analysis tools.
 *
 * @module components/features/DataManagement/DataInfoModal
 */

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useStore } from '@/store';
import { Database, Calendar, Clock, Hash, Columns, HardDrive } from 'lucide-react';

/**
 * Props for the DataInfoModal component.
 *
 * @interface DataInfoModalProps
 * @property {boolean} isOpen - Whether the modal is currently open
 * @property {() => void} onClose - Callback when modal is closed
 */
interface DataInfoModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Data Info Modal component.
 *
 * Displays comprehensive dataset information in a structured, read-only format:
 *
 * **File Name Section**:
 * - Full file name with word-break (handles long names)
 * - Muted background card
 * - Semibold text for emphasis
 *
 * **Key Metrics Grid** (2x2 layout):
 * - **Rows** (Hash icon):
 *   - Count with locale formatting (e.g., "1,234,567")
 *   - XL font, bold
 *
 * - **Columns** (Columns icon):
 *   - Total column count
 *   - XL font, bold
 *
 * - **Memory Usage** (HardDrive icon):
 *   - Auto-format: KB or MB based on size
 *   - Threshold: 1024 KB switches to MB display
 *   - Format: `formatBytes(kb)` helper function
 *
 * - **Uploaded** (Clock icon):
 *   - Timestamp with locale formatting
 *   - Format: `formatDate(dateStr)` helper function
 *   - Handles parsing errors gracefully
 *
 * **Date Range Section** (conditional):
 * - Only rendered if `currentDataset.date_range` exists
 * - Calendar icon header
 * - Two-column grid:
 *   - Start date (formatted)
 *   - End date (formatted)
 * - Useful for time-series analysis context
 *
 * **Column Types Summary**:
 * - Color-coded pill badges:
 *   - **Numeric**: Blue (bg-blue-100, text-blue-700 in light mode)
 *   - **DateTime**: Purple (bg-purple-100, text-purple-700)
 *   - **Other**: Gray (calculated as total - numeric)
 * - DateTime column names listed below:
 *   - Monospace font for clarity
 *   - Comma-separated
 *   - Only shown if datetime columns exist
 *
 * **All Columns List**:
 * - Shows total count in header (e.g., "All Columns (42)")
 * - Scrollable container (max-height: 10rem)
 * - Thin scrollbar styling
 * - Flex-wrap layout with individual column pills:
 *   - Monospace font
 *   - Border and background for distinction
 *   - Truncated at 200px with title tooltip
 *   - Compact spacing (gap-1)
 *
 * **Helper Functions**:
 * - `formatBytes(kb: number)`: Converts KB to KB/MB with appropriate suffix
 * - `formatDate(dateStr: string)`: Locale-aware date/time formatting with error handling
 *
 * **State Management**:
 * - Reads `currentDataset` from Zustand store
 * - Returns null if no dataset loaded (prevents rendering)
 * - All data read-only (no mutations)
 *
 * **Layout**:
 * - Max width: sm (640px)
 * - Max height: 85vh with vertical scroll
 * - Responsive grid layouts (grid-cols-2)
 * - Consistent spacing (space-y-4)
 * - Muted backgrounds for visual grouping
 *
 * **Icons**:
 * - Database: Modal title
 * - Hash: Row count
 * - Columns: Column count
 * - HardDrive: Memory usage
 * - Clock: Upload timestamp
 * - Calendar: Date range
 *
 * **Accessibility**:
 * - Dialog auto-focus and trap
 * - Close on backdrop click
 * - Semantic HTML structure
 * - Color contrast meets WCAG standards
 *
 * @param {DataInfoModalProps} props - Component props
 * @returns {JSX.Element | null} Dataset info modal or null if no dataset
 *
 * @example
 * ```tsx
 * <DataInfoModal
 *   isOpen={showDataInfo}
 *   onClose={() => setShowDataInfo(false)}
 * />
 * ```
 */
export const DataInfoModal: React.FC<DataInfoModalProps> = ({ isOpen, onClose }) => {
    const currentDataset = useStore((state) => state.currentDataset);

    if (!currentDataset) return null;

    const formatBytes = (kb: number) => {
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        return `${(kb / 1024).toFixed(2)} MB`;
    };

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleString();
        } catch {
            return dateStr;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Database className="w-5 h-5 text-primary" />
                        Dataset Information
                    </DialogTitle>
                    <DialogDescription>
                        Details about the currently loaded dataset.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* File Name */}
                    <div className="p-3 rounded-lg bg-muted/50">
                        <div className="text-sm text-muted-foreground mb-1">File Name</div>
                        <div className="font-semibold text-foreground break-all">
                            {currentDataset.name}
                        </div>
                    </div>

                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                <Hash className="w-4 h-4" />
                                Rows
                            </div>
                            <div className="text-xl font-bold text-foreground">
                                {currentDataset.rows.toLocaleString()}
                            </div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                <Columns className="w-4 h-4" />
                                Columns
                            </div>
                            <div className="text-xl font-bold text-foreground">
                                {currentDataset.columns.toLocaleString()}
                            </div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                <HardDrive className="w-4 h-4" />
                                Memory Usage
                            </div>
                            <div className="text-xl font-bold text-foreground">
                                {formatBytes(currentDataset.memory_usage_kb)}
                            </div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                <Clock className="w-4 h-4" />
                                Uploaded
                            </div>
                            <div className="text-sm font-medium text-foreground">
                                {formatDate(currentDataset.uploaded_at)}
                            </div>
                        </div>
                    </div>

                    {/* Date Range */}
                    {currentDataset.date_range && (
                        <div className="p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                <Calendar className="w-4 h-4" />
                                Date Range
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                    <span className="text-muted-foreground">Start: </span>
                                    <span className="font-medium">{formatDate(currentDataset.date_range.start)}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">End: </span>
                                    <span className="font-medium">{formatDate(currentDataset.date_range.end)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Column Types Summary */}
                    <div className="p-3 rounded-lg bg-muted/50">
                        <div className="text-sm text-muted-foreground mb-2">Column Types</div>
                        <div className="flex flex-wrap gap-2 mb-3">
                            <span className="px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium">
                                {currentDataset.numeric_columns.length} Numeric
                            </span>
                            <span className="px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium">
                                {currentDataset.datetime_columns.length} DateTime
                            </span>
                            <span className="px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700/30 text-gray-700 dark:text-gray-300 text-xs font-medium">
                                {Math.max(0, currentDataset.columns - currentDataset.numeric_columns.length)} Other
                            </span>
                        </div>
                        {currentDataset.datetime_columns.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                                <span className="font-medium">DateTime columns: </span>
                                {currentDataset.datetime_columns.map((col: string, idx: number) => (
                                    <span key={idx} className="font-mono">
                                        {col}{idx < currentDataset.datetime_columns.length - 1 ? ', ' : ''}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Column Names */}
                    <div className="p-3 rounded-lg bg-muted/50">
                        <div className="text-sm text-muted-foreground mb-2">
                            All Columns ({currentDataset.column_names.length})
                        </div>
                        <div className="max-h-40 overflow-y-auto scrollbar-thin">
                            <div className="flex flex-wrap gap-1">
                                {currentDataset.column_names.map((col: string, idx: number) => (
                                    <span
                                        key={idx}
                                        className="px-2 py-0.5 rounded bg-background border text-xs font-mono truncate max-w-[200px]"
                                        title={col}
                                    >
                                        {col}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
