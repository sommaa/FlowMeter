import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AIWizardModal } from '../AIWizardModal';
import { useStore } from '@/store';
import { aiApi } from '@/services/api';

vi.mock('@/store', () => ({
    useStore: vi.fn(),
}));

vi.mock('@/services/api', () => ({
    aiApi: {
        getProviders: vi.fn(),
        suggest: vi.fn(),
        applySuggestions: vi.fn(),
    },
}));

// Mock the child components to isolate AIWizardModal behavior
vi.mock('../ColumnDescriptionEditor', () => ({
    ColumnDescriptionEditor: ({ columnDescriptions, onDescriptionsChange, guidanceText, onGuidanceChange }: any) => (
        <div data-testid="column-description-editor">
            <span data-testid="descriptions-count">{Object.keys(columnDescriptions).length}</span>
            <span data-testid="guidance-text">{guidanceText}</span>
            <button
                data-testid="fill-descriptions"
                onClick={() => {
                    onDescriptionsChange({ col1: 'desc1', col2: 'desc2' });
                    onGuidanceChange('some guidance');
                }}
            >
                Fill
            </button>
        </div>
    ),
}));

vi.mock('../AISettingsModal', () => ({
    AISettingsModal: ({ isOpen, onClose, onContinue, isLoading }: any) => (
        isOpen ? (
            <div data-testid="ai-settings-modal">
                <button data-testid="settings-continue" onClick={() => onContinue('gemini', 'test-key', 'gemini-pro', 5)}>
                    Continue
                </button>
                <button data-testid="settings-close" onClick={onClose}>Close</button>
            </div>
        ) : null
    ),
}));

vi.mock('../AISuggestionsPanel', () => ({
    AISuggestionsPanel: ({ suggestions, isLoading, error, onApply, onApplyAll, onRetry }: any) => (
        <div data-testid="suggestions-panel">
            <span data-testid="suggestions-count">{suggestions.length}</span>
            <span data-testid="suggestions-loading">{String(isLoading)}</span>
            {error && <span data-testid="suggestions-error">{error}</span>}
            {onRetry && <button data-testid="suggestions-retry" onClick={onRetry}>Retry</button>}
            {suggestions.map((s: any, i: number) => (
                <button key={s.id ?? i} data-testid={`apply-${i}`} onClick={() => onApply(s)}>Apply {i}</button>
            ))}
            <button data-testid="apply-all" onClick={onApplyAll}>Apply All</button>
        </div>
    ),
}));

const mockDataset = {
    id: 'ds-1',
    name: 'test.csv',
    rows: 100,
    columns: 2,
    column_names: ['col1', 'col2'],
    numeric_columns: ['col1'],
    datetime_columns: ['col2'],
    memory_usage_kb: 50,
    uploaded_at: '2025-01-01T00:00:00Z',
};

