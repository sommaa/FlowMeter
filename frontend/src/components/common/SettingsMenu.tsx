import React, { useState, useEffect } from 'react';
import { Check, Moon, Sun, Settings, Download, Sparkles, Key, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { useStore } from '@/store';
import { THEMES } from '@/lib/themes';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from '@/components/common';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AIProvider } from '@/types';

/**
 * Configuration for supported AI providers with API key management.
 *
 * Each provider includes:
 * - id: Provider identifier matching AIProvider type
 * - name: Display name for UI
 * - link: URL to obtain API keys
 */
const AI_PROVIDERS: { id: AIProvider; name: string; link: string }[] = [
    { id: 'gemini', name: 'Google Gemini', link: 'https://aistudio.google.com/apikey' },
    { id: 'openai', name: 'OpenAI', link: 'https://platform.openai.com/api-keys' },
    { id: 'claude', name: 'Anthropic Claude', link: 'https://console.anthropic.com/settings/keys' },
];

/**
 * Application settings menu with theme, appearance, and AI configuration.
 *
 * Provides a popover interface for managing:
 * - **Appearance**: Light/Dark mode toggle and theme color selection
 * - **Export Settings**: Opens the export configuration modal
 * - **AI Settings**: API key management for AI visualization providers
 *   - Supports Gemini, OpenAI, and Claude
 *   - Keys are stored base64-encoded in localStorage with key `ai_key_{provider}`
 *   - Shows/hides key input and displays saved key count
 *
 * The menu persists user preferences and provides visual feedback for
 * active settings (theme selection, saved API keys).
 *
 * @example
 * ```tsx
 * <SettingsMenu />
 * ```
 *
 * Storage keys:
 * - `ai_key_gemini`: Base64-encoded Gemini API key
 * - `ai_key_openai`: Base64-encoded OpenAI API key
 * - `ai_key_claude`: Base64-encoded Claude API key
 */
