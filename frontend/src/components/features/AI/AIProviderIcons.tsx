/**
 * AI Provider Icons - Official brand SVG icons for AI providers.
 *
 * This module exports React components for official brand icons of supported AI providers:
 * - **Gemini**: Google's four-pointed star logo with gradient (colorful design)
 * - **OpenAI**: Official monochrome logo (respects currentColor)
 * - **Claude**: Anthropic's branded icon in coral/orange (RGB 217,119,87)
 *
 * All icons are provided as inline SVG components with:
 * - Customizable className prop for sizing (default: w-6 h-6)
 * - Preserved aspect ratios and viewBox dimensions
 * - Official brand colors and gradients
 * - Proper filter and mask definitions for complex designs
 *
 * The module also exports a `PROVIDER_ICONS` record for convenient lookup by provider ID.
 *
 * Usage: Import individual icon components or use the PROVIDER_ICONS map for dynamic selection.
 *
 * @module components/features/AI/AIProviderIcons
 */

import React from 'react';
import { AIProvider } from '@/types';

/**
 * Google Gemini icon component.
 *
 * Official four-pointed star logo with gradient and glow effects.
 * Features multiple colored filter layers creating the signature Gemini appearance.
 *
 * @param {Object} props - Component props
 * @param {string} [props.className] - CSS classes for sizing (default: "w-6 h-6")
 * @returns {JSX.Element} Gemini SVG icon
 */
export const GeminiIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
    <img src="/ai-logos/gemini-color.svg" alt="Gemini" className={className} />
);

/**
 * OpenAI icon component.
 *
 * Official OpenAI logo in monochrome design.
 * Uses currentColor for fill, allowing theme integration.
 *
 * @param {Object} props - Component props
 * @param {string} [props.className] - CSS classes for sizing (default: "w-6 h-6")
 * @returns {JSX.Element} OpenAI SVG icon
 */
export const OpenAIIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
    <img src="/ai-logos/openai-svgrepo-com.svg" alt="OpenAI" className={className} />
);

/**
 * Anthropic Claude icon component.
 *
 * Official Claude logo in coral/orange brand color (RGB 217,119,87).
 * Features distinctive abstract design representing Claude's brand identity.
 *
 * @param {Object} props - Component props
 * @param {string} [props.className] - CSS classes for sizing (default: "w-6 h-6")
 * @returns {JSX.Element} Claude SVG icon
 */
export const ClaudeIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
    <img src="/ai-logos/claude-color.svg" alt="Claude" className={className} />
);

/**
 * Provider icons lookup map for dynamic icon selection.
 *
 * Maps AIProvider IDs to their corresponding icon components.
 * Useful for rendering icons dynamically based on provider selection.
 *
 * @constant {Record<AIProvider, React.ReactNode>}
 *
 * @example
 * ```tsx
 * // Dynamic icon rendering
 * const IconComponent = PROVIDER_ICONS[selectedProvider];
 * return <div>{IconComponent}</div>;
 *
 * // Or access directly
 * <div>{PROVIDER_ICONS['gemini']}</div>
 * ```
 */
export const PROVIDER_ICONS: Record<AIProvider, React.ReactNode> = {
    gemini: <GeminiIcon className="w-6 h-6" />,
    openai: <OpenAIIcon className="w-6 h-6" />,
    claude: <ClaudeIcon className="w-6 h-6" />
};

export default PROVIDER_ICONS;