describe('AIWizardModal', () => {
    const defaultMockState = {
        currentDataset: mockDataset,
        visualizations: [],
        columnDescriptions: { col1: 'desc1', col2: 'desc2' },
        setColumnDescriptions: vi.fn(),
        aiGuidanceText: 'analyze trends',
        setAiGuidanceText: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useStore).mockImplementation((selector: any) => selector(defaultMockState));
        vi.mocked(aiApi.getProviders).mockResolvedValue([
            { id: 'gemini', name: 'Google Gemini', model: 'gemini-pro', models: [] },
        ]);
    });

    it('renders the wizard dialog when isOpen is true', () => {
        render(
            <AIWizardModal isOpen={true} onClose={vi.fn()} onComplete={vi.fn()} />
        );
        expect(screen.getByText('AI-Assisted Visualization')).toBeTruthy();
    });

    it('does not render dialog content when isOpen is false', () => {
        render(
            <AIWizardModal isOpen={false} onClose={vi.fn()} onComplete={vi.fn()} />
        );
        expect(screen.queryByText('AI-Assisted Visualization')).toBeNull();
    });

    it('starts on the descriptions step with step indicator', () => {
        render(
            <AIWizardModal isOpen={true} onClose={vi.fn()} onComplete={vi.fn()} />
        );
        expect(screen.getByText('Describe Data')).toBeTruthy();
        expect(screen.getByText('Review Suggestions')).toBeTruthy();
        expect(screen.getByTestId('column-description-editor')).toBeTruthy();
    });

    it('shows description step description text', () => {
        render(
            <AIWizardModal isOpen={true} onClose={vi.fn()} onComplete={vi.fn()} />
        );
        expect(
            screen.getByText(/Describe your data and analysis goals/)
        ).toBeTruthy();
    });

    it('calls onClose when Cancel button is clicked on descriptions step', () => {
        const onClose = vi.fn();
        render(
            <AIWizardModal isOpen={true} onClose={onClose} onComplete={vi.fn()} />
        );
        fireEvent.click(screen.getByText('Cancel'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('enables Continue button when descriptions are complete', () => {
        render(
            <AIWizardModal isOpen={true} onClose={vi.fn()} onComplete={vi.fn()} />
        );
        const continueBtn = screen.getByText('Continue');
        // With the default mock state having descriptions and guidance, it should be enabled
        expect(continueBtn.closest('button')?.disabled).toBe(false);
    });

    it('disables Continue button when descriptions are incomplete', () => {
        vi.mocked(useStore).mockImplementation((selector: any) =>
            selector({
                ...defaultMockState,
                columnDescriptions: { col1: 'desc1' }, // missing col2
                aiGuidanceText: 'guidance',
            })
        );
        render(
            <AIWizardModal isOpen={true} onClose={vi.fn()} onComplete={vi.fn()} />
        );
        const continueBtn = screen.getByText('Continue');
        expect(continueBtn.closest('button')?.disabled).toBe(true);
    });

    it('navigates to settings step when Continue is clicked', () => {
        render(
            <AIWizardModal isOpen={true} onClose={vi.fn()} onComplete={vi.fn()} />
        );
        fireEvent.click(screen.getByText('Continue'));
        // Settings modal should now be visible (rendered by AISettingsModal mock)
        expect(screen.getByTestId('ai-settings-modal')).toBeTruthy();
    });

    it('transitions to suggestions step after settings Continue', async () => {
        vi.mocked(aiApi.suggest).mockResolvedValue({
            suggestions: [
                {
                    id: 'test-suggestion-1',
                    title: 'Test Chart',
                    description: 'A test',
                    viz_type: 'line',
                    x_axis: 'col1',
                    y_axes: ['col2'],
                    confidence: 0.9,
                    reasoning: 'Good match',
                },
            ],
        });

        render(
            <AIWizardModal isOpen={true} onClose={vi.fn()} onComplete={vi.fn()} />
        );

        // Go to settings
        fireEvent.click(screen.getByText('Continue'));
        // Click continue in settings modal
        fireEvent.click(screen.getByTestId('settings-continue'));

        // Should now show suggestions panel
        await waitFor(() => {
            expect(screen.getByTestId('suggestions-panel')).toBeTruthy();
        });
    });

    it('fetches providers on modal open', async () => {
        render(
            <AIWizardModal isOpen={true} onClose={vi.fn()} onComplete={vi.fn()} />
        );
        await waitFor(() => {
            expect(aiApi.getProviders).toHaveBeenCalled();
        });
    });

    it('shows Back and Done buttons on suggestions step', async () => {
        vi.mocked(aiApi.suggest).mockResolvedValue({ suggestions: [] });

        render(
            <AIWizardModal isOpen={true} onClose={vi.fn()} onComplete={vi.fn()} />
        );

        fireEvent.click(screen.getByText('Continue'));
        fireEvent.click(screen.getByTestId('settings-continue'));

        await waitFor(() => {
            expect(screen.getByText('Back')).toBeTruthy();
            expect(screen.getByText('Done')).toBeTruthy();
        });
    });
});
