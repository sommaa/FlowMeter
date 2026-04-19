import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AISuggestionsPanel } from '../AISuggestionsPanel';
import { AISuggestion } from '@/types';

let idCounter = 0;
const makeSuggestion = (overrides?: Partial<AISuggestion>): AISuggestion => ({
    id: `suggestion-${++idCounter}`,
    title: 'Temperature Trend',
    description: 'Shows temperature changes over time',
    viz_type: 'line',
    x_axis: 'Timestamp',
    y_axes: ['Temperature'],
    confidence: 0.92,
    reasoning: 'Strong temporal correlation detected',
    ...overrides,
});

describe('AISuggestionsPanel', () => {
    const defaultProps = {
        suggestions: [] as AISuggestion[],
        isLoading: false,
        error: null as string | null,
        onApply: vi.fn(),
        onApplyAll: vi.fn(),
        onRetry: vi.fn(),
        appliedIds: new Set<string>(),
    };

    it('renders loading state with spinner and message', () => {
        render(<AISuggestionsPanel {...defaultProps} isLoading={true} />);
        expect(screen.getByText('Analyzing Your Data...')).toBeTruthy();
        expect(screen.getByText(/The AI is/)).toBeTruthy();
    });

    it('renders loading state with provider name', () => {
        render(
            <AISuggestionsPanel
                {...defaultProps}
                isLoading={true}
                providerName="Gemini"
            />
        );
        expect(screen.getByText(/Gemini is/)).toBeTruthy();
    });

    it('renders error state with error message', () => {
        render(
            <AISuggestionsPanel
                {...defaultProps}
                error="Invalid API key"
            />
        );
        expect(screen.getByText('AI Suggestion Failed')).toBeTruthy();
        expect(screen.getByText('Invalid API key')).toBeTruthy();
    });

    it('renders error state with retry button when onRetry is provided', () => {
        const onRetry = vi.fn();
        render(
            <AISuggestionsPanel
                {...defaultProps}
                error="Network error"
                onRetry={onRetry}
            />
        );
        const retryBtn = screen.getByText('Try Again');
        expect(retryBtn).toBeTruthy();
        fireEvent.click(retryBtn);
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('does not render retry button when onRetry is not provided', () => {
        render(
            <AISuggestionsPanel
                {...defaultProps}
                error="Network error"
                onRetry={undefined}
            />
        );
        expect(screen.queryByText('Try Again')).toBeNull();
    });

    it('renders empty state when no suggestions', () => {
        render(<AISuggestionsPanel {...defaultProps} suggestions={[]} />);
        expect(screen.getByText('No Suggestions Returned')).toBeTruthy();
    });

    it('renders suggestions list with header and count', () => {
        const suggestions = [makeSuggestion(), makeSuggestion({ title: 'Pressure Chart', confidence: 0.75 })];
        render(
            <AISuggestionsPanel {...defaultProps} suggestions={suggestions} />
        );
        expect(screen.getByText('AI Suggestions (2)')).toBeTruthy();
        expect(screen.getByText('Temperature Trend')).toBeTruthy();
        expect(screen.getByText('Pressure Chart')).toBeTruthy();
    });

    it('displays confidence badge with correct percentage', () => {
        const suggestions = [makeSuggestion({ confidence: 0.92 })];
        render(
            <AISuggestionsPanel {...defaultProps} suggestions={suggestions} />
        );
        expect(screen.getByText('92% match')).toBeTruthy();
    });

    it('calls onApply when individual apply button is clicked', () => {
        const onApply = vi.fn();
        const suggestion = makeSuggestion();
        render(
            <AISuggestionsPanel
                {...defaultProps}
                suggestions={[suggestion]}
                onApply={onApply}
            />
        );
        // The apply button is the Plus icon button; it's a small ghost button
        // There's one Plus for the individual apply and one for "Apply All"
        const applyBtns = screen.getAllByRole('button');
        // The individual apply button is the ghost button inside the card
        // "Apply All" text is in the last button area
        const individualApplyBtn = applyBtns.find(
            btn => btn.className.includes('h-8') && btn.className.includes('w-8')
        );
        expect(individualApplyBtn).toBeTruthy();
        fireEvent.click(individualApplyBtn!);
        expect(onApply).toHaveBeenCalledWith(suggestion);
    });

    it('calls onApplyAll when Apply All button is clicked', () => {
        const onApplyAll = vi.fn();
        const suggestions = [makeSuggestion()];
        render(
            <AISuggestionsPanel
                {...defaultProps}
                suggestions={suggestions}
                onApplyAll={onApplyAll}
            />
        );
        const applyAllBtn = screen.getByText('Apply All');
        fireEvent.click(applyAllBtn);
        expect(onApplyAll).toHaveBeenCalledTimes(1);
    });

    it('shows "All Applied" and disables button when all suggestions are applied', () => {
        const suggestions = [makeSuggestion(), makeSuggestion({ title: 'Chart 2' })];
        render(
            <AISuggestionsPanel
                {...defaultProps}
                suggestions={suggestions}
                appliedIds={new Set(suggestions.map(s => s.id))}
            />
        );
        expect(screen.getByText('All Applied')).toBeTruthy();
        expect(screen.getByText(/2 applied/)).toBeTruthy();
    });

    it('shows "Added" badge for applied suggestions', () => {
        const suggestions = [makeSuggestion()];
        render(
            <AISuggestionsPanel
                {...defaultProps}
                suggestions={suggestions}
                appliedIds={new Set([suggestions[0].id])}
            />
        );
        expect(screen.getByText('Added')).toBeTruthy();
    });

    it('expands suggestion details on card click and shows reasoning', () => {
        const suggestion = makeSuggestion({
            x_axis: 'Time',
            y_axes: ['Temp', 'Pressure'],
            reasoning: 'Variables are strongly correlated',
        });
        render(
            <AISuggestionsPanel
                {...defaultProps}
                suggestions={[suggestion]}
            />
        );
        // Details should not be visible initially
        expect(screen.queryByText('Variables are strongly correlated')).toBeNull();

        // Click the card to expand
        const card = screen.getByText('Temperature Trend').closest('[class*="p-4"]');
        expect(card).toBeTruthy();
        fireEvent.click(card!);

        // Now details should be visible
        expect(screen.getByText('Variables are strongly correlated')).toBeTruthy();
        expect(screen.getByText('Time')).toBeTruthy();
        expect(screen.getByText('Temp')).toBeTruthy();
        expect(screen.getByText('Pressure')).toBeTruthy();
    });

    it('collapses expanded suggestion on second click', () => {
        const suggestion = makeSuggestion({
            reasoning: 'Important reasoning text',
        });
        render(
            <AISuggestionsPanel
                {...defaultProps}
                suggestions={[suggestion]}
            />
        );

        const card = screen.getByText('Temperature Trend').closest('[class*="p-4"]');
        // Expand
        fireEvent.click(card!);
        expect(screen.getByText('Important reasoning text')).toBeTruthy();

        // Collapse
        fireEvent.click(card!);
        expect(screen.queryByText('Important reasoning text')).toBeNull();
    });

    it('does not expand applied suggestion cards on click', () => {
        const suggestion = makeSuggestion({
            reasoning: 'Should not appear',
        });
        render(
            <AISuggestionsPanel
                {...defaultProps}
                suggestions={[suggestion]}
                appliedIds={new Set([suggestion.id])}
            />
        );

        const card = screen.getByText('Temperature Trend').closest('[class*="p-4"]');
        fireEvent.click(card!);
        expect(screen.queryByText('Should not appear')).toBeNull();
    });
});
