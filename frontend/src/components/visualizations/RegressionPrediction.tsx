/**
 * Regression prediction panel for interactive model evaluation.
 *
 * This component provides an interface for making predictions using trained regression models.
 * It supports multiple model types (linear, polynomial, random forest, custom), allows users
 * to input predictor values, and displays the predicted output. The panel also includes
 * model persistence features (save, load, delete).
 *
 * Key Features:
 * - Input fields for all model predictors with dynamic type handling
 * - Real-time prediction for simple models (linear, polynomial)
 * - Server-side prediction for complex models (random forest, custom)
 * - Datetime input support with relative date calculations
 * - Model management: save current configuration, load saved models, delete models
 * - Visual feedback with animated result display
 * - Auto-sync with saved model configurations
 *
 * Model Types:
 * - **Linear**: y = intercept + Σ(coefficient_i * predictor_i)
 * - **Polynomial**: y = intercept + Σ(coefficient_i * x^i)
 * - **Random Forest**: Server-side prediction required
 * - **Custom**: User-defined formula with parameters, server-side prediction
 *
 * Persistence:
 * - Saved models stored on backend with configuration snapshots
 * - Loading a saved model restores model_type and custom formula parameters
 * - User retains control over axis configuration and predictors
 *
 * @module components/visualizations/RegressionPrediction
 */

import React, { useState, useEffect } from 'react';
import { Calculator, Loader2, Save, Upload, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Card, Button, Select } from '@/components/common';
import { RegressionModel, VisualizationConfig, GlobalVariable } from '@/types';
import axios from 'axios';
// import { API_BASE_URL } from '@/config';
const API_BASE_URL = '/api/v1';

/**
 * Props for the RegressionPrediction component.
 *
 * @interface RegressionPredictionProps
 * @property {RegressionModel} model - Trained regression model with coefficients and metadata
 * @property {string} datasetId - Current dataset identifier
 * @property {VisualizationConfig} config - Visualization configuration containing regression settings
 * @property {GlobalVariable[]} globalVariables - Global variables available for prediction
 * @property {(updates: Partial<VisualizationConfig>) => void} [onConfigUpdate] - Callback for config updates (optional)
 */
interface RegressionPredictionProps {
    model: RegressionModel;
    datasetId: string;
    config: VisualizationConfig;
    globalVariables: GlobalVariable[];
    onConfigUpdate?: (updates: Partial<VisualizationConfig>) => void;
}

/**
 * Saved regression model metadata.
 *
 * Represents a persisted model configuration that can be loaded later.
 *
 * @interface SavedModel
 * @property {string} name - User-defined model name
 * @property {string} type - Model type (linear, polynomial, random_forest, custom)
 * @property {string} created - ISO timestamp of model creation
 * @property {string[]} predictors - List of predictor variable names
 * @property {string} [custom_formula] - Custom formula expression (for custom models)
 * @property {string} [custom_params] - Custom parameter names (for custom models)
 * @property {string} [custom_initial_guesses] - Initial parameter guesses (for custom models)
 */
interface SavedModel {
    name: string;
    type: string;
    created: string;
    predictors: string[];
    // Custom model metadata
    custom_formula?: string;
    custom_params?: string;
    custom_initial_guesses?: string;
}

/**
 * Regression prediction panel component.
 *
 * Renders an interactive panel for evaluating regression models. Users can input values
 * for predictor variables and see the predicted output. The panel supports both client-side
 * prediction (for simple linear/polynomial models) and server-side prediction (for complex
 * models like random forest and custom formulas).
 *
 * Prediction Behavior:
 * - Linear/Polynomial: Auto-calculates as user types (client-side)
 * - Random Forest: Requires "Calculate" button click (server-side)
 * - Custom Formula: Requires "Calculate" button click (server-side)
 * - Saved Models: Requires "Calculate" button click (server-side)
 *
 * Input Handling:
 * - Numeric predictors: Standard number input
 * - Datetime predictors: Datetime-local input with automatic conversion to days
 * - Reference date used for relative datetime calculations (if available)
 * - Fallback to Unix epoch for datetime conversion if no reference date
 *
 * Model Management:
 * - Load Model: Select from dropdown to load saved configuration
 * - Save as New: Create new saved model from current configuration
 * - Delete: Remove saved model from backend storage
 * - Auto-sync: Model type and custom parameters sync when saved model selected
 *
 * State Management:
 * - Input values persist when switching between models (if predictor names match)
 * - Prediction clears when inputs change or model switches
 * - Error states displayed when server-side prediction fails
 *
 * @param {RegressionPredictionProps} props - Component props
 * @returns {JSX.Element} Interactive prediction panel with inputs and result display
 *
 * @example
 * ```tsx
 * <RegressionPrediction
 *   model={{
 *     type: 'linear',
 *     intercept: 5.2,
 *     coefficients: [2.1, -0.3],
 *     predictors: ['Temperature', 'Pressure'],
 *     equation: 'y = 2.1*Temperature - 0.3*Pressure + 5.2'
 *   }}
 *   datasetId="dataset-123"
 *   config={visualizationConfig}
 *   globalVariables={[]}
 *   onConfigUpdate={(updates) => updateConfig(updates)}
 * />
 * ```
 */
