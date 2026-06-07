/**
 * File Upload Component with drag-and-drop support and data cleaning integration.
 *
 * This component provides the primary data ingestion interface for the application,
 * supporting Excel (.xlsx, .xls), CSV, and Parquet (.parquet, .pqt) files. It implements a two-stage upload process:
 * 1. File selection (drag-and-drop or click to browse)
 * 2. Data cleaning configuration (via modal)
 *
 * The component has two distinct states:
 * - **No Dataset**: Shows dropzone for file upload
 * - **Dataset Loaded**: Shows dataset summary with stats and column information
 *
 * Features:
 * - React-dropzone for drag-and-drop file handling
 * - Data cleaning modal integration (interpolation, outliers, duplicates)
 * - Live dataset statistics display (rows, columns, memory, date range)
 * - Column type breakdown (numeric, datetime, other)
 * - Clear dataset functionality
 * - File type validation (Excel, CSV, and Parquet only)
 * - Loading state management
 * - Error display
 *
 * Upload Flow:
 * 1. User drops/selects file → Opens DataCleaningModal
 * 2. User configures cleaning options (or skips)
 * 3. File uploaded with cleaning config → Backend processes
 * 4. Component switches to dataset summary view
 *
 * @module components/features/DataManagement/FileUpload
 */

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileSpreadsheet, X, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useStore } from '@/store';
import { Button } from '@/components/common';

import { DataCleaningModal } from '@/components/features/DataCleaning/DataCleaningModal';
import { CleaningConfig } from '@/types';

/**
 * File Upload component.
 *
 * Renders either a dropzone for file selection or a dataset summary depending on state:
 *
 * **Dataset Loaded View**:
 * - **Header Row**:
 *   - FileSpreadsheet icon with primary background
 *   - Dataset name (truncated if long)
 *   - Upload timestamp (locale-formatted)
 *   - Clear button (X icon, destructive hover)
 *
 * - **Stats Grid** (2x2 layout):
 *   - **Row Count**: Total rows with locale formatting (e.g., "1,234,567")
 *   - **Columns**: Total column count
 *   - **Memory**: Display in KB or MB (switches at 1024 KB threshold)
 *   - **Date Range**: Start and end dates from datetime columns (or "-" if none)
 *
 * - **Column Types Panel**:
 *   - Color-coded badges:
 *     - Numeric: Blue (e.g., "15 Numeric")
 *     - DateTime: Purple (e.g., "2 DateTime")
 *     - Other: Gray (calculated as total - numeric - datetime)
 *   - DateTime column names listed below badges (monospace font)
 *
 * **No Dataset View (Dropzone)**:
 * - Dashed border rectangle (hover highlights border)
 * - Upload icon centered at top
 * - Instructions:
 *   - Default: "Drag & drop your Excel file here" + "or click to browse (.xlsx, .xls, .csv, .parquet, .pqt)"
 *   - Dragging: "Drop your file here" (primary color)
 *   - Loading: "Processing..."
 * - Accept types: Excel (.xlsx, .xls), CSV (.csv), Parquet (.parquet, .pqt)
 * - Max files: 1 (single file upload only)
 * - Disabled during loading
 *
 * **Data Cleaning Modal**:
 * - Opens automatically after file selection
 * - User configures:
 *   - Missing value interpolation (method, limit)
 *   - Outlier detection (Z-score, IQR)
 *   - Duplicate removal
 * - On submit: Calls uploadFile(file, cleaningConfig)
 * - On cancel: Clears selected file
 *
 * **State Management**:
 * - **Zustand Store**:
 *   - `currentDataset`: Loaded dataset metadata or null
 *   - `uploadFile(file, config)`: Uploads file with cleaning config
 *   - `clearDataset()`: Removes current dataset
 *   - `isLoading`: Upload/processing state
 *   - `error`: Error message from failed upload
 *
 * - **Local State**:
 *   - `selectedFile`: File object awaiting cleaning config
 *   - `isCleaningOpen`: Data cleaning modal visibility
 *   - `columnNames`: Column names for cleaning modal (currently unused, backend extracts)
 *
 * **Drag-and-Drop**:
 * - Powered by react-dropzone
 * - File validation: MIME types and extensions
 * - Visual feedback: Border color changes on drag
 * - Single file constraint enforced
 * - Disabled state prevents drops during loading
 *
 * **Memory Display Logic**:
 * ```typescript
 * memory_usage_kb < 1024
 *   ? `${memory_usage_kb.toFixed(1)} KB`
 *   : `${(memory_usage_kb / 1024).toFixed(2)} MB`
 * ```
 *
 * **Date Range Display**:
 * - Only shown if dataset.date_range exists
 * - Displays start and end dates from first/last datetime rows
 * - Falls back to "-" if no datetime columns
 *
 * **Clear Dataset**:
 * - X button in header
 * - Hover: Red background and text (destructive)
 * - Calls clearDataset() → Removes from store and backend
 * - Returns to upload view
 *
 * **Error Handling**:
 * - Upload errors shown below dropzone
 * - Red text (danger-500)
 * - Persists until successful upload or file selection
 *
 * **Upload Flow**:
 * 1. onDrop callback triggered with accepted files
 * 2. Sets selectedFile and opens cleaning modal
 * 3. User configures cleaning or clicks skip
 * 4. handleCleaningUpload calls uploadFile(file, config)
 * 5. Backend processes file and returns dataset metadata
 * 6. Component rerenders with dataset summary
 *
 * **Column Names Note**:
 * - columnNames state currently unused (empty array)
 * - Backend extracts column names securely during upload
 * - Prevents client-side manipulation of data schema
 *
 * @returns {JSX.Element} File upload dropzone or dataset summary
 *
 * @example
 * ```tsx
 * // Used in Sidebar
 * <FileUpload />
 * ```
 */
