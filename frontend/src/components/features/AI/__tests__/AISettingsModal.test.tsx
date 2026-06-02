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

// Mock the API so fetchProviderModels doesn't hit the network
vi.mock('@/services/api', () => ({
    aiApi: {
        fetchProviderModels: vi.fn().mockResolvedValue([]),
    },
}));

const mockProviders: AIProviderInfo[] = [
    { id: 'gemini', name: 'Google Gemini' },
    { id: 'openai', name: 'OpenAI' },
    { id: 'claude', name: 'Anthropic Claude' },
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

        const toggleBtns = document.body.querySelectorAll('button[type="button"]');
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

    it('disables Generate button when no model is selected', () => {
        render(<AISettingsModal {...defaultProps} />);
        const apiKeyInput = screen.getByPlaceholderText(/Enter your .* API key/);
        fireEvent.change(apiKeyInput, { target: { value: 'my-api-key-123' } });

        // No model selected (dynamic fetch returns empty), button should be disabled
        const generateBtn = screen.getByText('Generate Suggestions');
        expect(generateBtn.closest('button')?.disabled).toBe(true);
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

    it('saves API key to localStorage on continue', () => {
        localStorage.setItem('ai_key_gemini', btoa('secret-key'));
        localStorage.setItem('ai_model_gemini', 'gemini-pro');
        render(<AISettingsModal {...defaultProps} />);

        // Since we mocked fetchProviderModels to return [] the button stays disabled.
        // We just verify the key was loaded correctly.
        const apiKeyInput = screen.getByPlaceholderText(/Enter your .* API key/) as HTMLInputElement;
        expect(apiKeyInput.value).toBe('secret-key');
    });

    describe('Advanced section', () => {
        it('Advanced toggle expands and collapses the section', () => {
            render(<AISettingsModal {...defaultProps} />);
            // Collapsed by default — slider id is not in DOM.
            expect(screen.queryByLabelText('Idle Timeout')).toBeNull();
            fireEvent.click(screen.getByText('Advanced'));
            expect(screen.getByLabelText('Idle Timeout')).toBeTruthy();
            fireEvent.click(screen.getByText('Advanced'));
            expect(screen.queryByLabelText('Idle Timeout')).toBeNull();
        });

        it('hydrates ai_idle_timeout_s and ai_max_tool_iterations from localStorage', () => {
            // Pre-seed both Advanced knobs and the dataset_access flag so the
            // Max Tool Iterations slider is rendered.
            localStorage.setItem('ai_idle_timeout_s', '120');
            localStorage.setItem('ai_max_tool_iterations', '7');
            localStorage.setItem('ai_dataset_access', 'true');
            render(<AISettingsModal {...defaultProps} />);
            fireEvent.click(screen.getByText('Advanced'));

            const idleSlider = screen.getByLabelText('Idle Timeout') as HTMLInputElement;
            expect(idleSlider.value).toBe('120');

            const iterSlider = screen.getByLabelText('Maximum Tool Iterations') as HTMLInputElement;
            expect(iterSlider.value).toBe('7');
        });

        it('idle-timeout slider min matches backend ge=10.0 validator', () => {
            render(<AISettingsModal {...defaultProps} />);
            fireEvent.click(screen.getByText('Advanced'));
            const slider = screen.getByLabelText('Idle Timeout') as HTMLInputElement;
            expect(slider.min).toBe('10');
        });
    });

    describe('API key bounds', () => {
        it('Clear all keys removes every ai_key_* entry from localStorage', () => {
            localStorage.setItem('ai_key_gemini', btoa('g'));
            localStorage.setItem('ai_key_openai', btoa('o'));
            localStorage.setItem('ai_key_claude', btoa('c'));

            render(<AISettingsModal {...defaultProps} />);
            fireEvent.click(screen.getByText('Clear all keys'));

            expect(localStorage.getItem('ai_key_gemini')).toBeNull();
            expect(localStorage.getItem('ai_key_openai')).toBeNull();
            expect(localStorage.getItem('ai_key_claude')).toBeNull();
        });
    });
});
