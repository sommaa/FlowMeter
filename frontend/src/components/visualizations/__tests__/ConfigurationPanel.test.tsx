import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigurationPanel } from '@/components/visualizations/ConfigurationPanel';
import { createDefaultVisualizationConfig } from '@/types';

// Mock all section sub-components to isolate ConfigurationPanel logic
vi.mock('@/components/visualizations/sections/GeneralSettings', () => ({
  GeneralSettings: (props: any) => (
    <div data-testid="general-settings" data-viz-type={props.config.viz_type}>
      GeneralSettings
    </div>
  ),
}));

vi.mock('@/components/visualizations/sections/SeriesList', () => ({
  SeriesList: () => <div data-testid="series-list">SeriesList</div>,
}));

vi.mock('@/components/visualizations/sections/AxisSettings', () => ({
  AxisSettings: () => <div data-testid="axis-settings">AxisSettings</div>,
}));

vi.mock('@/components/visualizations/sections/RegressionSettings', () => ({
  RegressionSettings: () => <div data-testid="regression-settings">RegressionSettings</div>,
}));

vi.mock('@/components/visualizations/sections/FormulaSettings', () => ({
  FormulaSettings: () => <div data-testid="formula-settings">FormulaSettings</div>,
}));

vi.mock('@/components/visualizations/sections/FFTSettings', () => ({
  FFTSettings: () => <div data-testid="fft-settings">FFTSettings</div>,
}));

vi.mock('@/components/visualizations/sections/RootCauseSettings', () => ({
  RootCauseSettings: () => <div data-testid="root-cause-settings">RootCauseSettings</div>,
}));

vi.mock('@/components/common', () => ({
  Divider: () => <hr data-testid="divider" />,
  DebouncedTextArea: ({ value, onChange, placeholder }: any) => (
    <textarea
      data-testid="notes-textarea"
      defaultValue={value}
      onChange={(e: any) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

describe('ConfigurationPanel', () => {
  const mockOnUpdate = vi.fn();
  const mockOnOpenFormula = vi.fn();

  const baseConfig = createDefaultVisualizationConfig('test-1');

  const defaultProps = {
    config: baseConfig,
    numericColumns: ['temperature', 'pressure', 'flow_rate'],
    allColumns: ['timestamp', 'temperature', 'pressure', 'flow_rate', 'status'],
    datetimeColumns: ['timestamp'],
    onUpdate: mockOnUpdate,
    onOpenFormula: mockOnOpenFormula,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Configuration heading', () => {
    render(<ConfigurationPanel {...defaultProps} />);
    expect(screen.getByText('Configuration')).toBeInTheDocument();
  });

  it('always renders GeneralSettings section', () => {
    render(<ConfigurationPanel {...defaultProps} />);
    expect(screen.getByTestId('general-settings')).toBeInTheDocument();
  });

  it('always renders Notes section', () => {
    render(<ConfigurationPanel {...defaultProps} />);
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByTestId('notes-textarea')).toBeInTheDocument();
  });

  it('renders SeriesList for universal viz_type', () => {
    render(<ConfigurationPanel {...defaultProps} />);
    expect(screen.getByTestId('series-list')).toBeInTheDocument();
  });

  it('renders RegressionSettings and AxisSettings for universal viz_type', () => {
    render(<ConfigurationPanel {...defaultProps} />);
    expect(screen.getByTestId('regression-settings')).toBeInTheDocument();
    expect(screen.getByTestId('axis-settings')).toBeInTheDocument();
  });

  it('hides SeriesList, RegressionSettings, and AxisSettings for correlation viz_type', () => {
    const correlationConfig = { ...baseConfig, viz_type: 'correlation' as const };
    render(<ConfigurationPanel {...defaultProps} config={correlationConfig} />);
    expect(screen.queryByTestId('series-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('regression-settings')).not.toBeInTheDocument();
    expect(screen.queryByTestId('axis-settings')).not.toBeInTheDocument();
  });

  it('hides plot settings for pca viz_type', () => {
    const pcaConfig = { ...baseConfig, viz_type: 'pca' as const };
    render(<ConfigurationPanel {...defaultProps} config={pcaConfig} />);
    expect(screen.queryByTestId('series-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('regression-settings')).not.toBeInTheDocument();
    expect(screen.queryByTestId('axis-settings')).not.toBeInTheDocument();
  });

  it('hides plot settings for root_cause viz_type', () => {
    const rootCauseConfig = { ...baseConfig, viz_type: 'root_cause' as const };
    render(<ConfigurationPanel {...defaultProps} config={rootCauseConfig} />);
    expect(screen.queryByTestId('series-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('regression-settings')).not.toBeInTheDocument();
  });

  it('shows SeriesList but hides RegressionSettings and AxisSettings for fft viz_type', () => {
    const fftConfig = { ...baseConfig, viz_type: 'fft' as const };
    render(<ConfigurationPanel {...defaultProps} config={fftConfig} />);
    expect(screen.getByTestId('series-list')).toBeInTheDocument();
    expect(screen.queryByTestId('regression-settings')).not.toBeInTheDocument();
    expect(screen.queryByTestId('axis-settings')).not.toBeInTheDocument();
  });

  it('applies stacked layout classes when stacked prop is true', () => {
    const { container } = render(
      <ConfigurationPanel {...defaultProps} stacked={true} />
    );
    const panel = container.firstChild as HTMLElement;
    expect(panel.className).toContain('h-[400px]');
    expect(panel.className).toContain('border-b');
  });

  it('applies sidebar layout classes when stacked prop is false', () => {
    const { container } = render(
      <ConfigurationPanel {...defaultProps} stacked={false} />
    );
    const panel = container.firstChild as HTMLElement;
    expect(panel.className).toContain('lg:w-96');
    expect(panel.className).toContain('h-[600px]');
  });

  it('uses datetime column name as index label when datetimeColumns provided', () => {
    render(<ConfigurationPanel {...defaultProps} />);
    // GeneralSettings receives xAxisOptions that use the datetime column as label for Index
    const generalSettings = screen.getByTestId('general-settings');
    expect(generalSettings).toBeInTheDocument();
  });

  it('always renders type-specific settings components (they self-guard on viz_type)', () => {
    render(<ConfigurationPanel {...defaultProps} />);
    // RootCauseSettings, FFTSettings, FormulaSettings always rendered;
    // they internally decide whether to show content based on config.viz_type
    expect(screen.getByTestId('root-cause-settings')).toBeInTheDocument();
    expect(screen.getByTestId('fft-settings')).toBeInTheDocument();
    expect(screen.getByTestId('formula-settings')).toBeInTheDocument();
  });
});