export const FileUpload: React.FC = () => {
  const uploadFile = useStore((state) => state.uploadFile);
  const updateDataFile = useStore((state) => state.updateDataFile);
  const currentDataset = useStore((state) => state.currentDataset);
  const clearDataset = useStore((state) => state.clearDataset);
  const isLoading = useStore((state) => state.isLoading);
  const error = useStore((state) => state.error);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [isCleaningOpen, setCleaningOpen] = React.useState(false);
  const [isUpdateCleaningOpen, setUpdateCleaningOpen] = React.useState(false);
  const [columnNames, setColumnNames] = React.useState<string[]>([]);
  const updateInputRef = React.useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        setSelectedFile(file);
        // Column names will be available after upload - backend extracts them securely
        setColumnNames([]);
        setCleaningOpen(true);
      }
    },
    []
  );

  const handleCleaningUpload = (config: CleaningConfig) => {
    if (selectedFile) {
      uploadFile(selectedFile, config);
      setCleaningOpen(false);
      setSelectedFile(null);
    } else {
      console.error('[FileUpload] No file selected when processing upload!');
    }
  };

  const handleUpdateFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUpdateCleaningOpen(true);
    }
    e.target.value = '';
  };

  const handleUpdateCleaningUpload = (config: CleaningConfig) => {
    if (selectedFile) {
      updateDataFile(selectedFile, config);
      setUpdateCleaningOpen(false);
      setSelectedFile(null);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
      // Parquet has no universally-registered MIME type; match by extension.
      'application/vnd.apache.parquet': ['.parquet', '.pqt'],
      'application/octet-stream': ['.parquet', '.pqt'],
    },
    maxFiles: 1,
    disabled: isLoading,
  });

  if (currentDataset) {
    return (
      <>
      <DataCleaningModal
        isOpen={isUpdateCleaningOpen}
        onClose={() => {
          setUpdateCleaningOpen(false);
          setSelectedFile(null);
        }}
        onUpload={handleUpdateCleaningUpload}
        fileName={selectedFile?.name || ''}
        columnNames={[]}
      />
      <div className="space-y-4">
        {/* Header with Clear Button */}
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/50">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="p-2 bg-primary/10 rounded-md">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate" title={currentDataset.name}>
                {currentDataset.name}
              </p>
              <p className="text-xs text-muted-foreground">
                Uploaded {new Date(currentDataset.uploaded_at).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <input
              ref={updateInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.parquet,.pqt"
              className="hidden"
              onChange={handleUpdateFileSelect}
              data-testid="update-file-input"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateInputRef.current?.click()}
              disabled={isLoading}
              className="hover:bg-primary/10 hover:text-primary"
              title="Update File"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearDataset}
              className="hover:bg-destructive/10 hover:text-destructive"
              title="Clear Dataset"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-card border border-border/50 rounded-lg shadow-sm">
            <p className="text-xs text-muted-foreground mb-1">Row Count</p>
            <p className="text-lg font-bold text-foreground">{currentDataset.rows.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-card border border-border/50 rounded-lg shadow-sm">
            <p className="text-xs text-muted-foreground mb-1">Columns</p>
            <p className="text-lg font-bold text-foreground">{currentDataset.columns.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-card border border-border/50 rounded-lg shadow-sm">
            <p className="text-xs text-muted-foreground mb-1">Memory</p>
            <p className="text-lg font-bold text-foreground">
              {currentDataset.memory_usage_kb < 1024
                ? `${currentDataset.memory_usage_kb.toFixed(1)} KB`
                : `${(currentDataset.memory_usage_kb / 1024).toFixed(2)} MB`}
            </p>
          </div>
          <div className="p-3 bg-card border border-border/50 rounded-lg shadow-sm">
            <p className="text-xs text-muted-foreground mb-1">Date Range</p>
            {currentDataset.date_range ? (
              <div className="text-xs font-medium text-foreground">
                <span className="block">{new Date(currentDataset.date_range.start).toLocaleDateString()}</span>
                <span className="block text-muted-foreground">to</span>
                <span className="block">{new Date(currentDataset.date_range.end).toLocaleDateString()}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">-</p>
            )}
          </div>
        </div>

        {/* Column Types */}
        <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
          <p className="text-xs font-medium text-muted-foreground mb-2">Column Types</p>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium border border-blue-500/20">
              {currentDataset.numeric_columns.length} Numeric
            </span>
            <span className="px-2 py-1 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-medium border border-purple-500/20">
              {currentDataset.datetime_columns.length} DateTime
            </span>
            <span className="px-2 py-1 rounded-md bg-gray-500/10 text-gray-600 dark:text-gray-400 text-xs font-medium border border-gray-500/20">
              {Math.max(0, currentDataset.columns - currentDataset.numeric_columns.length - currentDataset.datetime_columns.length)} Other
            </span>
          </div>
          {currentDataset.datetime_columns.length > 0 && (
            <div className="mt-2 text-[10px] text-muted-foreground">
              <span className="font-medium">Time columns: </span>
              {currentDataset.datetime_columns.join(', ')}
            </div>
          )}
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      <DataCleaningModal
        isOpen={isCleaningOpen}
        onClose={() => {
          setCleaningOpen(false);
          setSelectedFile(null);
          setColumnNames([]);
        }}
        onUpload={handleCleaningUpload}
        fileName={selectedFile?.name || ''}
        columnNames={columnNames}
      />
      <div className="space-y-2">
        <div
          {...getRootProps()}
          className={clsx(
            'p-6 border-2 border-dashed rounded-lg cursor-pointer transition-all duration-200',
            isDragActive
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-slate-300 dark:border-slate-600 hover:border-primary-400',
            isLoading && 'opacity-50 cursor-not-allowed'
          )}
        >
          <input {...getInputProps()} />
          <div className="text-center">
            <Upload
              className={clsx(
                'w-10 h-10 mx-auto mb-3',
                isDragActive ? 'text-primary-500' : 'text-slate-400 dark:text-gray-500'
              )}
            />
            {isLoading ? (
              <p className="text-slate-600 dark:text-gray-400">Processing...</p>
            ) : isDragActive ? (
              <p className="text-primary-600 dark:text-primary-400 font-medium">
                Drop your file here
              </p>
            ) : (
              <>
                <p className="text-slate-600 dark:text-gray-400">
                  Drag & drop your Excel file here
                </p>
                <p className="text-sm text-slate-400 dark:text-gray-500 mt-1">
                  or click to browse (.xlsx, .xls, .csv, .parquet, .pqt)
                </p>
              </>
            )}
          </div>
        </div>
        {error && (
          <p className="text-sm text-danger-500 px-1">{error}</p>
        )}
      </div>
    </>
  );
};
