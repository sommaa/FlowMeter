import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardGrid } from '@/components/features/Dashboard/DashboardGrid';
import { useStore } from '@/store';
import type { VisualizationConfig, DatasetInfo } from '@/types';

// Mock the store
vi.mock('@/store', () => ({
  useStore: vi.fn(),
}));

// Mock @dnd-kit to avoid complex DnD setup in tests
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div data-testid="dnd-context">{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div data-testid="sortable-context">{children}</div>,
  rectSortingStrategy: vi.fn(),
}));

// Mock VisualizationCard since it's a complex child component
vi.mock('@/components/visualizations', () => ({
  VisualizationCard: ({ config, columns }: { config: VisualizationConfig; columns: number }) => (
    <div data-testid={`viz-card-${config.id}`} data-columns={columns}>
      {config.title}
    </div>
  ),
}));

// Mock the Button component
vi.mock('@/components/common', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

const mockDataset: DatasetInfo = {
  id: 'ds-1',
  name: 'test-data.xlsx',
  rows: 100,
  columns: 5,
  column_names: ['A', 'B', 'C', 'D', 'E'],
  numeric_columns: ['A', 'B', 'C'],
  datetime_columns: ['D'],
  memory_usage_kb: 512,
  uploaded_at: '2025-01-01T00:00:00Z',
};

const mockVisualization = (id: string, title: string): VisualizationConfig => ({
  id,
  title,
  viz_type: 'universal',
  axis: { x_axis: 'A', y_axis: ['B'], enable_y_axis_range: false, multi_axis_plot_type: 'Line' },
  legend: {},
  style: { color_index: 0, alpha: 0.8, enable_stacking: false },
  limits: { thresholds: [] },
  regression: { added: false, degree: 1, remove_outliers: false, show_confidence_interval: false, model_type: 'linear' },
  pca: { components: 2, show_loadings: true },
  formula: { plot_type: 'Line', add_regression: false, regression_degree: 1, regression_remove_outliers: false },
  fft: { overlap: 0.5, window_type: 'hann', detrend: 'linear', frequency_unit: 'hz', normalize: false, x_axis_scale: 'linear', y_axis_scale: 'log' },
  root_cause: { max_lag: 40, top_n: 15, methods: [], significance_threshold: 0.05, min_correlation: 0.1, include_variables: [], result_plot: 'ranking' },
});

describe('DashboardGrid', () => {
  const mockAddVisualization = vi.fn();
  const mockReorderVisualizations = vi.fn();

  const defaultStoreState = {
    visualizations: [],
    visualizationColumns: 2,
    reorderVisualizations: mockReorderVisualizations,
    addVisualization: mockAddVisualization,
    currentDataset: mockDataset,
    hasOnboarded: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useStore).mockImplementation((selector: any) => selector(defaultStoreState));
  });

  it('returns null when no visualizations, not onboarded, and no dataset', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        visualizations: [],
        hasOnboarded: false,
        currentDataset: null,
      })
    );

    const { container } = render(<DashboardGrid />);
    expect(container.innerHTML).toBe('');
  });

  it('shows "No Data Loaded" empty state when no dataset and no visualizations', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        visualizations: [],
        currentDataset: null,
        hasOnboarded: true,
      })
    );

    render(<DashboardGrid />);
    expect(screen.getByText('No Data Loaded')).toBeInTheDocument();
    expect(screen.getByText('Upload a dataset via the sidebar to get started.')).toBeInTheDocument();
  });

  it('does not show "Create Visualization" button when no dataset loaded', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        visualizations: [],
        currentDataset: null,
        hasOnboarded: true,
      })
    );

    render(<DashboardGrid />);
    expect(screen.queryByText('Create Visualization')).not.toBeInTheDocument();
  });

  it('shows "Dashboard is Empty" when dataset loaded but no visualizations', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        visualizations: [],
        currentDataset: mockDataset,
      })
    );

    render(<DashboardGrid />);
    expect(screen.getByText('Dashboard is Empty')).toBeInTheDocument();
    expect(screen.getByText('Add your first visualization to start monitoring your process data.')).toBeInTheDocument();
    expect(screen.getByText('Create Visualization')).toBeInTheDocument();
  });

  it('calls addVisualization when "Create Visualization" is clicked in empty state', () => {
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        visualizations: [],
        currentDataset: mockDataset,
      })
    );

    render(<DashboardGrid />);
    fireEvent.click(screen.getByText('Create Visualization'));
    expect(mockAddVisualization).toHaveBeenCalledTimes(1);
  });

  it('renders visualization cards when visualizations exist', () => {
    const vizs = [mockVisualization('viz-1', 'Chart A'), mockVisualization('viz-2', 'Chart B')];
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        visualizations: vizs,
      })
    );

    render(<DashboardGrid />);
    expect(screen.getByTestId('viz-card-viz-1')).toBeInTheDocument();
    expect(screen.getByTestId('viz-card-viz-2')).toBeInTheDocument();
    expect(screen.getByText('Chart A')).toBeInTheDocument();
    expect(screen.getByText('Chart B')).toBeInTheDocument();
  });

  it('passes correct column count to VisualizationCard', () => {
    const vizs = [mockVisualization('viz-1', 'Chart A')];
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        visualizations: vizs,
        visualizationColumns: 3,
      })
    );

    render(<DashboardGrid />);
    expect(screen.getByTestId('viz-card-viz-1')).toHaveAttribute('data-columns', '3');
  });

  it('shows "Add Visualization" button when dataset is loaded and visualizations exist', () => {
    const vizs = [mockVisualization('viz-1', 'Chart A')];
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        visualizations: vizs,
        currentDataset: mockDataset,
      })
    );

    render(<DashboardGrid />);
    expect(screen.getByText('Add Visualization')).toBeInTheDocument();
  });

  it('calls addVisualization when "Add Visualization" button is clicked', () => {
    const vizs = [mockVisualization('viz-1', 'Chart A')];
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        visualizations: vizs,
        currentDataset: mockDataset,
      })
    );

    render(<DashboardGrid />);
    fireEvent.click(screen.getByText('Add Visualization'));
    expect(mockAddVisualization).toHaveBeenCalledTimes(1);
  });

  it('does not show "Add Visualization" button when no dataset loaded', () => {
    const vizs = [mockVisualization('viz-1', 'Chart A')];
    vi.mocked(useStore).mockImplementation((selector: any) =>
      selector({
        ...defaultStoreState,
        visualizations: vizs,
        currentDataset: null,
      })
    );

    render(<DashboardGrid />);
    expect(screen.queryByText('Add Visualization')).not.toBeInTheDocument();
  });
});