export const SettingsMenu: React.FC = () => {
    const theme = useStore((state) => state.theme);
    const setTheme = useStore((state) => state.setTheme);
    const isDarkMode = useStore((state) => state.isDarkMode);
    const toggleDarkMode = useStore((state) => state.toggleDarkMode);
    const setExportConfigOpen = useStore((state) => state.setExportConfigOpen);
    const [open, setOpen] = useState(false);

    // AI Settings state
    const [showAISettings, setShowAISettings] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<AIProvider>('gemini');
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [savedProviders, setSavedProviders] = useState<Set<AIProvider>>(new Set());

    // Load saved keys on mount
    useEffect(() => {
        const saved = new Set<AIProvider>();
        AI_PROVIDERS.forEach(p => {
            if (localStorage.getItem(`ai_key_${p.id}`)) {
                saved.add(p.id);
            }
        });
        setSavedProviders(saved);
    }, [open]);

    // Load key when provider changes
    useEffect(() => {
        const saved = localStorage.getItem(`ai_key_${selectedProvider}`);
        if (saved) {
            try {
                setApiKey(atob(saved));
            } catch {
                setApiKey('');
            }
        } else {
            setApiKey('');
        }
    }, [selectedProvider]);

    const handleSaveKey = () => {
        if (apiKey.trim()) {
            localStorage.setItem(`ai_key_${selectedProvider}`, btoa(apiKey.trim()));
            setSavedProviders(prev => new Set([...prev, selectedProvider]));
        } else {
            localStorage.removeItem(`ai_key_${selectedProvider}`);
            setSavedProviders(prev => {
                const next = new Set(prev);
                next.delete(selectedProvider);
                return next;
            });
        }
    };

    const providerInfo = AI_PROVIDERS.find(p => p.id === selectedProvider);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    className="w-8 h-8 rounded-lg p-0 flex items-center justify-center transition-colors duration-150"
                    title="App Configuration"
                >
                    <Settings className="w-4 h-4 text-muted-foreground" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2">
                <div className="space-y-3">
                    {/* General Controls */}
                    <div>
                        <div className="text-xs font-semibold text-muted-foreground mb-2 px-1">
                            General
                        </div>
                        <button
                            onClick={() => {
                                setExportConfigOpen(true);
                                setOpen(false);
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
                        >
                            <div className="p-1 rounded-md bg-primary/10 text-primary">
                                <Download className="w-3.5 h-3.5" />
                            </div>
                            <span>Export Settings</span>
                        </button>
                        <button
                            onClick={() => setShowAISettings(!showAISettings)}
                            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <div className="p-1 rounded-md bg-primary/10 text-primary">
                                    <Sparkles className="w-3.5 h-3.5" />
                                </div>
                                <span>AI Settings</span>
                            </div>
                            {savedProviders.size > 0 && (
                                <span className="text-xs text-primary bg-primary/15 px-1.5 py-0.5 rounded">
                                    {savedProviders.size} key{savedProviders.size > 1 ? 's' : ''}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* AI Settings Expanded */}
                    {showAISettings && (
                        <div className="px-2 py-2 bg-muted/30 rounded-lg space-y-3">
                            <div className="text-xs text-muted-foreground">
                                Configure API keys for AI visualization suggestions
                            </div>

                            {/* Provider Selection */}
                            <div className="flex gap-1">
                                {AI_PROVIDERS.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => setSelectedProvider(p.id)}
                                        className={cn(
                                            "flex-1 text-xs py-1.5 rounded transition-colors",
                                            selectedProvider === p.id
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted hover:bg-muted/80"
                                        )}
                                    >
                                        {p.name.split(' ')[0]}
                                    </button>
                                ))}
                            </div>

                            {/* API Key Input */}
                            <div className="relative">
                                <Key className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <Input
                                    type={showKey ? 'text' : 'password'}
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder={`${providerInfo?.name || ''} API Key`}
                                    className="pl-8 pr-8 h-8 text-xs"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowKey(!showKey)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-between gap-2">
                                <a
                                    href={providerInfo?.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline flex items-center gap-1"
                                >
                                    Get Key <ExternalLink className="w-3 h-3" />
                                </a>
                                <Button
                                    size="sm"
                                    variant={savedProviders.has(selectedProvider) ? "outline" : "primary"}
                                    onClick={handleSaveKey}
                                    className="h-7 text-xs"
                                >
                                    {savedProviders.has(selectedProvider) ? 'Update' : 'Save'}
                                </Button>
                            </div>

                            {savedProviders.has(selectedProvider) && (
                                <div className="flex items-center gap-1 text-xs text-primary">
                                    <Check className="w-3 h-3" />
                                    Key saved locally
                                </div>
                            )}
                        </div>
                    )}

                    <div className="h-px bg-border" />

                    {/* Mode Toggle */}
                    <div>
                        <div className="text-xs font-semibold text-muted-foreground mb-2 px-1">
                            Appearance
                        </div>
                        <div className="flex items-center bg-muted p-1 rounded-lg mb-2">
                            <button
                                className={cn(
                                    "flex-1 text-xs font-medium py-1.5 rounded-md transition-all flex items-center justify-center gap-2",
                                    !isDarkMode ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                                onClick={() => isDarkMode && toggleDarkMode()}
                            >
                                <Sun className="w-3.5 h-3.5" /> Light
                            </button>
                            <button
                                className={cn(
                                    "flex-1 text-xs font-medium py-1.5 rounded-md transition-all flex items-center justify-center gap-2",
                                    isDarkMode ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                                onClick={() => !isDarkMode && toggleDarkMode()}
                            >
                                <Moon className="w-3.5 h-3.5" /> Dark
                            </button>
                        </div>

                        {/* Theme List */}
                        <div className="space-y-1">
                            {Object.values(THEMES).map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => {
                                        setTheme(t.id);
                                    }}
                                    className={cn(
                                        "w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors",
                                        theme === t.id && "bg-accent/50 text-accent-foreground"
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-3.5 h-3.5 rounded-full border border-border shadow-sm ring-2 ring-transparent transition-all"
                                            style={{
                                                backgroundColor: `hsl(${t.colors.light.primary})`,
                                                borderColor: theme === t.id ? 'currentColor' : undefined
                                            }}
                                        />
                                        <span>{t.name}</span>
                                    </div>
                                    {theme === t.id && <Check className="w-4 h-4 text-primary" />}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover >
    );
};
