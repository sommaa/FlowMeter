/**
 * Root cause settings section for causal analysis configuration.
 *
 * This component provides controls for root cause analysis, which identifies variables
 * that are most likely causing changes in a target variable. It combines multiple
 * statistical methods to compute a composite score for each potential cause:
 *
 * - **Pearson Correlation**: Measures linear relationships
 * - **Cross-Correlation**: Finds optimal lag/lead relationships
 * - **Mutual Information**: Captures non-linear dependencies
 * - **Granger Causality**: Tests if one variable helps predict another
 *
 * The component includes:
 * - Target variable selection
 * - Result plot type selection (ranking, correlation vs lag, method breakdown)
 * - Variable inclusion/exclusion with search filter
 * - Analysis parameter tuning (max lag, top N, min correlation threshold)
 * - Analysis method selection (enable/disable individual methods)
 *
 * @module components/visualizations/sections/RootCauseSettings
 */

import React, { useState, useMemo } from 'react';
import { VisualizationConfig } from '@/types';
import { SearchableSelect, DebouncedInput, Checkbox, Divider } from '@/components/common';
import { Search } from 'lucide-react';

/**
 * Props for the RootCauseSettings component.
 *
 * @interface RootCauseSettingsProps
 * @property {VisualizationConfig} config - Current visualization configuration
 * @property {string[]} numericColumns - Available numeric column names
 * @property {(updates: Partial<VisualizationConfig>) => void} onUpdate - Callback for config updates
 */
interface RootCauseSettingsProps {
    config: VisualizationConfig;
    numericColumns: string[];
    onUpdate: (updates: Partial<VisualizationConfig>) => void;
}

/**
 * Available analysis methods for root cause analysis.
 *
 * Each method provides a different perspective on causal relationships:
 * - **Pearson**: Fast, assumes linear relationships
 * - **Cross-Correlation**: Detects time-lagged relationships
 * - **Mutual Information**: Captures non-linear dependencies
 * - **Granger Causality**: Statistical test for predictive causality
 *
 * @constant {Array<{key: string, label: string}>}
 */
const METHOD_OPTIONS = [
    { key: 'pearson', label: 'Pearson Correlation' },
    { key: 'cross_corr', label: 'Cross-Correlation (Lag)' },
    { key: 'mutual_info', label: 'Mutual Information' },
    { key: 'granger', label: 'Granger Causality' },
];