export const RegressionPrediction: React.FC<RegressionPredictionProps> = ({ model, datasetId, config, globalVariables, onConfigUpdate }) => {
    const [inputs, setInputs] = useState<Record<string, number>>({});
    const [prediction, setPrediction] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Persistence State
    const [savedModels, setSavedModels] = useState<SavedModel[]>([]);
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [newModelName, setNewModelName] = useState('');
    const [savingModel, setSavingModel] = useState(false);

    // Initialize inputs from model prop (after API refresh)
    useEffect(() => {
        setInputs(prev => {
            const newInputs: Record<string, number> = {};
            model.predictors.forEach(p => {
                if (prev[p] !== undefined) {
                    newInputs[p] = prev[p];
                } else {
                    newInputs[p] = 0;
                }
            });
            return newInputs;
        });
        setPrediction(null);
        setError(null);
    }, [model]);

    // Immediately sync inputs when saved model changes (before API refresh completes)
    useEffect(() => {
        if (!config.saved_model_name || savedModels.length === 0) return;

        const savedModel = savedModels.find(m => m.name === config.saved_model_name);
        if (!savedModel || !savedModel.predictors) return;

        // Update inputs immediately based on saved model's predictors
        setInputs(prev => {
            const newInputs: Record<string, number> = {};
            savedModel.predictors.forEach(p => {
                if (prev[p] !== undefined) {
                    newInputs[p] = prev[p];
                } else {
                    newInputs[p] = 0;
                }
            });
            return newInputs;
        });
        setPrediction(null);
    }, [config.saved_model_name, savedModels]);

    // Fetch saved models
    const fetchSavedModels = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/models/list`);
            if (response.data.success) {
                setSavedModels(response.data.data);
            }
        } catch (err) {
            console.error("Failed to fetch models:", err);
        }
    };

    useEffect(() => {
        fetchSavedModels();
    }, []);

    const handleSaveModel = async () => {
        if (!newModelName.trim()) return;
        setSavingModel(true);
        try {
            const response = await axios.post(`${API_BASE_URL}/models/save`, {
                dataset_id: datasetId,
                config: config,
                inputs: inputs, // Optional, but sent for logging if needed
                name: newModelName
            });
            if (response.data.success) {
                setShowSaveInput(false);
                setNewModelName('');
                fetchSavedModels();
                // Select the new model?
                if (onConfigUpdate) {
                    onConfigUpdate({ saved_model_name: response.data.data.name });
                }
            }
        } catch (err: any) {
            console.error("Failed to save model:", err);
            setError(err.response?.data?.detail || "Failed to save model");
        } finally {
            setSavingModel(false);
        }
    };



    const handleDeleteModel = async (name: string) => {
        if (!confirm(`Are you sure you want to delete model "${name}"?`)) return;
        try {
            const response = await axios.delete(`${API_BASE_URL}/models/delete/${name}`);
            if (response.data.success) {
                fetchSavedModels();
                if (config.saved_model_name === name && onConfigUpdate) {
                    onConfigUpdate({ saved_model_name: undefined });
                }
            }
        } catch (err) {
            console.error("Failed to delete model:", err);
        }
    };

    // Calculate prediction whenever inputs change (Linear/Poly)
    useEffect(() => {
        if (!model) return;

        if (model.type === 'random_forest' || model.type === 'custom' || config.saved_model_name) {
            // RF or Saved Model requires server-side calculation.
            // We wait for the user to explicitly click "Calculate" for efficiency.
            setPrediction(null);
            return;
        }

        let y = model.intercept;

        if (model.type === 'polynomial') {
            const predictorName = model.predictors[0] || 'x';
            const x = inputs[predictorName] || 0;
            model.coefficients.forEach((coeff, index) => {
                const power = index + 1;
                y += coeff * Math.pow(x, power);
            });
        } else {
            // Linear (Single or Multi)
            model.predictors.forEach((predictor, index) => {
                const val = inputs[predictor] || 0;
                const weight = model.coefficients[index] || 0;
                y += weight * val;
            });
        }

        setPrediction(y);
    }, [inputs, model, config.saved_model_name]);

    const handlePredictServerSide = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.post(`${API_BASE_URL}/visualizations/predict`, {
                dataset_id: datasetId,
                config: config,
                inputs: inputs,
                global_variables: globalVariables
            });

            if (response.data.success) {
                setPrediction(response.data.data.prediction);
            }
        } catch (err: any) {
            console.error("Prediction failed:", err);
            setError("Calculation failed");
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (predictor: string, value: string) => {
        const numVal = parseFloat(value);
        setInputs(prev => ({
            ...prev,
            [predictor]: isNaN(numVal) ? 0 : numVal
        }));
    };



    // Auto-sync: When a saved model is selected, only sync model_type and custom fields
    // DO NOT change axis or predictors - let the user control those
    useEffect(() => {
        if (!config.saved_model_name || savedModels.length === 0 || !onConfigUpdate) return;

        // Find the currently selected saved model
        const savedModel = savedModels.find(m => m.name === config.saved_model_name);
        if (!savedModel) return;

        // Only sync model_type and custom formula fields
        if (config.regression.model_type !== savedModel.type ||
            (savedModel.type === 'custom' && config.regression.custom_formula !== savedModel.custom_formula)) {
            const updates: any = {
                regression: {
                    ...config.regression,
                    model_type: savedModel.type,
                    custom_formula: savedModel.type === 'custom' ? savedModel.custom_formula : undefined,
                    custom_params: savedModel.type === 'custom' ? savedModel.custom_params : undefined,
                    custom_initial_guesses: savedModel.type === 'custom' ? savedModel.custom_initial_guesses : undefined
                }
            };
            onConfigUpdate(updates);
        }
        // Sync only when the selected saved model (or the list) changes; depending on
        // config.regression would snap the user's manual model_type edits back.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.saved_model_name, savedModels, onConfigUpdate]);

    return (
        <Card className="mt-4 p-4 border border-border bg-card/50">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-primary/10 rounded-md">
                    <Calculator className="w-4 h-4 text-primary" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-foreground">Prediction Model</h3>
                    <p className="text-xs text-muted-foreground">
                        {config.saved_model_name
                            ? `Using saved model: ${config.saved_model_name}`
                            : "Predict values using the current configuration"}
                    </p>
                </div>
            </div>

            {/* Model Management Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 mb-6 bg-muted/30 rounded-lg border border-border/50">
                <div className="flex-1 w-full sm:w-auto">
                    <div className="flex items-center gap-2">
                        <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="min-w-[200px] flex-1">
                            <Select
                                value={config.saved_model_name || "__current__"}
                                onChange={(e) => {
                                    // Handle Select event structure
                                    const val = e.target.value;
                                    if (onConfigUpdate) {
                                        onConfigUpdate({
                                            saved_model_name: val === "__current__" ? undefined : val
                                        });
                                    }
                                }}
                                options={[
                                    { value: "__current__", label: "Current Configuration (Unsaved)" },
                                    ...savedModels.map(m => ({
                                        value: m.name,
                                        label: `${m.name} (${m.type})`
                                    }))
                                ]}
                                className="h-9"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    {/* Delete Current Model */}
                    {config.saved_model_name && (
                        <Button
                            size="sm"
                            variant="danger"
                            className="h-9 px-3"
                            onClick={() => handleDeleteModel(config.saved_model_name!)}
                            title="Delete this saved model"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                        </Button>
                    )}

                    {/* Save New Model */}
                    {!showSaveInput ? (
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-9 px-3 border-primary/20 hover:bg-primary/10 hover:text-primary transition-colors"
                            onClick={() => setShowSaveInput(true)}
                        >
                            <Save className="w-4 h-4 mr-2" />
                            Save as New
                        </Button>
                    ) : (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300 bg-background p-1 rounded-md border border-input shadow-sm">
                            <input
                                className="h-8 w-40 text-sm px-2 bg-transparent focus:outline-none placeholder:text-muted-foreground/50"
                                placeholder="Enter model name..."
                                value={newModelName}
                                onChange={e => setNewModelName(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveModel();
                                    if (e.key === 'Escape') setShowSaveInput(false);
                                }}
                            />
                            <div className="flex items-center border-l border-border pl-1">
                                <Button
                                    size="sm"
                                    className="h-7 px-3 text-xs"
                                    onClick={handleSaveModel}
                                    disabled={savingModel || !newModelName}
                                >
                                    {savingModel ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 ml-1 text-muted-foreground hover:text-foreground"
                                    onClick={() => setShowSaveInput(false)}
                                >
                                    <span className="sr-only">Cancel</span>
                                    <span aria-hidden="true" className="text-lg leading-none">&times;</span>
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Prediction Inputs & Result */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Inputs Section */}
                <div className="md:col-span-8 space-y-4">
                    <h4 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">Model Inputs</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {model.predictors.map((predictor, index) => (
                            <div key={predictor} className="space-y-1.5">
                                <label
                                    htmlFor={`pred-${predictor}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    {predictor === 'x' ? 'Input Value (X)' : predictor}
                                </label>
                                {model.predictor_types?.[index] === 'datetime' ? (
                                    <input
                                        id={`pred-${predictor}`}
                                        type="datetime-local"
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                                        onChange={(e) => {
                                            if (!e.target.value) {
                                                handleInputChange(predictor, '0');
                                                return;
                                            }
                                            const dateVal = new Date(e.target.value);

                                            // Relative Date Logic
                                            let days: number;
                                            if (model.reference_date) {
                                                const refDate = new Date(model.reference_date);
                                                // Diff in milliseconds / ms_per_day
                                                days = (dateVal.getTime() - refDate.getTime()) / 86400000;
                                            } else {
                                                // Fallback for compatibility or if no ref date (Days since 1970)
                                                days = dateVal.getTime() / 86400000;
                                            }

                                            handleInputChange(predictor, days.toString());
                                        }}
                                    />
                                ) : (
                                    <input
                                        id={`pred-${predictor}`}
                                        type="number"
                                        step="any"
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                                        value={inputs[predictor] || ''}
                                        onChange={(e) => handleInputChange(predictor, e.target.value)}
                                        placeholder={`Enter value for ${predictor}...`}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Result Section */}
                <div className="md:col-span-4 flex flex-col justify-end">
                    <div className={clsx(
                        "rounded-xl p-5 border shadow-sm transition-all duration-300",
                        prediction !== null
                            ? "bg-primary/5 border-primary/20 shadow-primary/5"
                            : "bg-muted/30 border-border"
                    )}>
                        <h4 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Predicted Result</h4>

                        <div className="flex flex-wrap items-baseline gap-1 mb-4 break-all">
                            {prediction !== null ? (
                                <>
                                    <span className="text-2xl sm:text-3xl font-bold tracking-tight text-primary leading-none">
                                        {prediction.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                    </span>
                                    <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">units</span>
                                </>
                            ) : error ? (
                                <span className="text-sm text-destructive font-medium">{error}</span>
                            ) : (
                                <span className="text-sm text-muted-foreground italic">
                                    {(model.type === 'random_forest' || model.type === 'custom' || config.saved_model_name)
                                        ? 'Waiting for calculation...'
                                        : 'Enter inputs to predict'}
                                </span>
                            )}
                        </div>

                        {(model.type === 'random_forest' || model.type === 'custom' || config.saved_model_name) && (
                            <Button
                                className="w-full"
                                variant={prediction !== null ? "secondary" : "primary"}
                                onClick={handlePredictServerSide}
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Calculating...
                                    </>
                                ) : (
                                    <>
                                        <Calculator className="w-4 h-4 mr-2" />
                                        Calculate Prediction
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
};
