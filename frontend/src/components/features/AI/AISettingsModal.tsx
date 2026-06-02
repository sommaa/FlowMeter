/**
 * AI Settings Modal for configuring AI provider, model, and API key.
 *
 * This modal is step 2 of the AI Wizard, allowing users to configure AI parameters
 * before generating visualization suggestions. It provides:
 *
 * - AI provider selection (Gemini, OpenAI, Claude) with icons
 * - Model dropdown populated from backend provider info
 * - API key input with show/hide toggle
 * - Quick links to provider API key pages
 * - Max suggestions slider (1-10 suggestions)
 * - Persistent storage of keys and preferences in localStorage
 *
 * The modal validates that an API key is provided before allowing continuation.
 * Keys are base64-encoded in localStorage for basic obfuscation (not cryptographically secure).
 *
 * @module components/features/AI/AISettingsModal
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/common';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Eye, EyeOff, Key, Sparkles, ExternalLink, Check, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { AIProvider, AIModelInfo, AIProviderInfo, AIEffort } from '@/types';
import { cn } from '@/lib/utils';
import { aiApi } from '@/services/api';

/**
 * Props for the AISettingsModal component.
 *
 * @interface Props
 * @property {boolean} isOpen - Whether the modal is currently open
 * @property {() => void} onClose - Callback when modal is closed
 * @property {(provider: AIProvider, apiKey: string, model?: string, maxSuggestions?: number) => void} onContinue - Callback when user continues with settings
 * @property {AIProviderInfo[]} providers - Array of available AI providers from backend
 * @property {boolean} [isLoading] - Whether generation is in progress (disables controls, default: false)
 */
interface Props {
    isOpen: boolean;
    onClose: () => void;
    onContinue: (
        provider: AIProvider,
        apiKey: string,
        model: string,
        effort?: AIEffort,
        maxSuggestions?: number,
        datasetAccess?: boolean,
        maxToolIterations?: number,
        idleTimeoutS?: number,
    ) => void;
    providers: AIProviderInfo[];
    isLoading?: boolean;
}

/**
 * Direct links to AI provider API key management pages.
 *
 * Used to help users quickly obtain API keys if they don't have one yet.
 *
 * @constant {Record<AIProvider, string>}
 */
const PROVIDER_LINKS: Record<AIProvider, string> = {
    gemini: 'https://aistudio.google.com/apikey',
    openai: 'https://platform.openai.com/api-keys',
    claude: 'https://console.anthropic.com/settings/keys'
};

import { PROVIDER_ICONS } from './AIProviderIcons';

/**
 * AI Settings Modal component for AI wizard step 2.
 *
 * Provides a configuration interface for AI parameters with persistence:
 *
 * **Provider Selection**:
 * - Radio-style buttons showing provider name, icon, and default model
 * - Visual selection state with border highlighting and checkmark
 * - Changes automatically load saved key/model for that provider
 * - Available providers: Gemini (Google), OpenAI (GPT), Claude (Anthropic)
 *
 * **Model Selection**:
 * - Dropdown populated with models for selected provider
 * - Models fetched from backend (ensures up-to-date options)
 * - Shows model display names (e.g., "GPT-4 Turbo", "Gemini Pro")
 * - Automatically selects saved model or provider default
 * - Persisted per-provider in localStorage
 *
 * **API Key Input**:
 * - Password-style input with show/hide eye icon
 * - "Get API Key" link opens provider's key management page
 * - Loads saved key from localStorage on provider change
 * - Keys stored base64-encoded (basic obfuscation, not secure encryption)
 * - Required field - continue button disabled if empty
 *
 * **Max Suggestions Slider**:
 * - Range: 1-10 suggestions (default: 5)
 * - Visual slider with numeric display
 * - Persisted globally in localStorage (shared across providers)
 * - Controls how many visualization suggestions AI generates
 *
 * **Persistence Logic**:
 * - Keys: `localStorage['ai_key_{provider}']` (base64)
 * - Models: `localStorage['ai_model_{provider}']` (plain)
 * - Max Suggestions: `localStorage['ai_max_suggestions']` (plain)
 * - Loaded on modal open and provider change
 * - Saved on "Continue" button click
 *
 * **State Management**:
 * - Local state for all form fields
 * - Defaults to 'gemini' provider
 * - Auto-loads saved preferences on mount
 * - Syncs with localStorage on provider switch
 *
 * **Validation**:
 * - API key required (non-empty after trim)
 * - Model auto-selects default if saved model invalid
 * - Max suggestions clamped to 1-10 range
 *
 * **Loading State**:
 * - Disables all controls when isLoading=true
 * - Prevents changes while suggestion generation in progress
 * - Shows loading spinner on continue button
 *
 * Workflow:
 * 1. User selects provider (loads saved key/model)
 * 2. User selects model from dropdown
 * 3. User enters/verifies API key
 * 4. User adjusts max suggestions slider (optional)
 * 5. User clicks "Continue" (saves settings, triggers generation)
 *
 * @param {Props} props - Component props
 * @returns {JSX.Element} AI settings configuration modal
 *
 * @example
 * ```tsx
 * <AISettingsModal
 *   isOpen={settingsOpen}
 *   onClose={() => setSettingsOpen(false)}
 *   onContinue={(provider, apiKey, model, maxSuggestions) => {
 *     generateSuggestions(provider, apiKey, model, maxSuggestions);
 *   }}
 *   providers={[
 *     { id: 'gemini', name: 'Google Gemini', model: 'gemini-pro', models: [...] },
 *     { id: 'openai', name: 'OpenAI', model: 'gpt-4-turbo', models: [...] }
 *   ]}
 *   isLoading={false}
 * />
 * ```
 */