/**
 * Root cause settings component for causal analysis configuration.
 *
 * Renders only when viz_type is 'root_cause'. Provides comprehensive controls for:
 *
 * **Target Variable**:
 * - Searchable dropdown to select the effect variable
 * - Analysis finds variables that cause changes in this target
 * - Cannot select a variable as both target and candidate cause
 *
 * **Result Plot Type**:
 * - **Score Ranking**: Horizontal bar chart of composite scores
 * - **Correlation vs Lag**: Scatter plot showing correlation strength vs time lag
 * - **Method Breakdown**: Grouped bar chart comparing individual method contributions
 *
 * **Variable Selection**:
 * - Checkbox list of candidate cause variables
 * - Excludes target variable from list
 * - Search filter appears when more than 8 variables available
 * - Select/Deselect All toggle for convenience
 * - Selection logic:
 *   - Empty array = all variables included (default)
 *   - Non-empty array = only listed variables included
 *   - ['__none__'] placeholder = no variables included
 * - Shows selected count (e.g., "Variables (5/12)")
 *
 * **Analysis Parameters**:
 * - **Max Lag**: Maximum time lag to test in samples (cross-correlation)
 *   - Higher = can detect longer delays but slower computation
 * - **Top N Results**: Number of top-ranked variables to return
 *   - Limits output to most significant causes
 * - **Min Correlation**: Threshold to filter weak relationships (0-1)
 *   - Variables below threshold are excluded from results
 *
 * **Analysis Methods**:
 * - Checkboxes to enable/disable each method
 * - At least one method must be enabled
 * - Composite score combines enabled methods
 * - Method weights configured on backend
 *
 * Method Descriptions:
 * - **Pearson Correlation**: Measures linear relationship strength
 *   - Fast, good for linear dependencies
 *   - Range: -1 (negative) to +1 (positive correlation)
 * - **Cross-Correlation**: Finds optimal lag where correlation peaks
 *   - Identifies time delays between cause and effect
 *   - Distinguishes leading (cause) vs lagging (effect) variables
 * - **Mutual Information**: Quantifies information shared between variables
 *   - Captures non-linear relationships
 *   - Always non-negative (0 = independent)
 * - **Granger Causality**: Statistical test for predictive causality
 *   - Tests if past values of X help predict future values of Y
 *   - Results: CAUSE, EFFECT, FEEDBACK, or NONE
 *
 * Composite Score Calculation:
 * - Backend combines enabled methods with configurable weights
 * - Normalizes each method's output to 0-1 scale
 * - Weighted average produces final score
 * - Higher score = stronger evidence of causality
 *
 * @param {RootCauseSettingsProps} props - Component props
 * @returns {JSX.Element | null} Root cause configuration UI or null if not root_cause type
 *
 * @example
 * ```tsx
 * <RootCauseSettings
 *   config={{
 *     viz_type: 'root_cause',
 *     root_cause: {
 *       target_variable: 'Temperature',
 *       include_variables: [], // empty = all included
 *       result_plot: 'ranking',
 *       max_lag: 20,
 *       top_n: 10,
 *       min_correlation: 0.3,
 *       methods: ['pearson', 'cross_corr', 'mutual_info', 'granger']
 *     }
 *   }}
 *   numericColumns={['Temperature', 'Pressure', 'Flow', 'Level', 'Speed']}
 *   onUpdate={(updates) => updateConfig(updates)}
 * />
 * ```
 */
