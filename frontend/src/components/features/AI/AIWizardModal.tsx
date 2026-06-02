/**
 * AI Wizard Modal for assisted visualization creation.
 *
 * This comprehensive modal guides users through a 3-step process to generate visualizations
 * using AI (Gemini, OpenAI, or Claude). The wizard:
 *
 * 1. **Column Descriptions** - Collects semantic descriptions for dataset columns and guidance text
 * 2. **AI Settings** - Configures AI provider, model, API key, and max suggestions count
 * 3. **Suggestions Review** - Displays AI-generated chart suggestions with preview and apply controls
 *
 * Features:
 * - Multi-step wizard with validation at each stage
 * - Persistent column descriptions across sessions (stored in Zustand)
 * - Individual or bulk suggestion application
 * - Real-time suggestion generation with loading states
 * - Error handling with retry functionality
 * - Applied suggestion tracking to prevent duplicates
 * - Completion callback with all applied visualization configs
 *
 * The wizard leverages LangGraph-powered AI on the backend to intelligently analyze data
 * structure, column relationships, and user guidance to suggest relevant visualizations.
 *
 * @module components/features/AI/AIWizardModal
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/common';
import { Sparkles, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useStore } from '@/store';
import { aiApi, AIError } from '@/services/api';
import {
    AIProvider,
    AIProviderInfo,
    AIEffort,
    AIErrorClass,
    AISuggestion,
    VisualizationConfig,
} from '@/types';
import { cn } from '@/lib/utils';

import { ColumnDescriptionEditor } from './ColumnDescriptionEditor';
import { AISettingsModal } from './AISettingsModal';
import { AISuggestionsPanel } from './AISuggestionsPanel';

/**
 * Wizard step identifier.
 * @typedef {'descriptions' | 'settings' | 'suggestions'} WizardStep
 */
type WizardStep = 'descriptions' | 'settings' | 'suggestions';

/**
 * Props for the AIWizardModal component.
 *
 * @interface Props
 * @property {boolean} isOpen - Whether the modal is currently open
 * @property {() => void} onClose - Callback when modal is closed without completing
 * @property {(configs: VisualizationConfig[]) => void} onComplete - Callback with applied configs on completion
 */
interface Props {
    isOpen: boolean;
    onClose: () => void;
    onComplete: (configs: VisualizationConfig[]) => void;
}

/**
 * AI Wizard Modal component for guided visualization creation.
 *
 * Implements a three-step wizard flow:
 *
 * **Step 1: Column Descriptions**
 * - Text input for each column describing its meaning/content
 * - Global guidance textarea for analysis goals
 * - Descriptions persist in Zustand store across sessions
 * - Validation: All columns must have descriptions, guidance required
 * - Purpose: Provides semantic context for AI to understand data
 *
 * **Step 2: AI Settings** (triggers automatically after Step 1)
 * - AI provider selection (Gemini, OpenAI, Claude)
 * - Model dropdown (populated from backend provider info)
 * - API key input (stored in localStorage, base64 encoded)
 * - Max suggestions slider (1-10, default 5)
 * - Generates suggestions immediately on submission
 * - Purpose: Configures AI parameters and triggers generation
 *
 * **Step 3: Suggestions Review**
 * - Displays AI-generated visualization suggestions
 * - Each suggestion shows: title, description, chart type, variables
 * - Individual "Apply" buttons for selective addition
 * - "Apply All" button for bulk addition of unapplied suggestions
 * - "Retry" button to regenerate with same settings
 * - Loading spinner during generation
 * - Error display with retry option
 * - Applied counter shows how many charts added
 * - Purpose: Review and selectively apply AI recommendations
 *
 * State Management:
 * - Wizard step tracking (descriptions → settings → suggestions)
 * - Column descriptions (Zustand global state, persists across sessions)
 * - Guidance text (Zustand global state)
 * - Provider/model/API key (local state, API key cached in localStorage)
 * - Suggestions array (local state, cleared on modal open)
 * - Applied indices Set (tracks which suggestions already applied)
 * - Applied configs array (accumulates configs to return on completion)
 *
 * Reset Behavior:
 * - On modal open: Resets wizard to step 1, clears suggestions/applied tracking
 * - Preserves: Column descriptions, guidance text (persistent data)
 * - Clears: Suggestions, applied indices, errors (transient UI state)
 *
 * Navigation:
 * - Step 1 → 2: "Continue" button (requires all descriptions + guidance)
 * - Step 2 → 3: Automatic after generation starts
 * - Step 3 → 1: "Back" button
 * - Step 3 → Done: "Done" button (calls onComplete with applied configs)
 *
 * Error Handling:
 * - Network errors during suggestion generation
 * - Invalid API keys or quota exceeded
 * - Backend processing errors
 * - All errors show message with "Retry" button
 *
 * API Integration:
 * - `getProviders()`: Fetches supported providers/models on mount
 * - `suggest()`: Generates visualization suggestions from descriptions
 * - `applySuggestions()`: Converts suggestions to VisualizationConfigs
 *
 * @param {Props} props - Component props
 * @returns {JSX.Element} Multi-step AI wizard modal
 *
 * @example
 * ```tsx
 * <AIWizardModal
 *   isOpen={wizardOpen}
 *   onClose={() => setWizardOpen(false)}
 *   onComplete={(configs) => {
 *     configs.forEach(config => addVisualization(config));
 *     setWizardOpen(false);
 *   }}
 * />
 * ```
 */