export const AISettingsModal: React.FC<Props> = ({
    isOpen,
    onClose,
    onContinue,
    providers,
    isLoading = false
}) => {
    const [provider, setProvider] = useState<AIProvider>('gemini');
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [maxSuggestions, setMaxSuggestions] = useState(5);
    const [dynamicModels, setDynamicModels] = useState<AIModelInfo[] | null>(null);
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [effort, setEffort] = useState<AIEffort | undefined>(undefined);
    // Privacy default is OFF — when this toggle is on, the AI may issue
    // read-only tool calls against the loaded dataset (sample rows, value
    // counts, statistics) before producing suggestions.
    const [datasetAccess, setDatasetAccess] = useState<boolean>(false);
    // Cap on the number of agent ↔ tool round trips when dataset_access is
    // on. Higher values let the AI inspect the data more thoroughly at the
    // cost of latency. Default tracks the workflow default on the backend.
    const [maxToolIterations, setMaxToolIterations] = useState<number>(10);
    // Per-chunk idle timeout (seconds). The streaming helper resets this
    // on every chunk — a long-but-progressing response is never killed,
    // only a true stall fires. Default matches the backend's tool-bound
    // default. Bounds match the backend validator (10–600s).
    const [idleTimeoutS, setIdleTimeoutS] = useState<number>(180);
    // The advanced section is collapsed by default so first-time users see
    // the simple form. State persists across modal opens within the session
    // but is not written to localStorage — the recommended UX is to leave
    // it collapsed once configured.
    const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);
    // Surface a transient validation error (e.g. API key too long for
    // localStorage) so the user understands why "Continue" did not save.
    const [continueError, setContinueError] = useState<string | null>(null);
    const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const providerInfo = providers.find(p => p.id === provider);
    const displayModels = dynamicModels ?? [];

    const fetchModels = useCallback(async (prov: AIProvider, key: string) => {
        if (!key.trim()) {
            setDynamicModels(null);
            return;
        }
        setIsFetchingModels(true);
        try {
            const models = await aiApi.fetchProviderModels(prov, key.trim());
            setDynamicModels(models.length > 0 ? models : null);
        } catch {
            setDynamicModels(null);
        } finally {
            setIsFetchingModels(false);
        }
    }, []);

    // Load saved key and model when provider changes
    useEffect(() => {
        setDynamicModels(null);
        setSelectedModel('');

        const savedKey = localStorage.getItem(`ai_key_${provider}`);
        let loadedKey = '';
        if (savedKey) {
            try {
                loadedKey = atob(savedKey);
            } catch {
                // ignore
            }
        }
        setApiKey(loadedKey);

        // Restore saved model selection
        const savedModel = localStorage.getItem(`ai_model_${provider}`);
        if (savedModel) {
            setSelectedModel(savedModel);
        }

        // Fetch live models if we have a saved key
        if (loadedKey) {
            fetchModels(provider, loadedKey);
        }
    }, [provider, fetchModels]);

    // Debounced fetch when API key changes (user typing/pasting)
    useEffect(() => {
        if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
        if (!apiKey.trim()) {
            setDynamicModels(null);
            return;
        }
        fetchTimerRef.current = setTimeout(() => {
            fetchModels(provider, apiKey);
        }, 600);
        return () => {
            if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
        };
    }, [apiKey, provider, fetchModels]);

    // When dynamic models load, preserve the selected model if it still exists
    useEffect(() => {
        if (!dynamicModels) return;
        if (dynamicModels.some(m => m.id === selectedModel)) return;
        // Selected model not in new list — pick the first one
        setSelectedModel(dynamicModels[0]?.id || '');
    }, [dynamicModels, selectedModel]);

    // Load saved max suggestions, effort, and dataset-access flag on mount
    useEffect(() => {
        const savedMaxSuggestions = localStorage.getItem('ai_max_suggestions');
        if (savedMaxSuggestions) {
            const parsed = parseInt(savedMaxSuggestions, 10);
            if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
                setMaxSuggestions(parsed);
            }
        }
        const savedEffort = localStorage.getItem('ai_effort');
        if (savedEffort && ['low', 'medium', 'high'].includes(savedEffort)) {
            setEffort(savedEffort as AIEffort);
        }
        // Stored as the literal string 'true' or 'false' so anything else
        // (missing, malformed) collapses to the privacy-preserving default.
        const savedDatasetAccess = localStorage.getItem('ai_dataset_access');
        setDatasetAccess(savedDatasetAccess === 'true');

        const savedMaxIters = localStorage.getItem('ai_max_tool_iterations');
        if (savedMaxIters) {
            const parsed = parseInt(savedMaxIters, 10);
            if (!isNaN(parsed) && parsed >= 1 && parsed <= 30) {
                setMaxToolIterations(parsed);
            }
        }
        const savedIdleTimeout = localStorage.getItem('ai_idle_timeout_s');
        if (savedIdleTimeout) {
            const parsed = parseInt(savedIdleTimeout, 10);
            if (!isNaN(parsed) && parsed >= 10 && parsed <= 600) {
                setIdleTimeoutS(parsed);
            }
        }
    }, []);

    // localStorage entries above ~10K characters often trip browser quotas
    // silently. Reject early so the user knows why "Continue" didn't save.
    const _MAX_API_KEY_CHARS = 10_000;

    const handleClearAllKeys = () => {
        // One-click affordance to wipe every stored provider key. Useful
        // after logging out of a shared machine or rotating credentials.
        for (const p of ['gemini', 'openai', 'claude'] as const) {
            localStorage.removeItem(`ai_key_${p}`);
        }
        setApiKey('');
        setDynamicModels(null);
        setContinueError(null);
    };

    const handleContinue = () => {
        const trimmed = apiKey.trim();
        if (trimmed.length > _MAX_API_KEY_CHARS) {
            setContinueError(
                `API key is too long (${trimmed.length} chars; max ${_MAX_API_KEY_CHARS}). ` +
                'Paste only the key itself, not the surrounding text.'
            );
            return;
        }
        setContinueError(null);
        // Save key, model, effort, and dataset-access toggle
        if (trimmed) {
            try {
                localStorage.setItem(`ai_key_${provider}`, btoa(trimmed));
            } catch (e) {
                // Hitting the quota here is exceptional after the length
                // guard above — surface so the user isn't left wondering.
                setContinueError(
                    `Could not save API key to browser storage: ${(e as Error).message || 'unknown error'}.`
                );
                return;
            }
        }
        if (selectedModel) {
            localStorage.setItem(`ai_model_${provider}`, selectedModel);
        }
        localStorage.setItem('ai_max_suggestions', String(maxSuggestions));
        if (effort) {
            localStorage.setItem('ai_effort', effort);
        } else {
            localStorage.removeItem('ai_effort');
        }
        localStorage.setItem('ai_dataset_access', datasetAccess ? 'true' : 'false');
        localStorage.setItem('ai_max_tool_iterations', String(maxToolIterations));
        localStorage.setItem('ai_idle_timeout_s', String(idleTimeoutS));
        onContinue(
            provider,
            trimmed,
            selectedModel,
            effort,
            maxSuggestions,
            datasetAccess,
            maxToolIterations,
            idleTimeoutS,
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            {/* `max-h-[90vh] flex flex-col` + an inner `min-h-0 overflow-y-auto`
                scroll container keep the modal usable on small viewports
                once the advanced section is expanded. Without these, the
                dialog grows past the viewport and the bottom buttons are
                clipped by Radix's portal positioning. */}
            <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary" />
                        AI Configuration
                    </DialogTitle>
                    <DialogDescription>
                        Select your preferred AI provider, model, and enter your API key.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-y-auto space-y-6 py-4 pr-1">
                    {/* Provider Selection */}
                    <div className="space-y-3">
                        <Label>Select AI Provider</Label>
                        <div className="grid gap-2">
                            {providers.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setProvider(p.id)}
                                    disabled={isLoading}
                                    className={cn(
                                        "flex items-center gap-3 p-3 border rounded-lg text-left transition-all",
                                        "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20",
                                        provider === p.id
                                            ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                            : "border-border",
                                        isLoading && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    <div className="flex-shrink-0">{PROVIDER_ICONS[p.id]}</div>
                                    <div className="flex-1">
                                        <div className="font-medium">{p.name}</div>
                                    </div>
                                    {provider === p.id && (
                                        <Check className="w-4 h-4 text-primary" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Model Selection */}
                    {displayModels.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="model-select">Model</Label>
                                <div className="flex items-center gap-1.5">
                                    {dynamicModels && (
                                        <span className="text-xs text-muted-foreground">
                                            {dynamicModels.length} models
                                        </span>
                                    )}
                                    {isFetchingModels && (
                                        <RefreshCw className="w-3 h-3 text-muted-foreground animate-spin" />
                                    )}
                                </div>
                            </div>
                            <Select
                                value={selectedModel}
                                onValueChange={setSelectedModel}
                                disabled={isLoading || isFetchingModels}
                            >
                                <SelectTrigger id="model-select">
                                    <SelectValue placeholder={isFetchingModels ? "Fetching models..." : "Select a model"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {displayModels.map(m => (
                                        <SelectItem key={m.id} value={m.id}>
                                            <div className="flex flex-col">
                                                <span>{m.name}</span>
                                                <span className="text-xs text-muted-foreground">{m.description}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* API Key */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="api-key">API Key</Label>
                            <a
                                href={PROVIDER_LINKS[provider]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                                Get API Key <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                        <div className="relative">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                id="api-key"
                                type={showKey ? 'text' : 'password'}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={`Enter your ${providerInfo?.name || 'AI'} API key`}
                                className="pl-9 pr-10"
                                disabled={isLoading}
                            />
                            <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                disabled={isLoading}
                            >
                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                                Your key is stored locally in your browser and never sent to our servers.
                            </p>
                            <button
                                type="button"
                                onClick={handleClearAllKeys}
                                disabled={isLoading}
                                className="text-xs text-muted-foreground hover:text-destructive underline-offset-2 hover:underline disabled:opacity-50"
                            >
                                Clear all keys
                            </button>
                        </div>
                        {continueError && (
                            <p className="text-xs text-destructive">{continueError}</p>
                        )}
                    </div>

                    {/* Max Suggestions */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="max-suggestions">Maximum Suggestions</Label>
                            <span className="text-sm font-medium text-primary">{maxSuggestions}</span>
                        </div>
                        <input
                            id="max-suggestions"
                            type="range"
                            min="1"
                            max="10"
                            value={maxSuggestions}
                            onChange={(e) => setMaxSuggestions(Number(e.target.value))}
                            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                            disabled={isLoading}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>1</span>
                            <span>5</span>
                            <span>10</span>
                        </div>
                    </div>

                    {/* Advanced — collapsed by default. Houses the less-common
                        knobs (reasoning effort, dataset access + iteration
                        cap, streaming idle timeout) so first-time users see a
                        simple form. */}
                    <div className="border-t pt-4">
                        <button
                            type="button"
                            onClick={() => setAdvancedOpen(v => !v)}
                            className={cn(
                                "flex items-center gap-2 w-full text-left text-sm font-medium",
                                "text-muted-foreground hover:text-foreground transition-colors",
                                "focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-md py-1"
                            )}
                            aria-expanded={advancedOpen}
                        >
                            {advancedOpen ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronRight className="w-4 h-4" />
                            )}
                            Advanced
                        </button>

                        {advancedOpen && (
                            <div className="space-y-6 pt-4">
                                {/* Reasoning Effort */}
                                <div className="space-y-2">
                                    <Label>Reasoning Effort</Label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {([undefined, 'low', 'medium', 'high'] as const).map((level) => (
                                            <button
                                                key={level ?? 'none'}
                                                type="button"
                                                onClick={() => setEffort(level as AIEffort | undefined)}
                                                disabled={isLoading}
                                                className={cn(
                                                    "px-3 py-1.5 text-sm rounded-md border transition-all",
                                                    "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20",
                                                    effort === level
                                                        ? "border-primary bg-primary/5 font-medium"
                                                        : "border-border",
                                                    isLoading && "opacity-50 cursor-not-allowed"
                                                )}
                                            >
                                                {level ? level.charAt(0).toUpperCase() + level.slice(1) : 'Default'}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Higher effort enables extended thinking for better results but uses more tokens.
                                    </p>
                                </div>

                                {/* Dataset Access (privacy toggle) */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex-1">
                                            <Label htmlFor="dataset-access">Allow AI to interact with dataset</Label>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                When off, the AI sees only column names and your descriptions. When on,
                                                the AI can run read-only queries (sample rows, value counts, statistics)
                                                on your data — better suggestions, but actual values are sent to the
                                                provider.
                                            </p>
                                        </div>
                                        <button
                                            id="dataset-access"
                                            type="button"
                                            role="switch"
                                            aria-checked={datasetAccess}
                                            onClick={() => setDatasetAccess(v => !v)}
                                            disabled={isLoading}
                                            className={cn(
                                                "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors",
                                                "focus:outline-none focus:ring-2 focus:ring-primary/40",
                                                datasetAccess ? "bg-primary" : "bg-muted",
                                                isLoading && "opacity-50 cursor-not-allowed"
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "inline-block h-5 w-5 transform rounded-full bg-background shadow-sm transition-transform",
                                                    datasetAccess ? "translate-x-5" : "translate-x-0.5"
                                                )}
                                            />
                                        </button>
                                    </div>
                                </div>

                                {/* Max Tool Iterations — only meaningful when dataset access is on. */}
                                {datasetAccess && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="max-tool-iterations">Maximum Tool Iterations</Label>
                                            <span className="text-sm font-medium text-primary">{maxToolIterations}</span>
                                        </div>
                                        <input
                                            id="max-tool-iterations"
                                            type="range"
                                            min="1"
                                            max="30"
                                            value={maxToolIterations}
                                            onChange={(e) => setMaxToolIterations(Number(e.target.value))}
                                            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                                            disabled={isLoading}
                                        />
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span>1</span>
                                            <span>15</span>
                                            <span>30</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            How many times the AI may inspect the dataset before producing
                                            suggestions. Higher values allow more thorough analysis at the cost
                                            of latency.
                                        </p>
                                    </div>
                                )}

                                {/* Idle Timeout — per-chunk streaming timeout. */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="idle-timeout">Idle Timeout</Label>
                                        <span className="text-sm font-medium text-primary">{idleTimeoutS}s</span>
                                    </div>
                                    <input
                                        id="idle-timeout"
                                        type="range"
                                        min="10"
                                        max="600"
                                        step="10"
                                        value={idleTimeoutS}
                                        onChange={(e) => setIdleTimeoutS(Number(e.target.value))}
                                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                                        disabled={isLoading}
                                    />
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>10s</span>
                                        <span>180s</span>
                                        <span>600s</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        How long to wait between streaming chunks before declaring the
                                        provider stalled. The timer resets on every chunk, so a
                                        long-but-progressing response is never killed — only true stalls
                                        fire. Raise this if you see timeouts on slow reasoning models.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleContinue}
                        disabled={!apiKey.trim() || !selectedModel || isLoading}
                    >
                        {isLoading ? 'Generating...' : 'Generate Suggestions'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default AISettingsModal;
