/**
 * Regression settings section for regression analysis configuration.
 *
 * This comprehensive component provides all controls for configuring regression models:
 * - Model type selection (linear, ridge, lasso, elastic net, random forest, custom)
 * - Predictor variable selection
 * - Custom formula editor for non-linear models
 * - Regularization parameters (alpha, L1 ratio)
 * - Polynomial degree for univariate models
 * - Robust regression with multiple loss functions
 * - Outlier removal with IQR filtering
 * - Confidence interval display
 * - Random forest hyperparameters
 * - Regression line color customization
 *
 * The component adapts its UI based on the selected model type, showing only relevant
 * options for each model. It includes helpful tooltips, warnings, and informational
 * messages to guide users through complex regression configurations.
 *
 * @module components/visualizations/sections/RegressionSettings
 */

import React from 'react';
import {
    Info,
    Copy,
    Maximize2,
} from 'lucide-react';
import {
    DebouncedInput,
    Checkbox,
    NumberInput,
    Select,
    MultiSelect,
    Button,
    TextArea,
    DebouncedColorPicker
} from '@/components/common';
import { VisualizationConfig } from '@/types';
import { Divider } from '@/components/common';

/**
 * Props for the RegressionSettings component.
 *
 * @interface RegressionSettingsProps
 * @property {VisualizationConfig} config - Current visualization configuration
 * @property {string[]} numericColumns - Available numeric column names for predictors
 * @property {(updates: Partial<VisualizationConfig>) => void} onUpdate - Callback for config updates
 * @property {() => void} onOpenFormula - Callback to open formula editor modal
 * @property {string} [regressionEquation] - Calculated regression equation from backend (optional)
 */
interface RegressionSettingsProps {
    config: VisualizationConfig;
    numericColumns: string[];
    onUpdate: (updates: Partial<VisualizationConfig>) => void;
    onOpenFormula: () => void;
    regressionEquation?: string;
}

/**
 * Regression settings component for comprehensive regression configuration.
 *
 * Renders only when viz_type is 'regression'. Provides a full suite of regression
 * options organized into logical sections:
 *
 * **Model Type Selection**:
 * - Linear Regression: Standard OLS regression
 * - Ridge Regression (L2): Penalizes large coefficients, reduces overfitting
 * - Lasso Regression (L1): Performs feature selection by shrinking coefficients to zero
 * - Elastic Net: Combines Ridge and Lasso penalties
 * - Random Forest: Ensemble method with decision trees
 * - Custom Formula: User-defined non-linear model with scipy curve_fit
 *
 * **Robust Regression** (Linear and Custom models):
 * - Loss Function: Controls sensitivity to outliers
 *   - linear: Standard least squares (sensitive to outliers)
 *   - soft_l1, huber: Moderate robustness
 *   - cauchy, arctan: High robustness to extreme outliers
 * - Method: Optimization algorithm (trf, dogbox, lm)
 * - Levenberg-Marquardt (lm) only supports linear loss
 *
 * **Predictor Selection** (Standard models):
 * - Multi-select dropdown for choosing X variables
 * - Empty selection = simple regression vs Index (time)
 * - Single predictor = univariate regression
 * - Multiple predictors = multivariate regression
 *
 * **Custom Formula** (Custom model):
 * - Formula editor button (opens modal)
 * - Parameter names (comma-separated, e.g., "a, b, c")
 * - Initial guesses for optimization (comma-separated numbers)
 * - Lower/upper bounds for parameters (use "inf" or "-inf" for unbounded)
 * - Syntax: x for x-axis, col['Name'] for other variables, standard math functions
 *
 * **Regularization** (Ridge, Lasso, Elastic Net):
 * - Alpha: Regularization strength (higher = simpler model)
 * - L1 Ratio (Elastic Net only): Balance between L1 and L2 (0=Ridge, 1=Lasso)
 *
 * **Polynomial Degree**:
 * - Available for univariate linear models only
 * - Range: 1-5 (higher degrees risk overfitting)
 * - Disabled for multivariate models to prevent overfitting
 * - Not available for Random Forest or Custom models
 *
 * **Outlier Removal**:
 * - Optional IQR-based outlier filtering
 * - IQR Multiplier: Controls sensitivity (default 1.5)
 * - Formula: Outliers are outside [Q1 - IQR×M, Q3 + IQR×M]
 * - Higher multiplier = keep more data
 *
 * **Random Forest Settings**:
 * - n_estimators: Number of trees (10-1000, default 100)
 * - max_depth: Maximum tree depth (1-100, default 20)
 * - min_samples_split: Minimum samples to split node (2-20, default 10)
 * - min_samples_leaf: Minimum samples in leaf (1-20, default 4)
 *
 * **Display Options**:
 * - Show Confidence Interval: Toggle 95% confidence band
 * - Regression Line Color: Custom color picker
 * - Calculated Equation: Read-only display with copy button
 *
 * Clears saved_model_name when model_type changes to prevent inconsistent states.
 *
 * @param {RegressionSettingsProps} props - Component props
 * @returns {JSX.Element | null} Regression configuration UI or null if not regression type
 *
 * @example
 * ```tsx
 * <RegressionSettings
 *   config={{
 *     viz_type: 'regression',
 *     regression: {
 *       model_type: 'ridge',
 *       predictors: ['Temperature', 'Pressure'],
 *       alpha: 1.5,
 *       degree: 1,
 *       remove_outliers: true,
 *       iqr_multiplier: 1.5,
 *       show_confidence_interval: true,
 *       line_color: '#f59e0b'
 *     }
 *   }}
 *   numericColumns={['Temperature', 'Pressure', 'Flow', 'Level']}
 *   onUpdate={(updates) => updateConfig(updates)}
 *   onOpenFormula={() => setFormulaModalOpen(true)}
 *   regressionEquation="y = 2.5*Temperature + 0.3*Pressure + 15.2"
 * />
 * ```
 */