export const AIWizardModal: React.FC<Props> = ({
    isOpen,
    onClose,
    onComplete
}) => {
    const currentDataset = useStore(state => state.currentDataset);
    const visualizations = useStore(state => state.visualizations);

    // Wizard state
    const [step, setStep] = useState<WizardStep>('descriptions');
    const columnDescriptions = useStore(state => state.columnDescriptions);
    const setColumnDescriptions = useStore(state => state.setColumnDescriptions);
    const guidanceText = useStore(state => state.aiGuidanceText);
    const setGuidanceText = useStore(state => state.setAiGuidanceText);

    // Provider state
    const [providers, setProviders] = useState<AIProviderInfo[]>([]);
    const [selectedProvider, setSelectedProvider] = useState<AIProvider>('gemini');
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [apiKey, setApiKey] = useState('');

    // Suggestions state. `appliedIds` is keyed by the client-side stable id
    // the suggest() service attaches on receipt — using indices would race
    // against the list being replaced by a regenerate.
    const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorClass, setErrorClass] = useState<AIErrorClass | null>(null);
    const [retryAfterS, setRetryAfterS] = useState<number | null>(null);
    const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
    const [appliedConfigs, setAppliedConfigs] = useState<VisualizationConfig[]>([]);
    const [maxSuggestions, setMaxSuggestions] = useState(5);
    const [selectedEffort, setSelectedEffort] = useState<AIEffort | undefined>(undefined);

    // Holds the AbortController for any in-flight suggest() call. Aborted on
    // modal close, on regenerate, and on unmount so a closed modal cannot
    // later overwrite state with a stale response.
    const suggestAbortRef = useRef<AbortController | null>(null);

    // Defense-in-depth alongside the AbortController: even if a settled
    // promise's continuation runs after unmount (microtask race), refuse
    // any state updates. The ref is initialized true and flipped false in
    // the cleanup of the mount effect below.
    const isMountedRef = useRef(true);

    // Transient apply errors live separately from the suggest-generation
    // error so they don't clear the suggestions list. Cleared on retry.
    const [applyError, setApplyError] = useState<string | null>(null);

    // Load providers on mount
    useEffect(() => {
        if (isOpen && providers.length === 0) {
            aiApi.getProviders().then(setProviders).catch(console.error);
        }
    }, [isOpen, providers.length]);

    // Track previous open state to detect transitions
    const wasOpenRef = React.useRef(false);

    // Reset state only when modal opens (transition from closed to open)
    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            // Modal just opened - reset wizard step and suggestions, but KEEP descriptions/guidance
            setStep('descriptions');
            setSuggestions([]);
            setAppliedIds(new Set());
            setAppliedConfigs([]);
            setError(null);
            setErrorClass(null);
            setRetryAfterS(null);
        } else if (!isOpen && wasOpenRef.current) {
            // Modal just closed — cancel any in-flight suggest call.
            suggestAbortRef.current?.abort();
            suggestAbortRef.current = null;
        }
        wasOpenRef.current = isOpen;
    }, [isOpen]); // Only depend on isOpen, not on initial values

    // Final safety net: abort on unmount and flip the mount guard so any
    // late-arriving promise continuations refuse to setState.
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            suggestAbortRef.current?.abort();
        };
    }, []);

    // Validation. Reconciled (`_rec`) columns are hidden from the editor
    // (see ColumnDescriptionEditor) so they don't need descriptions —
    // exclude them here too, otherwise the "Continue" button would never
    // unlock on datasets with reconciliation applied.
    const isDescriptionsComplete = useCallback(() => {
        if (!currentDataset) return false;
        return (
            !!guidanceText.trim() &&
            currentDataset.column_names
                .filter(col => !col.endsWith('_rec'))
                .every(col => columnDescriptions[col]?.trim())
        );
    }, [currentDataset, columnDescriptions, guidanceText]);

    // Generate suggestions
    const generateSuggestions = async (
        provider: AIProvider,
        key: string,
        model: string,
        effort?: AIEffort,
        maxSuggestionsParam?: number,
        datasetAccess?: boolean,
        maxToolIterations?: number,
        idleTimeoutS?: number,
    ) => {
        if (!currentDataset) return;

        // Abort any prior in-flight call before starting a new one.
        suggestAbortRef.current?.abort();
        const controller = new AbortController();
        suggestAbortRef.current = controller;

        const suggestionsCount = maxSuggestionsParam ?? 5;
        setMaxSuggestions(suggestionsCount);
        setSelectedProvider(provider);
        setSelectedModel(model);
        setSelectedEffort(effort);
        setApiKey(key);
        setIsLoading(true);
        setError(null);
        setErrorClass(null);
        setRetryAfterS(null);
        setStep('suggestions');

        try {
            const response = await aiApi.suggest({
                dataset_id: currentDataset.id,
                provider,
                api_key: key,
                model,
                effort,
                column_descriptions: columnDescriptions,
                guidance_text: guidanceText,
                existing_visualization_titles: visualizations.map(v => v.title),
                max_suggestions: suggestionsCount,
                dataset_access: datasetAccess ?? false,
                // Only meaningful when dataset_access is on. Backend treats
                // undefined as "use the workflow default".
                max_tool_iterations: datasetAccess ? maxToolIterations : undefined,
                // Idle timeout applies to every streaming call (metadata-only
                // and tool-bound), so it is forwarded regardless of
                // dataset_access. Backend treats undefined as "pick the
                // default from effort + tool binding".
                idle_timeout_s: idleTimeoutS,
            }, controller.signal);

            // Ignore a response that arrived after a newer abort (e.g. modal closed)
            // or after the wizard unmounted entirely.
            if (controller.signal.aborted || !isMountedRef.current) return;
            setSuggestions(response.suggestions);
        } catch (err) {
            // Axios raises a CanceledError when the signal aborts; suppress it
            // — the user already moved on.
            if (axios.isCancel(err) || (err instanceof Error && err.name === 'CanceledError')) {
                return;
            }
            if (!isMountedRef.current) return;
            if (err instanceof AIError) {
                setError(err.message);
                setErrorClass(err.error_class);
                setRetryAfterS(err.retry_after_s ?? null);
            } else {
                setError(err instanceof Error ? err.message : 'Failed to generate suggestions');
                setErrorClass('unknown');
                setRetryAfterS(null);
            }
        } finally {
            if (suggestAbortRef.current === controller && isMountedRef.current) {
                setIsLoading(false);
                suggestAbortRef.current = null;
            }
        }
    };

    // The configuration editor represents the dataset's primary datetime column
    // as the magic value "Index" (and filters that column out of the variable
    // dropdown). When the AI returns the literal column name, the dropdown
    // can't match it and shows the empty placeholder. Normalize on apply.
    const normalizeAppliedConfig = (config: VisualizationConfig): VisualizationConfig => {
        const primaryDatetime = currentDataset?.datetime_columns?.[0];
        if (primaryDatetime && config.axis?.x_axis === primaryDatetime) {
            return { ...config, axis: { ...config.axis, x_axis: 'Index' } };
        }
        return config;
    };

    // Apply single suggestion
    const handleApplySuggestion = async (suggestion: AISuggestion) => {
        // Guard against double-click: bail if already applied.
        if (appliedIds.has(suggestion.id)) return;
        setApplyError(null);
        try {
            const response = await aiApi.applySuggestions([suggestion]);
            if (!isMountedRef.current) return;
            if (response.configurations.length > 0) {
                const config = normalizeAppliedConfig(response.configurations[0] as VisualizationConfig);
                setAppliedConfigs(prev => [...prev, config]);
                setAppliedIds(prev => new Set(prev).add(suggestion.id));
            }
        } catch (err) {
            // Visible apply errors prevent silent "Apply" clicks that look
            // successful but actually did nothing.
            console.error('Failed to apply suggestion:', err);
            if (!isMountedRef.current) return;
            setApplyError(
                err instanceof Error
                    ? `Failed to apply "${suggestion.title}": ${err.message}`
                    : `Failed to apply "${suggestion.title}".`
            );
        }
    };

    // Apply all suggestions
    const handleApplyAll = async () => {
        const unapplied = suggestions.filter((s) => !appliedIds.has(s.id));
        if (unapplied.length === 0) return;

        setApplyError(null);
        try {
            const response = await aiApi.applySuggestions(unapplied);
            if (!isMountedRef.current) return;
            const newConfigs = (response.configurations as VisualizationConfig[]).map(normalizeAppliedConfig);
            setAppliedConfigs(prev => [...prev, ...newConfigs]);

            setAppliedIds(prev => {
                const next = new Set(prev);
                for (const s of unapplied) next.add(s.id);
                return next;
            });
        } catch (err) {
            console.error('Failed to apply suggestions:', err);
            if (!isMountedRef.current) return;
            setApplyError(
                err instanceof Error
                    ? `Failed to apply ${unapplied.length} suggestions: ${err.message}`
                    : `Failed to apply ${unapplied.length} suggestions.`
            );
        }
    };

    // Retry generation
    const handleRetry = () => {
        setApplyError(null);
        if (apiKey) {
            generateSuggestions(selectedProvider, apiKey, selectedModel, selectedEffort, maxSuggestions);
        } else {
            setStep('settings');
        }
    };

    // Complete and close
    const handleComplete = () => {
        onComplete(appliedConfigs);
        onClose();
    };

    // Render step content
    const renderStepContent = () => {
        switch (step) {
            case 'descriptions':
                return (
                    <ColumnDescriptionEditor
                        columnDescriptions={columnDescriptions}
                        onDescriptionsChange={setColumnDescriptions}
                        guidanceText={guidanceText}
                        onGuidanceChange={setGuidanceText}
                    />
                );

            case 'suggestions':
                return (
                    <>
                        {applyError && (
                            <div
                                role="alert"
                                className="mb-3 px-3 py-2 rounded-md border border-destructive/40 bg-destructive/5 text-sm text-destructive"
                            >
                                {applyError}
                            </div>
                        )}
                        <AISuggestionsPanel
                            suggestions={suggestions}
                            isLoading={isLoading}
                            error={error}
                            errorClass={errorClass}
                            retryAfterS={retryAfterS}
                            onApply={handleApplySuggestion}
                            onApplyAll={handleApplyAll}
                            onRetry={handleRetry}
                            onOpenSettings={() => setStep('settings')}
                            appliedIds={appliedIds}
                            providerName={providers.find(p => p.id === selectedProvider)?.name}
                        />
                    </>
                );

            default:
                return null;
        }
    };

    // Render footer actions
    const renderFooter = () => {
        switch (step) {
            case 'descriptions':
                return (
                    <>
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={() => setStep('settings')}
                            disabled={!isDescriptionsComplete()}
                        >
                            Continue
                            <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                    </>
                );

            case 'suggestions':
                return (
                    <>
                        <Button
                            variant="outline"
                            onClick={() => setStep('descriptions')}
                            disabled={isLoading}
                        >
                            <ArrowLeft className="w-4 h-4 mr-1" />
                            Back
                        </Button>
                        <div className="flex items-center gap-2">
                            {appliedConfigs.length > 0 && (
                                <span className="text-sm text-muted-foreground">
                                    {appliedConfigs.length} chart{appliedConfigs.length !== 1 ? 's' : ''} added
                                </span>
                            )}
                            <Button
                                variant="primary"
                                onClick={handleComplete}
                                disabled={isLoading || appliedConfigs.length === 0}
                            >
                                <Check className="w-4 h-4 mr-1" />
                                {isLoading ? 'Loading...' : 'Done'}
                            </Button>
                        </div>
                    </>
                );

            default:
                return null;
        }
    };

    return (
        <>
            <Dialog open={isOpen && step !== 'settings'} onOpenChange={onClose}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-primary" />
                            AI-Assisted Visualization
                        </DialogTitle>
                        <DialogDescription>
                            {step === 'descriptions'
                                ? 'Describe your data and analysis goals to help the AI suggest relevant visualizations.'
                                : 'Review the AI suggestions and add the ones you want to your dashboard.'}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Step indicator */}
                    <div className="flex items-center gap-2 py-2 border-b">
                        <div
                            className={cn(
                                "flex items-center gap-1 text-sm px-2 py-1 rounded",
                                step === 'descriptions' ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"
                            )}
                        >
                            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center">
                                1
                            </span>
                            Describe Data
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        <div
                            className={cn(
                                "flex items-center gap-1 text-sm px-2 py-1 rounded",
                                step === 'suggestions' ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"
                            )}
                        >
                            <span className={cn(
                                "w-5 h-5 rounded-full text-xs flex items-center justify-center",
                                step === 'suggestions' ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                            )}>
                                2
                            </span>
                            Review Suggestions
                        </div>
                    </div>

                    {/* Content. `min-h-0` is required so the flex-1 child can
                        actually shrink below its intrinsic content size and let
                        `overflow-y-auto` kick in — without it, a long
                        suggestions list grows the inner container past the
                        dialog's `max-h-[90vh]` and the bottom gets clipped by
                        the dialog's `overflow-hidden`. */}
                    <div className="flex-1 min-h-0 overflow-y-auto py-4">
                        {renderStepContent()}
                    </div>

                    {/* Footer */}
                    <div className="flex justify-between items-center pt-4 border-t">
                        {renderFooter()}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Settings modal (provider/key selection) */}
            <AISettingsModal
                isOpen={isOpen && step === 'settings'}
                onClose={() => setStep('descriptions')}
                onContinue={generateSuggestions}
                providers={providers}
                isLoading={isLoading}
            />
        </>
    );
};

export default AIWizardModal;
