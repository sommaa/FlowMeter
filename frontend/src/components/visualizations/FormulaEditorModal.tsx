/**
 * Formula editor modal with AI-powered generation capabilities.
 *
 * This modal provides two ways to create formulas:
 * 1. Manual Editor: Code editor with column insertion helpers
 * 2. AI Generation: Natural language-to-formula conversion using LLMs
 *
 * The modal supports two modes:
 * - **Formula Mode**: For creating custom calculated columns (supports AI)
 * - **Regression Mode**: For defining custom regression models (manual only)
 *
 * Key Features:
 * - Syntax-highlighted textarea for Python/NumPy expressions
 * - Column browser with search and one-click insertion
 * - AI formula generation using Gemini, OpenAI, or Claude
 * - Column description management for better AI context
 * - Provider/model selection with localStorage persistence
 * - Real-time validation and error feedback
 * - Global column descriptions shared with AI Wizard
 *
 * Formula Syntax:
 * - Access columns: `col['column_name']`
 * - Use NumPy: `np.sqrt(col['Temperature'])`
 * - Use Pandas: `pd.Series([1, 2, 3])`
 * - Multiple results: Assign to `result1`, `result2`, etc.
 * - Regression: Use `x` for x-axis, `a`, `b`, `c` for parameters
 *
 * @module components/visualizations/FormulaEditorModal
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Calculator, Sparkles, Loader2, CheckSquare, AlertCircle, CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/common';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { aiApi } from '@/services/api';
import { useStore } from '@/store';
import { cn } from '@/lib/utils';

/**
 * Props for the FormulaEditorModal component.
 *
 * @interface FormulaEditorModalProps
 * @property {boolean} isOpen - Whether the modal is currently open
 * @property {() => void} onClose - Callback when modal is closed
 * @property {string} initialFormula - Formula to populate in editor on open
 * @property {(formula: string) => void} onApply - Callback when user applies formula
 * @property {string[]} numericColumns - List of available column names for insertion
 * @property {'formula' | 'regression'} [mode] - Editor mode: 'formula' shows AI tab, 'regression' is manual-only (default: 'formula')
 */
interface FormulaEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialFormula: string;
    onApply: (formula: string) => void;
    numericColumns: string[];
    /** Mode determines placeholder text and description. 'formula' for formula plots, 'regression' for custom regression */
    mode?: 'formula' | 'regression';
}

/**
 * Supported AI provider identifiers.
 * @typedef {'gemini' | 'openai' | 'claude'} AIProvider
 */
type AIProvider = 'gemini' | 'openai' | 'claude';

/**
 * Retrieves stored API key for a provider from localStorage.
 *
 * API keys are base64-encoded in localStorage for basic obfuscation.
 * This is not cryptographically secure, but prevents casual exposure.
 *
 * @param {string} providerId - Provider identifier (e.g., 'gemini', 'openai', 'claude')
 * @returns {string | null} Decoded API key or null if not found/invalid
 */
function getStoredKey(providerId: string): string | null {
    try {
        const storedKey = localStorage.getItem(`ai_key_${providerId}`);
        return storedKey ? atob(storedKey) : null;
    } catch {
        return null;
    }
}

/**
 * Retrieves stored model preference for a provider from localStorage.
 *
 * @param {string} providerId - Provider identifier
 * @returns {string | null} Model ID (e.g., 'gpt-4', 'claude-3-opus') or null
 */
function getStoredModel(providerId: string): string | null {
    return localStorage.getItem(`ai_model_${providerId}`);
}