export const RegressionSettings: React.FC<RegressionSettingsProps> = ({
    config,
    numericColumns,
    onUpdate,
    onOpenFormula,
    regressionEquation
}) => {
    // Only for "regression" visualization type
    if (config.viz_type !== 'regression') return null;

    const isMultiPredictor = (config.regression.predictors || []).length > 1;

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-slate-600 dark:text-gray-400">
                    Regression Model
                </h4>
                <div className="h-px bg-border flex-1" />
            </div>

            {/* 1. Model Type Selection */}
            <Select
                label="Model Type"
                value={config.regression.model_type || 'linear'}
                onChange={(e) => onUpdate({ regression: { ...config.regression, model_type: e.target.value }, saved_model_name: undefined })}
                options={[
                    { value: 'linear', label: 'Linear Regression' },
                    { value: 'ridge', label: 'Ridge Regression (L2)' },
                    { value: 'lasso', label: 'Lasso Regression (L1)' },
                    { value: 'elastic_net', label: 'Elastic Net' },
                    { value: 'random_forest', label: 'Random Forest' },
                    { value: 'custom', label: 'Custom Formula' }
                ]}
            />

            {/* Robust Regression Options: visible for Custom Formula OR Standard Linear (not Ridge/Lasso/RF) */}
            {((config.regression.model_type === 'custom') || (config.regression.model_type === 'linear' && !isMultiPredictor)) && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                    <Select
                        label="Loss Function"
                        value={config.regression.custom_loss || 'linear'}
                        onChange={(e) => onUpdate({ regression: { ...config.regression, custom_loss: e.target.value } })}
                        options={[
                            { value: 'linear', label: 'Linear (Standard)' },
                            { value: 'soft_l1', label: 'Soft L1' },
                            { value: 'huber', label: 'Huber' },
                            { value: 'cauchy', label: 'Cauchy' },
                            { value: 'arctan', label: 'Arctan' },
                        ]}
                        className="text-xs"
                    />
                    <Select
                        label="Method"
                        value={config.regression.custom_method || 'trf'}
                        onChange={(e) => onUpdate({ regression: { ...config.regression, custom_method: e.target.value } })}
                        options={[
                            { value: 'trf', label: 'Trust Region (trf)' },
                            { value: 'dogbox', label: 'Dogbox' },
                            { value: 'lm', label: 'Levenberg-Marquardt' },
                        ]}
                        className="text-xs"
                        disabled={config.regression.custom_loss !== 'linear' && config.regression.custom_method === 'lm'} // LM only supports linear loss in scipy < 1.x (actually check implementation: lm doesn't support loss at all)
                    />
                </div>
            )}

            {/* Warning for LM + Non-linear Loss */}
            {config.regression.custom_loss !== 'linear' && config.regression.custom_method === 'lm' && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                        Levenberg-Marquardt does not support non-linear loss functions. It will automatically fallback to 'trf'.
                    </span>
                </div>
            )}

            {(config.regression.custom_loss && config.regression.custom_loss !== 'linear') && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                        Using <strong>Robust Regression</strong>. This minimizes a {config.regression.custom_loss} loss function instead of standard squared error, making it less sensitive to outliers.
                    </span>
                </div>
            )}

            <Divider />

            {/* 2. Data Selection Section */}
            {config.regression.model_type === 'custom' ? (
                /* Custom Formula: Show formula editor */
                <div className="space-y-3">
                    <div className="p-2 bg-muted/30 rounded border border-border space-y-2">
                        <div className="space-y-1">
                            <label className="block text-sm font-medium text-slate-700 dark:text-gray-300">
                                Custom Formula
                            </label>
                            <button
                                type="button"
                                onClick={onOpenFormula}
                                className="w-full text-left p-3 bg-muted/50 dark:bg-muted/30 border border-border rounded-lg hover:border-muted-foreground/30 transition-colors group"
                            >
                                {config.regression.custom_formula ? (
                                    <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3 overflow-hidden">
                                        {config.regression.custom_formula}
                                    </pre>
                                ) : (
                                    <div className="text-xs text-muted-foreground text-center">
                                        Click to edit formula (e.g., a * exp(-b * x) + c)
                                    </div>
                                )}
                                <div className="flex items-center gap-1 mt-2 text-xs text-primary/80 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Maximize2 className="w-3 h-3" />
                                    <span>Click to expand</span>
                                </div>
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <DebouncedInput
                                label="Parameters"
                                placeholder="a, b, c"
                                value={config.regression.custom_params || ''}
                                onChange={(val) => onUpdate({ regression: { ...config.regression, custom_params: val } })}
                                debounceMs={500}
                                className="font-mono text-xs"
                            />
                            <DebouncedInput
                                label="Initial Guesses"
                                placeholder="1, 0, 0"
                                value={config.regression.custom_initial_guesses || ''}
                                onChange={(val) => onUpdate({ regression: { ...config.regression, custom_initial_guesses: val } })}
                                debounceMs={500}
                                className="font-mono text-xs"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <DebouncedInput
                                label="Lower Bounds"
                                placeholder="0, -inf, 0"
                                value={config.regression.custom_bounds_lower || ''}
                                onChange={(val) => onUpdate({ regression: { ...config.regression, custom_bounds_lower: val } })}
                                debounceMs={500}
                                className="font-mono text-xs"
                            />
                            <DebouncedInput
                                label="Upper Bounds"
                                placeholder="inf, 1, 100"
                                value={config.regression.custom_bounds_upper || ''}
                                onChange={(val) => onUpdate({ regression: { ...config.regression, custom_bounds_upper: val } })}
                                debounceMs={500}
                                className="font-mono text-xs"
                            />
                        </div>

                        <p className="text-[10px] text-muted-foreground">
                            Use <code className="bg-muted px-1 rounded">x</code> for X-axis,
                            <code className="bg-muted px-1 rounded mx-1">col['Name']</code> for other variables.
                            Math: sin, cos, exp, log, sqrt, power, etc.
                            Bounds: use <code className="bg-muted px-1 rounded">-inf</code>/<code className="bg-muted px-1 rounded">inf</code> for unbounded.
                        </p>
                    </div>
                </div>
            ) : (
                /* Standard models: Show Predictors */
                <div className="space-y-1">
                    <span className="block text-sm font-medium text-slate-700 dark:text-gray-300">
                        Predictors (X)
                    </span>
                    <MultiSelect
                        options={numericColumns}
                        value={config.regression.predictors || []}
                        onChange={(value) => onUpdate({ regression: { ...config.regression, predictors: value } })}
                    />
                    <p className="text-xs text-slate-500 dark:text-gray-400">
                        Select variables to predict the target. Leave empty for Simple Regression vs Index.
                    </p>
                </div>
            )}

            {/* 3. Model-Specific Parameters */}
            {(config.regression.model_type === 'ridge' || config.regression.model_type === 'lasso' || config.regression.model_type === 'elastic_net') && (
                <div className="mt-2">
                    <NumberInput
                        label="Regularization Strength (Alpha)"
                        step={0.1}
                        min={0}
                        value={config.regression.alpha ?? 1.0}
                        onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            const rounded = isNaN(val) ? undefined : parseFloat(val.toFixed(6));
                            onUpdate({ regression: { ...config.regression, alpha: rounded } });
                        }}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                        Higher alpha = stronger regularization (simpler model).
                    </p>
                </div>
            )}

            {config.regression.model_type === 'elastic_net' && (
                <div className="mt-2">
                    <NumberInput
                        label="L1 Ratio"
                        step={0.1}
                        min={0}
                        max={1}
                        value={config.regression.l1_ratio ?? 0.5}
                        onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            const rounded = isNaN(val) ? undefined : parseFloat(val.toFixed(2));
                            onUpdate({ regression: { ...config.regression, l1_ratio: rounded } });
                        }}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                        0 = Ridge, 1 = Lasso.
                    </p>
                </div>
            )}

            {/* Polynomial Degree - only for linear models, not RF or Custom */}
            {!['random_forest', 'custom'].includes(config.regression.model_type || 'linear') && (
                <div className="space-y-2">
                    <NumberInput
                        label="Polynomial Degree"
                        min={1}
                        max={5}
                        value={config.regression.degree}
                        onChange={(e) =>
                            onUpdate({ regression: { ...config.regression, degree: parseInt(e.target.value) } })
                        }
                    />

                    {/* Warning for High Degree + Multi-Predictor */}
                    {isMultiPredictor && config.regression.degree > 1 && (
                        <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>
                                <strong>Warning:</strong> High degrees with multiple variables create many interaction terms and may lead to overfitting.
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* 4. Options */}
            <label className="flex items-center gap-2">
                <Checkbox
                    checked={config.regression.remove_outliers}
                    onChange={(e) =>
                        onUpdate({ regression: { ...config.regression, remove_outliers: e.target.checked } })
                    }
                    className="border-input"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                    Remove Outliers
                </span>
            </label>
            {config.regression.remove_outliers && (
                <div className="ml-6 mt-1">
                    <DebouncedInput
                        type="number"
                        label="IQR Multiplier"
                        value={config.regression.iqr_multiplier?.toString() ?? '1.5'}
                        onChange={(value) => {
                            if (value === '' || value === null) return;
                            const val = parseFloat(value);
                            if (isNaN(val)) return;
                            const rounded = Math.round(val * 10) / 10;
                            onUpdate({ regression: { ...config.regression, iqr_multiplier: rounded } });
                        }}
                        debounceMs={500}
                        className="w-24"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                        Bounds = Q1/Q3 ± IQR × multiplier. Higher = keep more data.
                    </p>
                </div>
            )}

            {/* Calculated Formula */}
            {regressionEquation && (
                <div className="pt-2">
                    <div className="flex items-center justify-between mb-1">
                        <span className="block text-sm font-medium text-slate-700 dark:text-gray-300">
                            Regression Equation
                        </span>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            icon={<Copy className="w-3 h-3" />}
                            onClick={() => {
                                navigator.clipboard.writeText(regressionEquation);
                            }}
                            title="Copy to clipboard"
                        >
                            Copy
                        </Button>
                    </div>
                    <TextArea
                        readOnly
                        value={regressionEquation}
                        className="text-xs font-mono h-24 bg-muted/50 break-all whitespace-pre-wrap overflow-y-auto"
                    />
                </div>
            )}
            <label className="flex items-center gap-2 mt-2">
                <Checkbox
                    checked={config.regression.show_confidence_interval !== false}
                    onChange={(e) =>
                        onUpdate({ regression: { ...config.regression, show_confidence_interval: e.target.checked } })
                    }
                    className="border-input"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                    Show Confidence Interval
                </span>
            </label>

            <div className="flex items-center justify-between text-sm bg-muted/50 p-1 rounded mt-2">
                <span className="text-foreground font-medium ml-1">
                    Regression Line
                </span>
                <DebouncedColorPicker
                    value={config.regression.line_color || '#f59e0b'}
                    onChange={(value: string) =>
                        onUpdate({ regression: { ...config.regression, line_color: value } })
                    }
                    className="w-6 h-6 p-0 border-0 rounded"
                    title="Regression Line Color"
                />
            </div>

            {config.regression.model_type === 'random_forest' && (
                <div className="space-y-3 pl-2 border-l-2 border-primary/20 mt-2">
                    <h5 className="text-xs font-semibold text-muted-foreground uppercase">
                        Random Forest Settings
                    </h5>
                    <div className="grid grid-cols-2 gap-2">
                        <NumberInput
                            label="Trees (n_estimators)"
                            min={10}
                            max={1000}
                            step={10}
                            value={config.regression.rf_n_estimators ?? 100}
                            onChange={(e) => onUpdate({ regression: { ...config.regression, rf_n_estimators: parseInt(e.target.value) || undefined } })}
                        />
                        <NumberInput
                            label="Max Depth"
                            min={1}
                            max={100}
                            value={config.regression.rf_max_depth ?? 20}
                            onChange={(e) => onUpdate({ regression: { ...config.regression, rf_max_depth: parseInt(e.target.value) || undefined } })}
                        />
                        <NumberInput
                            label="Min Split"
                            min={2}
                            max={20}
                            value={config.regression.rf_min_samples_split ?? 10}
                            onChange={(e) => onUpdate({ regression: { ...config.regression, rf_min_samples_split: parseInt(e.target.value) || undefined } })}
                        />
                        <NumberInput
                            label="Min Leaf"
                            min={1}
                            max={20}
                            value={config.regression.rf_min_samples_leaf ?? 4}
                            onChange={(e) => onUpdate({ regression: { ...config.regression, rf_min_samples_leaf: parseInt(e.target.value) || undefined } })}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
