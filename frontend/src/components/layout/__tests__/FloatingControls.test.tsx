import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FloatingControls } from '@/components/layout/FloatingControls';

// Mock zustand store
const mockSetVisualizationColumns = vi.fn();
const mockStoreState: Record<string, unknown> = {
  visualizations: [],
  visualizationColumns: 2,
  setVisualizationColumns: mockSetVisualizationColumns,
};

vi.mock('@/store', () => ({
  useStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockStoreState),
}));

describe('FloatingControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.visualizations = [];
    mockStoreState.visualizationColumns = 2;
  });

  it('renders nothing when there are no visualizations', () => {
    const { container } = render(<FloatingControls />);
    expect(container.querySelector('.fixed')).not.toBeInTheDocument();
  });

  it('renders the column selector when visualizations exist', () => {
    mockStoreState.visualizations = [{ id: '1' }];
    render(<FloatingControls />);
    expect(screen.getByText('Columns')).toBeInTheDocument();
  });

  it('renders three column layout buttons', () => {
    mockStoreState.visualizations = [{ id: '1' }];
    render(<FloatingControls />);
    expect(screen.getByTitle('1 Column')).toBeInTheDocument();
    expect(screen.getByTitle('2 Columns')).toBeInTheDocument();
    expect(screen.getByTitle('3 Columns')).toBeInTheDocument();
  });

  it('highlights the active column button (2 columns by default)', () => {
    mockStoreState.visualizations = [{ id: '1' }];
    mockStoreState.visualizationColumns = 2;
    render(<FloatingControls />);
    const button2 = screen.getByTitle('2 Columns');
    expect(button2.className).toContain('bg-foreground');
  });

  it('does not highlight inactive column buttons', () => {
    mockStoreState.visualizations = [{ id: '1' }];
    mockStoreState.visualizationColumns = 2;
    render(<FloatingControls />);
    const button1 = screen.getByTitle('1 Column');
    const button3 = screen.getByTitle('3 Columns');
    expect(button1.className).not.toContain('bg-foreground');
    expect(button3.className).not.toContain('bg-foreground');
  });

  it('calls setVisualizationColumns with 1 when 1 Column button is clicked', () => {
    mockStoreState.visualizations = [{ id: '1' }];
    render(<FloatingControls />);
    fireEvent.click(screen.getByTitle('1 Column'));
    expect(mockSetVisualizationColumns).toHaveBeenCalledWith(1);
  });

  it('calls setVisualizationColumns with 2 when 2 Columns button is clicked', () => {
    mockStoreState.visualizations = [{ id: '1' }];
    render(<FloatingControls />);
    fireEvent.click(screen.getByTitle('2 Columns'));
    expect(mockSetVisualizationColumns).toHaveBeenCalledWith(2);
  });

  it('calls setVisualizationColumns with 3 when 3 Columns button is clicked', () => {
    mockStoreState.visualizations = [{ id: '1' }];
    render(<FloatingControls />);
    fireEvent.click(screen.getByTitle('3 Columns'));
    expect(mockSetVisualizationColumns).toHaveBeenCalledWith(3);
  });

  it('updates active state when visualizationColumns changes', () => {
    mockStoreState.visualizations = [{ id: '1' }];
    mockStoreState.visualizationColumns = 1;
    render(<FloatingControls />);
    const button1 = screen.getByTitle('1 Column');
    expect(button1.className).toContain('bg-foreground');
    const button2 = screen.getByTitle('2 Columns');
    expect(button2.className).not.toContain('bg-foreground');
  });

  it('hides when visualizations array becomes empty', () => {
    mockStoreState.visualizations = [{ id: '1' }];
    const { container, rerender } = render(<FloatingControls />);
    expect(screen.getByText('Columns')).toBeInTheDocument();

    mockStoreState.visualizations = [];
    rerender(<FloatingControls />);
    expect(container.querySelector('.fixed')).not.toBeInTheDocument();
  });
});