/**
 * Formula editor modal component.
 *
 * Provides an interface for creating Python expressions that operate on dataset columns.
 * In formula mode, users can manually write expressions or use AI to generate them from
 * natural language descriptions. In regression mode, users manually define custom regression
 * formulas with parameters.
 *
 * Manual Editor Features:
 * - Multi-line code editor with monospace font
 * - Column search and filter
 * - One-click column insertion at cursor position
 * - Syntax examples in placeholder text
 * - Real-time formula editing with debouncing
 *
 * AI Generation Features (Formula mode only):
 * - Provider selection (Gemini, OpenAI, Claude)
 * - Model selection with localStorage persistence
 * - Natural language description input
 * - Multi-column selection with checkboxes
 * - Per-column description management
 * - Visual feedback on description completeness
 * - Generated formula appears in manual editor for review/editing
 *
 * State Persistence:
 * - AI provider and model preferences saved to localStorage
 * - Column descriptions saved to global Zustand store
 * - Descriptions shared across AI Wizard and formula editor
 *
 * Validation:
 * - Requires at least one column selected for AI generation
 * - Requires description for all selected columns
 * - Requires natural language description of desired computation
 * - Requires API key configured for selected provider
 *
 * Error Handling:
 * - Shows error messages for failed AI generation
 * - Validates inputs before making API calls
 * - Provides helpful feedback on missing requirements
 *
 * @param {FormulaEditorModalProps} props - Component props
 * @returns {JSX.Element} Modal dialog with formula editor
 *
 * @example
 * ```tsx
 * <FormulaEditorModal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   initialFormula="result = col['Temperature'] * 1.8 + 32"
 *   onApply={(formula) => {
 *     updateConfig({ formula: { input: formula } });
 *     refreshPlot();
 *   }}
 *   numericColumns={['Temperature', 'Pressure', 'Flow']}
 *   mode="formula"
 * />
 * ```
 */
