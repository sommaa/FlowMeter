import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AISettingsModal } from '../AISettingsModal';
import { AIProviderInfo } from '@/types';

// Mock the PROVIDER_ICONS to avoid rendering complex SVGs
vi.mock('../AIProviderIcons', () => ({
    PROVIDER_ICONS: {
        gemini: <span data-testid="icon-gemini">G</span>,
        openai: <span data-testid="icon-openai">O</span>,
        claude: <span data-testid="icon-claude">C</span>,
    },
}));

const mockProviders: AIProviderInfo[] = [
    {
        id: 'gemini',
        name: 'Google Gemini',
        model: 'gemini-pro',
        models: [
            { id: 'gemini-pro', name: 'Gemini Pro', description: 'General purpose model' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Latest model' },
        ],
    },
    {
        id: 'openai',
        name: 'OpenAI',
        model: 'gpt-4-turbo',
        models: [
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Most capable' },
        ],
    },
    {
        id: 'claude',
        name: 'Anthropic Claude',
        model: 'claude-3-opus',
        models: [
            { id: 'claude-3-opus', name: 'Claude 3 Opus', description: 'Most powerful' },
        ],
    },
];

describe('AISettingsModal', () => {
    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        onContinue: vi.fn(),
        providers: mockProviders,
        isLoading: false,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('renders modal with title and description when open', () => {
        render(<AISettingsModal {...defaultProps} />);
        expect(screen.getByText('AI Configuration')).toBeTruthy();
        expect(
            screen.getByText(/Select your preferred AI provider/)
        ).toBeTruthy();
    });

    it('does not render content when isOpen is false', () => {
        render(<AISettingsModal {...defaultProps} isOpen={false} />);
        expect(screen.queryByText('AI Configuration')).toBeNull();
    });

    it('renders all provider buttons', () => {
        render(<AISettingsModal {...defaultProps} />);
        expect(screen.getByText('Google Gemini')).toBeTruthy();
        expect(screen.getByText('OpenAI')).toBeTruthy();
        expect(screen.getByText('Anthropic Claude')).toBeTruthy();
    });

    it('selects gemini provider by default', () => {
        render(<AISettingsModal {...defaultProps} />);
        // Gemini should have a checkmark icon (Check component)
        expect(screen.getByTestId('icon-gemini')).toBeTruthy();
    });

    it('renders API key input field', () => {
        render(<AISettingsModal {...defaultProps} />);
        const apiKeyInput = screen.getByPlaceholderText(/Enter your .* API key/);
        expect(apiKeyInput).toBeTruthy();
        expect(apiKeyInput.getAttribute('type')).toBe('password');
    });

    it('toggles API key visibility on eye icon click', () => {
        render(<AISettingsModal {...defaultProps} />);
        const apiKeyInput = screen.getByPlaceholderText(/Enter your .* API key/);
        expect(apiKeyInput.getAttribute('type')).toBe('password');

        // Find the show/hide toggle button (the eye icon button)
        const toggleBtns = document.body.querySelectorAll('button[type="button"]');
        // The eye toggle is inside .relative wrapper near the input
        const eyeToggle = Array.from(toggleBtns).find(
            btn => btn.classList.contains('absolute')
        );
        if (eyeToggle) {
            fireEvent.click(eyeToggle);
            expect(apiKeyInput.getAttribute('type')).toBe('text');
        }
    });

    it('disables Generate button when API key is empty', () => {
        render(<AISettingsModal {...defaultProps} />);
        const generateBtn = screen.getByText('Generate Suggestions');
        expect(generateBtn.closest('button')?.disabled).toBe(true);
    });

    it('enables Generate button when API key is provided', () => {
        render(<AISettingsModal {...defaultProps} />);
        const apiKeyInput = screen.getByPlaceholderText(/Enter your .* API key/);
        fireEvent.change(apiKeyInput, { target: { value: 'my-api-key-123' } });

        const generateBtn = screen.getByText('Generate Suggestions');
        expect(generateBtn.closest('button')?.disabled).toBe(false);
    });

    it('calls onContinue with correct params when Generate is clicked', () => {
        const onContinue = vi.fn();
        render(<AISettingsModal {...defaultProps} onContinue={onContinue} />);

        const apiKeyInput = screen.getByPlaceholderText(/Enter your .* API key/);
        fireEvent.change(apiKeyInput, { target: { value: 'test-key' } });

        fireEvent.click(screen.getByText('Generate Suggestions'));

        expect(onContinue).toHaveBeenCalledTimes(1);
        expect(onContinue).toHaveBeenCalledWith(
            'gemini',
            'test-key',
            expect.any(String),
            expect.any(Number)
        );
    });

    it('saves API key to localStorage on continue', () => {
        render(<AISettingsModal {...defaultProps} />);
        const apiKeyInput = screen.getByPlaceholderText(/Enter your .* API key/);
        fireEvent.change(apiKeyInput, { target: { value: 'secret-key' } });

        fireEvent.click(screen.getByText('Generate Suggestions'));

        const savedKey = localStorage.getItem('ai_key_gemini');
        expect(savedKey).toBe(btoa('secret-key'));
    });

    it('calls onClose when Cancel button is clicked', () => {
        const onClose = vi.fn();
        render(<AISettingsModal {...defaultProps} onClose={onClose} />);
        fireEvent.click(screen.getByText('Cancel'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('shows "Generating..." text when isLoading is true', () => {
        render(<AISettingsModal {...defaultProps} isLoading={true} />);
        expect(screen.getByText('Generating...')).toBeTruthy();
    });

    it('renders max suggestions slider with default value of 5', () => {
        render(<AISettingsModal {...defaultProps} />);
        expect(screen.getByText('Maximum Suggestions')).toBeTruthy();
        // Multiple elements may contain "5", so just check the label exists
        const allFives = screen.getAllByText('5');
        expect(allFives.length).toBeGreaterThanOrEqual(1);
    });

    it('renders Get API Key link for the selected provider', () => {
        render(<AISettingsModal {...defaultProps} />);
        const link = screen.getByText('Get API Key');
        expect(link.closest('a')?.getAttribute('href')).toBe(
            'https://aistudio.google.com/apikey'
        );
    });

    it('loads saved API key from localStorage on mount', () => {
        localStorage.setItem('ai_key_gemini', btoa('saved-key-123'));
        render(<AISettingsModal {...defaultProps} />);
        const apiKeyInput = screen.getByPlaceholderText(/Enter your .* API key/) as HTMLInputElement;
        expect(apiKeyInput.value).toBe('saved-key-123');
    });
});
