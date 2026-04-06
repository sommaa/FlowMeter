import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColumnDescriptionEditor } from '../ColumnDescriptionEditor';
import { useStore } from '@/store';

vi.mock('@/store', () => ({
    useStore: vi.fn(),
}));

const mockDataset = {
    id: 'ds-1',
    name: 'test.csv',
    rows: 100,
    columns: 3,
    column_names: ['Timestamp', 'Temperature', 'BatchID'],
    numeric_columns: ['Temperature'],
    datetime_columns: ['Timestamp'],
    memory_usage_kb: 50,
    uploaded_at: '2025-01-01T00:00:00Z',
};

describe('ColumnDescriptionEditor', () => {
    const defaultProps = {
        columnDescriptions: {} as Record<string, string>,
        onDescriptionsChange: vi.fn(),
        guidanceText: '',
        onGuidanceChange: vi.fn(),
        showGuidance: true,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useStore).mockImplementation((selector: any) =>
            selector({ currentDataset: mockDataset })
        );
    });

    it('renders empty state when no dataset is loaded', () => {
        vi.mocked(useStore).mockImplementation((selector: any) =>
            selector({ currentDataset: null })
        );
        render(<ColumnDescriptionEditor {...defaultProps} />);
        expect(screen.getByText('No dataset loaded')).toBeTruthy();
    });

    it('renders guidance textarea when showGuidance is true', () => {
        render(<ColumnDescriptionEditor {...defaultProps} />);
        expect(screen.getByText('Analysis Goals')).toBeTruthy();
        expect(
            screen.getByPlaceholderText(/What would you like to analyze/)
        ).toBeTruthy();
    });

    it('does not render guidance textarea when showGuidance is false', () => {
        render(
            <ColumnDescriptionEditor {...defaultProps} showGuidance={false} />
        );
        expect(screen.queryByText('Analysis Goals')).toBeNull();
    });

    it('renders all column names from the dataset', () => {
        render(<ColumnDescriptionEditor {...defaultProps} />);
        expect(screen.getByText('Timestamp')).toBeTruthy();
        expect(screen.getByText('Temperature')).toBeTruthy();
        expect(screen.getByText('BatchID')).toBeTruthy();
    });

    it('renders data type badges for each column', () => {
        render(<ColumnDescriptionEditor {...defaultProps} />);
        expect(screen.getByText('datetime')).toBeTruthy();
        expect(screen.getByText('numeric')).toBeTruthy();
        expect(screen.getByText('text')).toBeTruthy();
    });

    it('shows progress bar with 0/3 when no descriptions filled', () => {
        render(<ColumnDescriptionEditor {...defaultProps} />);
        expect(screen.getByText('0/3')).toBeTruthy();
        expect(
            screen.getByText('All variables need descriptions')
        ).toBeTruthy();
    });

    it('shows correct progress when some descriptions are filled', () => {
        render(
            <ColumnDescriptionEditor
                {...defaultProps}
                columnDescriptions={{
                    Timestamp: 'Measurement time',
                    Temperature: 'Reactor temp in C',
                }}
            />
        );
        expect(screen.getByText('2/3')).toBeTruthy();
    });

    it('shows complete progress and no warning when all filled', () => {
        render(
            <ColumnDescriptionEditor
                {...defaultProps}
                columnDescriptions={{
                    Timestamp: 'Measurement time',
                    Temperature: 'Reactor temp',
                    BatchID: 'Batch identifier',
                }}
            />
        );
        expect(screen.getByText('3/3')).toBeTruthy();
        expect(
            screen.queryByText('All variables need descriptions')
        ).toBeNull();
    });

    it('calls onDescriptionsChange when a column description input changes', () => {
        const onDescriptionsChange = vi.fn();
        render(
            <ColumnDescriptionEditor
                {...defaultProps}
                onDescriptionsChange={onDescriptionsChange}
            />
        );
        const inputs = screen.getAllByRole('textbox');
        // The first input in the column list (after guidance textarea)
        // Guidance textarea is also a textbox, so column inputs start after it
        const columnInput = inputs.find(
            (input) =>
                input.getAttribute('placeholder') === 'e.g., Timestamp of the measurement'
        );
        expect(columnInput).toBeTruthy();
        fireEvent.change(columnInput!, {
            target: { value: 'Recording timestamp' },
        });
        expect(onDescriptionsChange).toHaveBeenCalledWith({
            Timestamp: 'Recording timestamp',
        });
    });

    it('calls onGuidanceChange when guidance textarea changes', () => {
        const onGuidanceChange = vi.fn();
        render(
            <ColumnDescriptionEditor
                {...defaultProps}
                onGuidanceChange={onGuidanceChange}
            />
        );
        const textarea = screen.getByPlaceholderText(
            /What would you like to analyze/
        );
        fireEvent.change(textarea, {
            target: { value: 'Analyze temperature trends' },
        });
        expect(onGuidanceChange).toHaveBeenCalledWith(
            'Analyze temperature trends'
        );
    });

    it('shows correct placeholder text based on data type', () => {
        render(<ColumnDescriptionEditor {...defaultProps} />);
        expect(
            screen.getByPlaceholderText('e.g., Timestamp of the measurement')
        ).toBeTruthy();
        expect(
            screen.getByPlaceholderText(
                'e.g., Temperature in reactor vessel (\u00B0C)'
            )
        ).toBeTruthy();
        expect(
            screen.getByPlaceholderText(
                'e.g., Batch identifier or product code'
            )
        ).toBeTruthy();
    });

    it('displays existing column description values', () => {
        render(
            <ColumnDescriptionEditor
                {...defaultProps}
                columnDescriptions={{
                    Timestamp: 'Process timestamp',
                    Temperature: 'Reactor temperature',
                    BatchID: '',
                }}
            />
        );
        const inputs = screen.getAllByRole('textbox');
        const timestampInput = inputs.find(
            (input) =>
                (input as HTMLInputElement).value === 'Process timestamp'
        ) as HTMLInputElement;
        expect(timestampInput).toBeTruthy();
    });

    it('shows guidance checkmark when guidance text is provided', () => {
        const { container } = render(
            <ColumnDescriptionEditor
                {...defaultProps}
                guidanceText="Some analysis goals"
            />
        );
        // CheckCircle2 is rendered when hasGuidance is true
        // It appears near the Analysis Goals label
        const checkIcons = container.querySelectorAll('svg');
        // At least one check icon should exist for the guidance checkmark
        expect(checkIcons.length).toBeGreaterThan(0);
    });
});
