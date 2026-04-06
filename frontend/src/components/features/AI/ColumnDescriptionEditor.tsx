/**
 * Column Description Editor for AI wizard step 1.
 *
 * This component provides an interface for users to add semantic descriptions to dataset
 * columns and analysis goals. These descriptions give AI models the context needed to
 * understand data meaning and generate relevant visualization suggestions.
 *
 * Features:
 * - Analysis goals textarea for high-level guidance (what to analyze, questions to answer)
 * - Progress bar showing completion percentage (filled/total columns)
 * - Scrollable list of all columns with individual description inputs
 * - Data type badges (datetime, numeric, text) for each column
 * - Visual completion indicators (checkmarks, colored progress)
 * - Context-aware placeholder text based on data type
 * - Real-time validation showing incomplete fields
 *
 * The editor ensures all columns have descriptions before allowing wizard progression.
 * Descriptions are persisted in Zustand global state across sessions.
 *
 * Why Descriptions Matter:
 * AI models receive only column names and sample data, which may be cryptic abbreviations
 * (e.g., "TC_1001", "PV_RX_TEMP"). Semantic descriptions help AI understand:
 * - What each column represents in real-world terms
 * - Units of measurement
 * - Contextual meaning within the domain
 * - Relationships and dependencies between variables
 *
 * This context enables AI to suggest meaningful visualizations aligned with user intent.
 *
 * @module components/features/AI/ColumnDescriptionEditor
 */

import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Circle, AlertCircle, Info } from 'lucide-react';
import { useStore } from '@/store';
import { cn } from '@/lib/utils';

/**
 * Props for the ColumnDescriptionEditor component.
 *
 * @interface Props
 * @property {Record<string, string>} columnDescriptions - Map of column names to their descriptions
 * @property {(descriptions: Record<string, string>) => void} onDescriptionsChange - Callback when descriptions change
 * @property {string} [guidanceText] - Analysis goals and guidance text (optional)
 * @property {(text: string) => void} [onGuidanceChange] - Callback when guidance changes (optional)
 * @property {boolean} [showGuidance] - Whether to show guidance textarea (default: true)
 */
interface Props {
    columnDescriptions: Record<string, string>;
    onDescriptionsChange: (descriptions: Record<string, string>) => void;
    guidanceText?: string;
    onGuidanceChange?: (text: string) => void;
    showGuidance?: boolean;
}

/**
 * Column Description Editor component for AI wizard step 1.
 *
 * Renders a form for collecting semantic descriptions of dataset columns:
 *
 * **Analysis Goals Section** (if showGuidance=true):
 * - Textarea for high-level analysis objectives
 * - Placeholder suggests: relationships, anomalies, trends, etc.
 * - Required field (marked with red asterisk)
 * - Green checkmark when filled
 * - Helps AI understand overall intent and focus
 *
 * **Progress Bar**:
 * - Shows completion: "{filled}/{total}" badge
 * - Visual progress bar (0-100%)
 * - Green when complete, primary color otherwise
 * - Amber warning if incomplete: "All variables need descriptions"
 * - Updates in real-time as user fills inputs
 *
 * **Column List** (scrollable, max-height 280px):
 * - One row per column in dataset
 * - Each row shows:
 *   - Checkbox icon (filled circle = complete, empty circle = incomplete)
 *   - Column name in monospace font
 *   - Data type badge (datetime=blue, numeric=emerald, text=gray)
 *   - Description input field
 * - Rows highlighted on hover
 * - Completed rows have green checkmark and success styling
 * - Incomplete rows have empty circle and muted styling
 *
 * **Data Type Detection**:
 * - Datetime: Columns in currentDataset.datetime_columns
 * - Numeric: Columns in currentDataset.numeric_columns
 * - Text: All others (fallback)
 *
 * **Placeholder Text by Type**:
 * - Datetime: "e.g., Timestamp of the measurement"
 * - Numeric: "e.g., Temperature in reactor vessel (°C)"
 * - Text: "e.g., Batch identifier or product code"
 * - Guides users on what information to provide
 *
 * **Empty State**:
 * - Shown if no dataset loaded
 * - Info icon with "No dataset loaded" message
 * - Prevents errors when dataset not available
 *
 * **Validation**:
 * - Completion calculated as filled/total columns
 * - Filled = non-empty after trim()
 * - isComplete = all columns have descriptions AND guidance provided
 * - Wizard step 1 "Continue" button disabled until isComplete
 *
 * **State Management**:
 * - Reads currentDataset from Zustand store
 * - Receives columnDescriptions and guidanceText from parent
 * - Calls callbacks on every keystroke (controlled inputs)
 * - No debouncing (parent handles persistence)
 *
 * **Styling**:
 * - Responsive layout with proper spacing
 * - Color-coded feedback (green=success, amber=warning)
 * - Scrollable column list prevents modal overflow
 * - Hover effects on interactive elements
 *
 * Workflow:
 * 1. User enters analysis goals in textarea
 * 2. User describes each column in dedicated input
 * 3. Progress bar updates in real-time
 * 4. When all fields filled, wizard allows continuation
 * 5. Descriptions persist in store for future AI sessions
 *
 * @param {Props} props - Component props
 * @returns {JSX.Element} Column description editor form or empty state
 *
 * @example
 * ```tsx
 * <ColumnDescriptionEditor
 *   columnDescriptions={{
 *     'Temperature': 'Reactor temperature in Celsius',
 *     'Pressure': 'Operating pressure in bar'
 *   }}
 *   onDescriptionsChange={(descriptions) => setDescriptions(descriptions)}
 *   guidanceText="Analyze temperature-pressure relationship and identify operating ranges"
 *   onGuidanceChange={(text) => setGuidanceText(text)}
 *   showGuidance={true}
 * />
 * ```
 */
