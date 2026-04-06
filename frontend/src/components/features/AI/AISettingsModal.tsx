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

import React, { useState, useEffect } from 'react';
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
import { Eye, EyeOff, Key, Sparkles, ExternalLink, Check } from 'lucide-react';
import { AIProvider, AIProviderInfo } from '@/types';
import { cn } from '@/lib/utils';

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
    onContinue: (provider: AIProvider, apiKey: string, model?: string, maxSuggestions?: number) => void;
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

    const providerInfo = providers.find(p => p.id === provider);

    // Load saved key and model when provider changes
    useEffect(() => {
        const savedKey = localStorage.getItem(`ai_key_${provider}`);
        if (savedKey) {
            try {
                setApiKey(atob(savedKey));
            } catch {
                setApiKey('');
            }
        } else {
            setApiKey('');
        }

        // Load saved model or use default
        const savedModel = localStorage.getItem(`ai_model_${provider}`);
        if (savedModel && providerInfo?.models?.some(m => m.id === savedModel)) {
            setSelectedModel(savedModel);
        } else {
            setSelectedModel(providerInfo?.model || '');
        }
    }, [provider, providerInfo]);

    // Load saved max suggestions on mount
    useEffect(() => {
        const savedMaxSuggestions = localStorage.getItem('ai_max_suggestions');
        if (savedMaxSuggestions) {
            const parsed = parseInt(savedMaxSuggestions, 10);
            if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
                setMaxSuggestions(parsed);
            }
        }
    }, []);

    const handleContinue = () => {
        // Save key and model
        if (apiKey.trim()) {
            localStorage.setItem(`ai_key_${provider}`, btoa(apiKey.trim()));
        }
        if (selectedModel) {
            localStorage.setItem(`ai_model_${provider}`, selectedModel);
        }
        localStorage.setItem('ai_max_suggestions', String(maxSuggestions));
        onContinue(provider, apiKey.trim(), selectedModel, maxSuggestions);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary" />
                        AI Configuration
                    </DialogTitle>
                    <DialogDescription>
                        Select your preferred AI provider, model, and enter your API key.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
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
                                        <div className="text-xs text-muted-foreground">
                                            {p.models?.find(m => m.id === (provider === p.id ? selectedModel : p.model))?.name || p.model}
                                        </div>
                                    </div>
                                    {provider === p.id && (
                                        <Check className="w-4 h-4 text-primary" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Model Selection */}
                    {providerInfo?.models && providerInfo.models.length > 0 && (
                        <div className="space-y-2">
                            <Label htmlFor="model-select">Model</Label>
                            <Select
                                value={selectedModel}
                                onValueChange={setSelectedModel}
                                disabled={isLoading}
                            >
                                <SelectTrigger id="model-select">
                                    <SelectValue placeholder="Select a model" />
                                </SelectTrigger>
                                <SelectContent>
                                    {providerInfo.models.map(m => (
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
                        <p className="text-xs text-muted-foreground">
                            Your key is stored locally in your browser and never sent to our servers.
                        </p>
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
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleContinue}
                        disabled={!apiKey.trim() || isLoading}
                    >
                        {isLoading ? 'Generating...' : 'Generate Suggestions'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default AISettingsModal;
