import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GeminiIcon, OpenAIIcon, ClaudeIcon, PROVIDER_ICONS } from '../AIProviderIcons';

describe('AIProviderIcons', () => {
    it('renders GeminiIcon', () => {
        const { container } = render(<GeminiIcon />);
        expect(container.querySelector('img')).toBeTruthy();
        expect(container.querySelector('img')?.getAttribute('src')).toBe('/ai-logos/gemini-color.svg');
    });

    it('renders GeminiIcon with custom className', () => {
        const { container } = render(<GeminiIcon className="w-8 h-8" />);
        const img = container.querySelector('img');
        expect(img?.getAttribute('class')).toBe('w-8 h-8');
    });

    it('renders OpenAIIcon', () => {
        const { container } = render(<OpenAIIcon />);
        expect(container.querySelector('img')).toBeTruthy();
        expect(container.querySelector('img')?.getAttribute('src')).toBe('/ai-logos/openai-svgrepo-com.svg');
    });

    it('renders ClaudeIcon', () => {
        const { container } = render(<ClaudeIcon />);
        expect(container.querySelector('img')).toBeTruthy();
        expect(container.querySelector('img')?.getAttribute('src')).toBe('/ai-logos/claude-color.svg');
    });

    it('PROVIDER_ICONS has all three providers', () => {
        expect(PROVIDER_ICONS).toHaveProperty('gemini');
        expect(PROVIDER_ICONS).toHaveProperty('openai');
        expect(PROVIDER_ICONS).toHaveProperty('claude');
    });

    it('PROVIDER_ICONS values are renderable', () => {
        const { container } = render(<>{PROVIDER_ICONS.gemini}</>);
        expect(container.querySelector('img')).toBeTruthy();
    });
});