export const ColumnDescriptionEditor: React.FC<Props> = ({
    columnDescriptions,
    onDescriptionsChange,
    guidanceText = '',
    onGuidanceChange,
    showGuidance = true
}) => {
    const currentDataset = useStore(state => state.currentDataset);

    if (!currentDataset) {
        return (
            <div className="p-6 text-center text-muted-foreground border rounded-lg">
                <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No dataset loaded</p>
            </div>
        );
    }

    const totalColumns = currentDataset.column_names.length;
    const filledColumns = currentDataset.column_names.filter(
        col => columnDescriptions[col]?.trim()
    ).length;
    const progress = totalColumns > 0 ? (filledColumns / totalColumns) * 100 : 0;
    const isComplete = filledColumns === totalColumns;
    const hasGuidance = !!guidanceText.trim();

    const placeholders: Record<string, string> = {
        datetime: 'e.g., Timestamp of the measurement',
        numeric: 'e.g., Temperature in reactor vessel (°C)',
        text: 'e.g., Batch identifier or product code'
    };

    const getDataType = (col: string) => {
        if (currentDataset.datetime_columns.includes(col)) return 'datetime';
        if (currentDataset.numeric_columns.includes(col)) return 'numeric';
        return 'text';
    };

    return (
        <div className="space-y-4">
            {/* Guidance Text */}
            {showGuidance && onGuidanceChange && (
                <div className="pb-4 border-b">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium">
                            Analysis Goals <span className="text-destructive">*</span>
                        </label>
                        {hasGuidance && (
                            <CheckCircle2 className="w-4 h-4 text-primary" />
                        )}
                    </div>
                    <Textarea
                        placeholder="What would you like to analyze? E.g., I want to understand the relationship between temperature and pressure, identify anomalies..."
                        value={guidanceText}
                        onChange={(e) => onGuidanceChange(e.target.value)}
                        className="min-h-[80px] resize-none text-sm"
                    />
                </div>
            )}

            {/* Progress Bar */}
            <div className="py-3 border-b">
                <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-medium">Variable Descriptions</span>
                    <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        isComplete
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                    )}>
                        {filledColumns}/{totalColumns}
                    </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full transition-all duration-300 bg-primary"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                {!isComplete && (
                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        All variables need descriptions
                    </p>
                )}
            </div>

            {/* Column List - Scrollable */}
            <div className="max-h-[280px] overflow-y-auto border rounded-lg">
                <div className="space-y-1 p-2">
                    {currentDataset.column_names.map(col => {
                        const isFilled = !!columnDescriptions[col]?.trim();
                        const dataType = getDataType(col);

                        return (
                            <div
                                key={col}
                                className={cn(
                                    "p-3 rounded-lg transition-colors",
                                    isFilled
                                        ? "bg-accent"
                                        : "hover:bg-muted/50"
                                )}
                            >
                                {/* Header Row */}
                                <div className="flex items-center gap-2 mb-2">
                                    {isFilled ? (
                                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                                    ) : (
                                        <Circle className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                                    )}
                                    <span className="font-mono text-sm font-medium truncate" title={col}>
                                        {col}
                                    </span>
                                    <span className={cn(
                                        "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded",
                                        dataType === 'datetime' && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                                        dataType === 'numeric' && "bg-muted text-muted-foreground",
                                        dataType === 'text' && "bg-muted text-muted-foreground"
                                    )}>
                                        {dataType}
                                    </span>
                                </div>
                                {/* Input */}
                                <Input
                                    placeholder={placeholders[dataType]}
                                    value={columnDescriptions[col] || ''}
                                    onChange={(e) => onDescriptionsChange({
                                        ...columnDescriptions,
                                        [col]: e.target.value
                                    })}
                                    className="h-8 text-sm"
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default ColumnDescriptionEditor;