export const RootCauseSettings: React.FC<RootCauseSettingsProps> = ({ config, numericColumns, onUpdate }) => {
    if (config.viz_type !== 'root_cause') return null;

    const rc = config.root_cause;
    const [variableFilter, setVariableFilter] = useState('');

    const updateRC = (updates: Partial<typeof rc>) => {
        onUpdate({ root_cause: { ...rc, ...updates } });
    };

    const targetOptions = numericColumns.map(col => ({ value: col, label: col }));

    const toggleMethod = (method: string) => {
        const methods = rc.methods.includes(method)
            ? rc.methods.filter(m => m !== method)
            : [...rc.methods, method];
        updateRC({ methods });
    };

    // Available variables = all numeric columns except the target
    const availableVariables = useMemo(() =>
        numericColumns.filter(col => col !== rc.target_variable),
        [numericColumns, rc.target_variable]
    );

    // Filtered by search
    const filteredVariables = useMemo(() => {
        if (!variableFilter.trim()) return availableVariables;
        const lower = variableFilter.toLowerCase();
        return availableVariables.filter(col => col.toLowerCase().includes(lower));
    }, [availableVariables, variableFilter]);

    // Which variables are included (if include_variables is empty, all are included)
    const includedVars = rc.include_variables || [];
    const isAllSelected = includedVars.length === 0 || includedVars.length === availableVariables.length;

    const toggleVariable = (col: string) => {
        // If currently "all selected" (empty array), switch to explicit list minus the toggled one
        if (includedVars.length === 0) {
            const newList = availableVariables.filter(c => c !== col);
            updateRC({ include_variables: newList });
        } else {
            const isIncluded = includedVars.includes(col);
            if (isIncluded) {
                const newList = includedVars.filter(c => c !== col);
                updateRC({ include_variables: newList.length === 0 ? [] : newList });
            } else {
                const newList = [...includedVars, col];
                // If all are now selected, reset to empty (= all)
                if (newList.length === availableVariables.length) {
                    updateRC({ include_variables: [] });
                } else {
                    updateRC({ include_variables: newList });
                }
            }
        }
    };

    const toggleSelectAll = () => {
        if (isAllSelected) {
            // Deselect all
            updateRC({ include_variables: ['__none__'] }); // Placeholder to mean "none selected"
        } else {
            // Select all
            updateRC({ include_variables: [] });
        }
    };

    const isVarIncluded = (col: string) => {
        if (includedVars.length === 0) return true; // empty = all
        return includedVars.includes(col);
    };

    const selectedCount = includedVars.length === 0
        ? availableVariables.length
        : includedVars.filter(v => v !== '__none__').length;

    return (
        <div className="space-y-4">
            <Divider />
            <h4 className="text-sm font-medium text-foreground">Root Cause Analysis</h4>

            {/* Target Variable */}
            <SearchableSelect
                label="Target Variable"
                options={targetOptions}
                value={rc.target_variable || ''}
                onChange={(e) => updateRC({ target_variable: e.target.value })}
                placeholder="Select target variable..."
            />

            {/* Result Plot Type */}
            <SearchableSelect
                label="Result Plot"
                options={[
                    { value: 'ranking', label: 'Score Ranking' },
                    { value: 'correlation_lag', label: 'Correlation vs Lag' },
                    { value: 'method_breakdown', label: 'Method Breakdown' },
                ]}
                value={rc.result_plot || 'ranking'}
                onChange={(e) => updateRC({ result_plot: e.target.value as 'ranking' | 'correlation_lag' | 'method_breakdown' })}
            />

            <Divider />

            {/* Variable Selection with checkboxes */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Variables ({selectedCount}/{availableVariables.length})
                    </p>
                    <button
                        onClick={toggleSelectAll}
                        className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                        {isAllSelected ? 'Deselect All' : 'Select All'}
                    </button>
                </div>

                {/* Search filter */}
                {availableVariables.length > 8 && (
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            value={variableFilter}
                            onChange={(e) => setVariableFilter(e.target.value)}
                            placeholder="Filter variables..."
                            className="w-full pl-7 pr-3 py-1.5 text-xs bg-muted/30 rounded border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                    </div>
                )}

                {/* Checkbox list */}
                <div className="max-h-48 overflow-y-auto space-y-0.5 scrollbar-thin">
                    {filteredVariables.map(col => (
                        <label
                            key={col}
                            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/30 cursor-pointer transition-colors"
                        >
                            <Checkbox
                                id={`rc-var-${col}`}
                                checked={isVarIncluded(col)}
                                onChange={() => toggleVariable(col)}
                            />
                            <span className="text-xs text-foreground truncate" title={col}>
                                {col}
                            </span>
                        </label>
                    ))}
                    {filteredVariables.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                            No matching variables
                        </p>
                    )}
                </div>
            </div>

            <Divider />

            {/* Analysis Parameters */}
            <div className="grid grid-cols-2 gap-3">
                <DebouncedInput
                    label="Max Lag (Samples)"
                    type="number"
                    value={rc.max_lag.toString()}
                    onChange={(val) => {
                        const num = parseInt(val);
                        if (!isNaN(num) && num > 0) updateRC({ max_lag: num });
                    }}
                />

                <DebouncedInput
                    label="Top N Results"
                    type="number"
                    value={rc.top_n.toString()}
                    onChange={(val) => {
                        const num = parseInt(val);
                        if (!isNaN(num) && num > 0) updateRC({ top_n: num });
                    }}
                />
            </div>

            <DebouncedInput
                label="Min Correlation (0–1)"
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={rc.min_correlation.toString()}
                onChange={(val) => {
                    const num = parseFloat(val);
                    if (!isNaN(num) && num >= 0 && num <= 1) updateRC({ min_correlation: num });
                }}
            />

            {/* Analysis Methods */}
            <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Analysis Methods</p>
                {METHOD_OPTIONS.map(opt => (
                    <div key={opt.key} className="flex items-center space-x-2">
                        <Checkbox
                            id={`rc-method-${opt.key}`}
                            checked={rc.methods.includes(opt.key)}
                            onChange={() => toggleMethod(opt.key)}
                        />
                        <label
                            htmlFor={`rc-method-${opt.key}`}
                            className="text-sm font-medium leading-none cursor-pointer"
                        >
                            {opt.label}
                        </label>
                    </div>
                ))}
            </div>
        </div>
    );
};