export const FormulaEditorModal: React.FC<FormulaEditorModalProps> = ({
    isOpen,
    onClose,
    initialFormula,
    onApply,
    numericColumns,
    mode = 'formula',
}) => {
    const [localFormula, setLocalFormula] = useState(initialFormula);
    const [columnSearch, setColumnSearch] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Global store for column descriptions
    const columnDescriptions = useStore(state => state.columnDescriptions);
    const setColumnDescriptions = useStore(state => state.setColumnDescriptions);
    const currentDataset = useStore(state => state.currentDataset);

    // AI Generation state
    const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('manual');
    const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
    const [aiDescription, setAiDescription] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    // AI Settings State
    // We store the full provider info (from backend) plus the locally stored API key (if any)
    const [availableProviders, setAvailableProviders] = useState<Array<import('@/types').AIProviderInfo & { apiKey?: string }>>([]);
    const [aiSettings, setAiSettings] = useState<{ provider: AIProvider; apiKey: string; model?: string } | null>(null);
    const [selectedModel, setSelectedModel] = useState<string>('');

    // Load AI settings on mount
    useEffect(() => {
        if (isOpen) {
            const loadProviders = async () => {
                try {
                    // Fetch supported providers/models from backend
                    const providersInfo = await aiApi.getProviders();

                    // Map all providers, attaching key if present
                    const allProviders: Array<import('@/types').AIProviderInfo & { apiKey?: string }> = providersInfo.map(p => ({
                        ...p,
                        apiKey: getStoredKey(p.id) || undefined
                    }));

                    setAvailableProviders(allProviders);

                    if (allProviders.length > 0) {
                        // Restore previous selection or default to first
                        // We check if current aiSettings match any configured provider
                        const currentFn = (p: typeof aiSettings) => p && allProviders.some(x => x.id === p.provider);

                        if (!currentFn(aiSettings)) {
                            // Default to first provider with a key, or just the first provider
                            const defaultProvider = allProviders.find(p => p.apiKey) || allProviders[0];
                            const savedModel = getStoredModel(defaultProvider.id);

                            // Prefer saved model, then default model from backend, then first available model
                            const modelId = savedModel && defaultProvider.models.some(m => m.id === savedModel)
                                ? savedModel
                                : (defaultProvider.model || defaultProvider.models[0]?.id);

                            setAiSettings({
                                provider: defaultProvider.id,
                                apiKey: defaultProvider.apiKey || '',
                                model: modelId
                            });
                            setSelectedModel(modelId);
                        }
                    } else {
                        setAiSettings(null);
                    }
                } catch (err) {
                    console.error("Failed to load AI providers", err);
                }
            };

            loadProviders();
        }
    }, [isOpen]);

    // Update settings when provider changes
    const handleProviderChange = (providerId: AIProvider) => {
        const newSettings = availableProviders.find(p => p.id === providerId);
        if (newSettings) {
            // Default to stored model for that provider, or first available
            const savedModel = getStoredModel(providerId);
            const model = savedModel && newSettings.models.some(m => m.id === savedModel)
                ? savedModel
                : (newSettings.model || newSettings.models[0]?.id);

            setAiSettings({
                provider: newSettings.id,
                apiKey: newSettings.apiKey || '',
                model
            });
            setSelectedModel(model);
        }
    };

    const handleInsertColumn = (col: string) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            // Fallback if ref is not available
            setLocalFormula((prev) => prev + `col['${col}']`);
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const insertion = `col['${col}']`;
        const currentValue = textarea.value;

        const newValue =
            currentValue.substring(0, start) +
            insertion +
            currentValue.substring(end);

        setLocalFormula(newValue);

        // Restore focus and move cursor to end of insertion
        // Use setTimeout to ensure React render cycle completes
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + insertion.length, start + insertion.length);
        }, 0);
    };

    // Toggle column selection for AI
    const toggleColumn = useCallback((col: string) => {
        setSelectedColumns(prev => {
            const next = new Set(prev);
            if (next.has(col)) {
                next.delete(col);
            } else {
                next.add(col);
            }
            return next;
        });
    }, []);

    // Select/deselect all columns
    const selectAllColumns = useCallback(() => {
        if (selectedColumns.size === numericColumns.length) {
            setSelectedColumns(new Set());
        } else {
            setSelectedColumns(new Set(numericColumns));
        }
    }, [numericColumns, selectedColumns.size]);

    // Update a single column description (persists to global store)
    const updateColumnDescription = useCallback((col: string, description: string) => {
        setColumnDescriptions({
            ...columnDescriptions,
            [col]: description
        });
    }, [columnDescriptions, setColumnDescriptions]);

    // Check if all selected columns have descriptions
    const allSelectedHaveDescriptions = useMemo(() => {
        if (selectedColumns.size === 0) return false;
        return Array.from(selectedColumns).every(col => columnDescriptions[col]?.trim());
    }, [selectedColumns, columnDescriptions]);

    // Count of selected columns with descriptions
    const selectedWithDescriptions = useMemo(() => {
        return Array.from(selectedColumns).filter(col => columnDescriptions[col]?.trim()).length;
    }, [selectedColumns, columnDescriptions]);

    // Generate formula with AI
    const handleGenerateFormula = useCallback(async () => {
        if (!aiSettings) {
            setAiError('No AI provider configured. Please set up AI in the AI Wizard first.');
            return;
        }
        if (selectedColumns.size === 0) {
            setAiError('Please select at least one column to use in the formula.');
            return;
        }
        if (!aiDescription.trim()) {
            setAiError('Please describe what you want the formula to compute.');
            return;
        }
        if (!allSelectedHaveDescriptions) {
            setAiError('Please provide descriptions for all selected columns.');
            return;
        }

        setIsGenerating(true);
        setAiError(null);

        try {
            const columns = Array.from(selectedColumns).map(name => ({
                name,
                description: columnDescriptions[name] || '',
                data_type: currentDataset?.numeric_columns.includes(name) ? 'numeric' :
                    currentDataset?.datetime_columns.includes(name) ? 'datetime' : 'text',
                stats: undefined, // Could be populated if we have stats available
            }));

            const result = await aiApi.generateFormula({
                provider: aiSettings.provider,
                api_key: aiSettings.apiKey,
                model: selectedModel || undefined,
                columns,
                description: aiDescription,
            });

            // Insert the generated formula
            setLocalFormula(result.formula);
            // Switch to manual tab so user can review/edit
            setActiveTab('manual');
        } catch (error) {
            setAiError(error instanceof Error ? error.message : 'Failed to generate formula');
        } finally {
            setIsGenerating(false);
        }
    }, [aiSettings, selectedColumns, aiDescription, columnDescriptions, allSelectedHaveDescriptions, currentDataset]);

    // Sync local formula when modal opens or initialFormula changes
    useEffect(() => {
        if (isOpen) {
            setLocalFormula(initialFormula);
            setColumnSearch('');
            setSelectedColumns(new Set());
            setAiDescription('');
            setAiError(null);
            setActiveTab('manual');
        }
    }, [isOpen, initialFormula]);

    const filteredColumns = numericColumns.filter((col) =>
        col.toLowerCase().includes(columnSearch.toLowerCase())
    );

    const hasAIConfigured = aiSettings !== null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[900px] h-[85vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b">
                    <DialogTitle className="flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-muted-foreground" />
                        {mode === 'regression' ? 'Custom Regression Formula' : 'Formula Editor'}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'regression' ? (
                            <>Write an expression using <code className="px-1 py-0.5 bg-muted rounded text-xs">x</code> for X-axis and <code className="px-1 py-0.5 bg-muted rounded text-xs">col['name']</code> for other columns. Define parameters like a, b, c.</>
                        ) : (
                            <>Use <code className="px-1 py-0.5 bg-muted rounded text-xs">col['column_name']</code> to access columns, or let AI generate a formula for you.</>
                        )}
                    </DialogDescription>
                </DialogHeader>

                {/* Only show AI tab for formula mode (not regression) */}
                {mode === 'formula' ? (
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'manual' | 'ai')} className="flex-1 flex flex-col overflow-hidden">
                        <TabsList className="mx-6 mt-4 w-fit">
                            <TabsTrigger value="manual" className="gap-2">
                                <Calculator className="w-4 h-4" />
                                Manual Editor
                            </TabsTrigger>
                            <TabsTrigger value="ai" className="gap-2" disabled={!hasAIConfigured}>
                                <Sparkles className="w-4 h-4" />
                                Generate with AI
                                {!hasAIConfigured && (
                                    <span className="text-xs text-muted-foreground ml-1">(Not configured)</span>
                                )}
                            </TabsTrigger>
                        </TabsList>

                        {/* Manual Editor Tab */}
                        <TabsContent value="manual" className="flex-1 flex flex-col overflow-hidden m-0 p-6 gap-4">
                            <Textarea
                                value={localFormula}
                                onChange={(e) => setLocalFormula(e.target.value)}
                                placeholder={`# Define your formula here
# Use col['column_name'] to access data columns
# Use np for numpy, pd for pandas

# Single result:
result = col['Tag1'] * 2 + col['Tag2']

# Multiple results:
result1 = col['Tag1'] / col['Tag2']
result2 = col['Tag1'] - col['Tag2']`}
                                ref={textareaRef}
                                className="flex-1 font-mono text-sm resize-none"
                                spellCheck={false}
                            />

                            {/* Available columns with search */}
                            {numericColumns.length > 0 && (
                                <div className="flex flex-col gap-2 shrink-0 h-40">
                                    <p className="text-xs font-medium text-muted-foreground">
                                        Available columns ({numericColumns.length} total) - click to insert:
                                    </p>

                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            type="text"
                                            value={columnSearch}
                                            onChange={(e) => setColumnSearch(e.target.value)}
                                            placeholder="Search columns..."
                                            className="pl-8 h-8 text-sm"
                                        />
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-2 bg-muted/50 rounded-lg border border-border">
                                        <div className="flex flex-wrap gap-1.5">
                                            {filteredColumns.map((col) => (
                                                <button
                                                    key={col}
                                                    onClick={() => handleInsertColumn(col)}
                                                    className="px-2 py-1 text-xs bg-background hover:bg-primary/10 hover:text-primary border border-input rounded transition-colors truncate max-w-[250px]"
                                                    title={`Click to insert: col['${col}']`}
                                                >
                                                    {col}
                                                </button>
                                            ))}
                                            {filteredColumns.length === 0 && (
                                                <span className="px-2 py-1 text-xs text-muted-foreground italic">
                                                    No columns match "{columnSearch}"
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </TabsContent>

                        {/* AI Generation Tab */}
                        <TabsContent value="ai" className="flex-1 overflow-y-auto m-0 p-6">
                          <div className="flex flex-col gap-4">
                            {/* Model Selection */}
                            <div className="flex items-center justify-between gap-4 p-3 bg-muted/30 rounded-lg border border-border">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mr-2">
                                        <Sparkles className="w-4 h-4" />
                                        <span className="font-medium">AI Settings</span>
                                    </div>

                                    {/* Provider Selector */}
                                    <Select
                                        value={aiSettings?.provider}
                                        onValueChange={(val) => handleProviderChange(val as AIProvider)}
                                        disabled={isGenerating || availableProviders.length <= 1}
                                    >
                                        <SelectTrigger className="w-[140px] h-8 text-xs bg-background border-none shadow-none hover:bg-muted/50 transition-colors">
                                            <SelectValue placeholder="Provider" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableProviders.map((p) => (
                                                <SelectItem key={p.id} value={p.id} className="text-xs">
                                                    {p.name} {!p.apiKey && "(Not Configured)"}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Select
                                        value={selectedModel}
                                        onValueChange={(val) => setSelectedModel(val)}
                                        disabled={isGenerating}
                                    >
                                        <SelectTrigger className="w-[180px] h-8 text-xs bg-background">
                                            <SelectValue placeholder="Select model" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(() => {
                                                const currentProvider = availableProviders.find(p => p.id === aiSettings?.provider);
                                                return currentProvider?.models.map((m) => (
                                                    <SelectItem key={m.id} value={m.id} className="text-xs">
                                                        <span>{m.name}</span>
                                                    </SelectItem>
                                                ))
                                            })()}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Description input */}
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">
                                    What do you want to compute? <span className="text-destructive">*</span>
                                </label>
                                <Textarea
                                    value={aiDescription}
                                    onChange={(e) => setAiDescription(e.target.value)}
                                    placeholder="Describe what you want the formula to calculate. For example:

• Calculate the ratio of Output to Input
• Find the moving average of Temperature over 10 points
• Normalize Pressure values to a 0-1 range
• Compute the difference between Flow1 and Flow2"
                                    className="h-24 text-sm resize-none"
                                    disabled={isGenerating}
                                />
                            </div>

                            {/* Column selection and descriptions */}
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium">
                                        Select columns and add descriptions <span className="text-destructive">*</span>
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            "text-xs px-2 py-0.5 rounded-full",
                                            allSelectedHaveDescriptions && selectedColumns.size > 0
                                                ? "bg-primary/10 text-primary"
                                                : "bg-muted text-muted-foreground"
                                        )}>
                                            {selectedWithDescriptions}/{selectedColumns.size} described
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={selectAllColumns}
                                            className="h-7 text-xs"
                                        >
                                            {selectedColumns.size === numericColumns.length ? 'Deselect All' : 'Select All'}
                                        </Button>
                                    </div>
                                </div>

                                <p className="text-xs text-muted-foreground">
                                    Descriptions help the AI understand what each column represents. These are saved globally and will be available in the AI Wizard too.
                                </p>

                                <div className="relative mb-2">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        type="text"
                                        value={columnSearch}
                                        onChange={(e) => setColumnSearch(e.target.value)}
                                        placeholder="Search columns..."
                                        className="pl-8 h-8 text-sm"
                                    />
                                </div>

                                <div className="max-h-[280px] overflow-y-auto border rounded-lg">
                                    <div className="space-y-1 p-2">
                                        {filteredColumns.map((col) => {
                                            const isSelected = selectedColumns.has(col);
                                            const hasDescription = !!columnDescriptions[col]?.trim();

                                            return (
                                                <div
                                                    key={col}
                                                    className={cn(
                                                        "p-3 rounded-lg transition-colors",
                                                        isSelected
                                                            ? "bg-accent"
                                                            : "hover:bg-muted/50"
                                                    )}
                                                >
                                                    {/* Column Header */}
                                                    <button
                                                        onClick={() => toggleColumn(col)}
                                                        disabled={isGenerating}
                                                        className="flex items-center gap-2 w-full text-left mb-2"
                                                    >
                                                        {isSelected ? (
                                                            hasDescription ? (
                                                                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                                                            ) : (
                                                                <CheckSquare className="w-4 h-4 text-muted-foreground shrink-0" />
                                                            )
                                                        ) : (
                                                            <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                                                        )}
                                                        <span className="font-mono text-sm font-medium truncate text-foreground">{col}</span>
                                                        <span className={cn(
                                                            "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ml-auto",
                                                            currentDataset?.datetime_columns.includes(col)
                                                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                                                : "bg-muted text-muted-foreground"
                                                        )}>
                                                            {currentDataset?.datetime_columns.includes(col) ? 'datetime' : 'numeric'}
                                                        </span>
                                                    </button>

                                                    {/* Description Input (shown when selected) */}
                                                    {isSelected && (
                                                        <Input
                                                            placeholder="Describe this column (e.g., 'Temperature in reactor vessel in °C')"
                                                            value={columnDescriptions[col] || ''}
                                                            onChange={(e) => updateColumnDescription(col, e.target.value)}
                                                            disabled={isGenerating}
                                                            className="h-8 text-sm"
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {filteredColumns.length === 0 && (
                                            <span className="block px-2 py-4 text-xs text-muted-foreground italic text-center">
                                                No columns match "{columnSearch}"
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Error display */}
                            {aiError && (
                                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>{aiError}</span>
                                </div>
                            )}

                            {/* Generate button */}
                            <Button
                                variant="primary"
                                onClick={handleGenerateFormula}
                                disabled={isGenerating || selectedColumns.size === 0 || !aiDescription.trim() || !allSelectedHaveDescriptions}
                                className="w-full gap-2"
                            >
                                {isGenerating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Generating Formula...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4" />
                                        Generate Formula
                                    </>
                                )}
                            </Button>

                            {!aiSettings?.apiKey && (
                                <div className="p-3 bg-muted text-muted-foreground rounded-lg text-xs border border-border">
                                    <p className="font-medium text-foreground">Provider Not Configured</p>
                                    <p>Please configure {aiSettings?.provider ? availableProviders.find(p => p.id === aiSettings.provider)?.name : 'AI'} in the AI Wizard to use this feature.</p>
                                </div>
                            )}
                          </div>
                        </TabsContent>
                    </Tabs>
                ) : (
                    /* Regression mode - no AI tab */
                    <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
                        <Textarea
                            value={localFormula}
                            onChange={(e) => setLocalFormula(e.target.value)}
                            placeholder={`# Custom regression formula
# Use x for the X-axis variable
# Use col['ColumnName'] for other variables
# Define parameters (a, b, c, etc.) in the Parameters field below

a * exp(-b * x) + c

# Or a simpler example:
a * x + b`}
                            ref={textareaRef}
                            className="flex-1 font-mono text-sm resize-none"
                            spellCheck={false}
                        />

                        {/* Available columns with search */}
                        {numericColumns.length > 0 && (
                            <div className="flex flex-col gap-2 shrink-0 h-40">
                                <p className="text-xs font-medium text-muted-foreground">
                                    Available columns ({numericColumns.length} total):
                                </p>

                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        type="text"
                                        value={columnSearch}
                                        onChange={(e) => setColumnSearch(e.target.value)}
                                        placeholder="Search columns..."
                                        className="pl-8 h-8 text-sm"
                                    />
                                </div>

                                <div className="flex-1 overflow-y-auto p-2 bg-muted/50 rounded-lg border border-border">
                                    <div className="flex flex-wrap gap-1.5">
                                        {filteredColumns.map((col) => (
                                            <button
                                                key={col}
                                                onClick={() => handleInsertColumn(col)}
                                                className="px-2 py-1 text-xs bg-background hover:bg-primary/10 hover:text-primary border border-input rounded transition-colors truncate max-w-[250px]"
                                                title={`Click to insert: col['${col}']`}
                                            >
                                                {col}
                                            </button>
                                        ))}
                                        {filteredColumns.length === 0 && (
                                            <span className="px-2 py-1 text-xs text-muted-foreground italic">
                                                No columns match "{columnSearch}"
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter className="px-6 py-4 border-t gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={() => {
                            onApply(localFormula);
                        }}
                        disabled={!localFormula.trim()}
                    >
                        Apply & Run
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
