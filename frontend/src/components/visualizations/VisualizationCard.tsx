/**
 * Visualization card component that orchestrates configuration, rendering, and interactions.
 *
 * This is the primary container component for a visualization. It combines the configuration
 * panel, interactive plot, and additional features like regression prediction and root cause
 * analysis. The card supports drag-and-drop reordering, responsive layouts, and intelligent
 * data refresh management.
 *
 * Key Responsibilities:
 * - Renders the visualization header with title, drag handle, and action buttons
 * - Manages configuration panel visibility and updates
 * - Coordinates plot data fetching and caching
 * - Handles debounced refresh on configuration changes
 * - Displays error states and loading indicators
 * - Provides formula editor modal for custom expressions
 * - Shows regression prediction panel when applicable
 * - Renders root cause analysis visualization when configured
 *
 * Performance Features:
 * - Debounced plot refresh (500ms) to prevent excessive API calls
 * - Memoized column lists and selectors to prevent infinite re-renders
 * - Intelligent refresh skipping when switching to formula type without input
 * - Immediate plot data clearing on visualization type change to prevent "ghost graph" effect
 *
 * Layout Modes:
 * - Single column: Configuration panel beside plot (desktop) or above (mobile)
 * - Grid mode: Configuration panel stacks above plot for compact layouts
 *
 * @module components/visualizations/VisualizationCard
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Settings2,
  RefreshCw,
  Trash2,
  GripVertical,
} from 'lucide-react';
import {
  useStore,
  selectPlotDataById,
  selectIsPlotLoading,
  selectNumericColumns,
  selectAllColumns,
  selectPlotErrorById,
  selectGlobalVariables,
} from '@/store';
import { VisualizationConfig, GlobalVariable } from '@/types';
import { Button, Card, DebouncedInput, ErrorBoundary, Loading } from '@/components/common';
import { InteractivePlot } from './InteractivePlot';
import { ConfigurationPanel } from './ConfigurationPanel';
import { FormulaEditorModal } from './FormulaEditorModal';
import { RegressionPrediction } from './RegressionPrediction';
import { RootCauseAnalysis } from './RootCauseAnalysis';

/**
 * Props for the VisualizationCard component.
 *
 * @interface VisualizationCardProps
 * @property {VisualizationConfig} config - Complete visualization configuration
 * @property {number} [columns] - Number of grid columns (affects layout stacking, default: 1)
 */
interface VisualizationCardProps {
  config: VisualizationConfig;
  columns?: number;
}

/**
 * Debounce delay for plot refresh in milliseconds.
 * Prevents excessive API calls when user rapidly changes configuration.
 * @constant {number}
 */
const PLOT_REFRESH_DEBOUNCE = 500;

/**
 * Visualization card component with drag-and-drop support and integrated configuration.
 *
 * Provides a complete visualization experience with:
 * - Editable title with debounced updates
 * - Drag handle for reordering visualizations in the dashboard
 * - Configuration toggle button to show/hide settings panel
 * - Manual refresh button to reload plot data
 * - Delete button to remove visualization
 * - Configuration panel with all chart settings
 * - Interactive Plotly chart with responsive resizing
 * - Error boundary to catch and recover from render errors
 * - Optional notes display below the chart
 * - Regression prediction panel for regression visualizations
 * - Root cause analysis renderer for causal analysis
 * - Formula editor modal for custom expressions
 *
 * State Management:
 * - Uses Zustand store for global state (plot data, loading, errors)
 * - Local state for UI toggles (configuration panel, formula modal)
 * - Memoized selectors to prevent unnecessary re-renders
 * - Combines base columns with global variables and datetime columns
 *
 * Refresh Logic:
 * - Automatically refreshes when plot-affecting configuration changes
 * - Debounces rapid changes to reduce backend load
 * - Clears old plot data on visualization type change to prevent stale renders
 * - Skips refresh when switching to formula type without formula defined
 * - Plot-affecting keys: viz_type, axis, formula, regression, pca, style, limits, date_range, series_configs, root_cause
 *
 * Error Handling:
 * - Displays error messages for failed plot data requests
 * - ErrorBoundary wraps plot component to catch render errors
 * - Provides reset button to retry failed renders
 *
 * @param {VisualizationCardProps} props - Component props
 * @returns {JSX.Element} Draggable visualization card with integrated controls
 *
 * @example
 * ```tsx
 * <VisualizationCard
 *   config={{
 *     id: 'plot-1',
 *     title: 'Temperature Over Time',
 *     viz_type: 'line',
 *     axis: { x_axis: 'Index', y_axis: ['temperature'] }
 *   }}
 *   columns={2}
 * />
 * ```
 */
export const VisualizationCard: React.FC<VisualizationCardProps> = ({
  config,
  columns = 1,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: config.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.4 : 1,
  };

  const isGrid = columns > 1;
  const [configOpen, setConfigOpen] = useState(false);
  const [formulaModalOpen, setFormulaModalOpen] = useState(false);

  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Use individual selectors instead of useStore() without selector to prevent infinite re-renders
  const updateVisualization = useStore((state) => state.updateVisualization);
  const removeVisualization = useStore((state) => state.removeVisualization);
  const refreshPlotData = useStore((state) => state.refreshPlotData);
  const currentDataset = useStore((state) => state.currentDataset);

  // Memoize selectors to prevent infinite re-renders (React 18+ requires stable selector references)
  const plotDataSelector = useMemo(() => selectPlotDataById(config.id), [config.id]);
  const isLoadingSelector = useMemo(() => selectIsPlotLoading(config.id), [config.id]);
  const plotErrorSelector = useMemo(() => selectPlotErrorById(config.id), [config.id]);

  const plotData = useStore(plotDataSelector);
  const isLoading = useStore(isLoadingSelector);
  const plotError = useStore(plotErrorSelector);
  const baseNumericColumns = useStore(selectNumericColumns);
  const baseAllColumns = useStore(selectAllColumns);
  const globalVariables = useStore(selectGlobalVariables);

  // Get datetime columns from currentDataset
  const datetimeColumns = currentDataset?.datetime_columns ?? [];

  // Combine base columns with global variable names and datetime columns using useMemo to avoid infinite re-renders
  const numericColumns = useMemo(() => {
    const globalVarNames = globalVariables.map((gv: GlobalVariable) => gv.name);
    // Include datetime columns so they can be used as Y-axis (they can be converted to timestamps)
    const combined = new Set([...baseNumericColumns, ...datetimeColumns, ...globalVarNames]);
    return Array.from(combined);
  }, [baseNumericColumns, datetimeColumns, globalVariables]);

  const allColumns = useMemo(() => {
    const globalVarNames = globalVariables.map((gv: GlobalVariable) => gv.name);
    // Datetime columns should already be in baseAllColumns from column_names, but ensure they're included
    const combined = new Set([...baseAllColumns, ...datetimeColumns, ...globalVarNames]);
    return Array.from(combined);
  }, [baseAllColumns, datetimeColumns, globalVariables]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);



  // Debounced refresh function
  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      if (currentDataset) {
        refreshPlotData(config.id);
      }
    }, PLOT_REFRESH_DEBOUNCE);
  }, [config.id, refreshPlotData, currentDataset]);

  // Handle config updates with debounced refresh
  const handleUpdate = useCallback((updates: Partial<VisualizationConfig>) => {
    // If the visualization type changes, immediately clear the old plot data
    // This prevents the "ghost graph" effect where the old chart persists 
    // because the new configuration hasn't generated new data yet.

    if (
      (updates.viz_type && updates.viz_type !== config.viz_type) ||
      (updates.axis?.multi_axis_plot_type && updates.axis.multi_axis_plot_type !== config.axis.multi_axis_plot_type)
    ) {
      useStore.getState().clearPlotData(config.id);
    }

    updateVisualization(config.id, updates);

    // List of keys that trigger a data refresh when changed.
    // MAINTENANCE: Add new config keys here if they change the plot data logic.

    const plotAffectingKeys = [
      'viz_type', 'axis', 'formula', 'regression', 'pca', 'style', 'limits', 'date_range', 'series_configs', 'root_cause'
    ];

    const needsRefresh = Object.keys(updates).some(key => plotAffectingKeys.includes(key));

    // Skip refresh if switching TO formula type without a formula yet.
    // This prevents a premature fetch that would fail because no formula is defined.
    // The refresh will happen when the user actually saves a formula.
    const isSwitchingToFormula = updates.viz_type === 'formula' && !config.formula?.input && !updates.formula?.input;

    if (needsRefresh && !isSwitchingToFormula) {
      debouncedRefresh();
    }
  }, [config.id, config.viz_type, updateVisualization, debouncedRefresh]);

  // Profiler disabled for production performance
  return (
    <div ref={setNodeRef} style={style} className="h-full">
      <Card className="overflow-hidden h-full flex flex-col group hover:border-border-prominent transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 flex-1 min-w-0 mr-4">
            {/* Drag Handle */}
            <div
              className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="w-4 h-4" />
            </div>
            <DebouncedInput
              value={config.title}
              onChange={(value) => handleUpdate({ title: value })}
              className="font-medium text-sm bg-transparent border border-transparent rounded-full px-3 py-1 hover:bg-accent hover:border-border focus:bg-accent focus:border-border transition-colors focus:ring-0 w-full"
              placeholder="Visualization Title"
              debounceMs={300}
            />
          </div>
          {/* Actions - visible on hover */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfigOpen(!configOpen)}
              title="Configuration"
              className={cn("h-7 w-7 p-0 rounded-md", configOpen && "bg-accent text-foreground")}
            >
              <Settings2 className="w-3.5 h-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => refreshPlotData(config.id)}
              disabled={isLoading}
              title="Refresh Data"
              className="h-7 w-7 p-0 rounded-md"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeVisualization(config.id)}
              title="Remove Visualization"
              className="h-7 w-7 p-0 rounded-md text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className={cn("flex flex-col", { "lg:flex-row lg:items-stretch": !isGrid })}>
          {/* Configuration Panel */}
          {configOpen && (
            <ConfigurationPanel
              config={config}
              numericColumns={numericColumns}
              allColumns={allColumns}
              datetimeColumns={datetimeColumns}
              onUpdate={handleUpdate}
              onOpenFormula={() => setFormulaModalOpen(true)}
              regressionEquation={plotData?.regression_model?.equation}
              stacked={isGrid}
            />
          )}

          {/* Plot Area */}
          <div className="flex-1 p-4 min-h-[400px]">
            {currentDataset ? (
              plotError ? (
                <div className="flex flex-col items-center justify-center h-full text-destructive p-4 text-center">
                  <p className="font-semibold mb-2">Error loading plot</p>
                  <p className="text-sm opacity-80">{plotError}</p>
                </div>
              ) : plotData ? (
                <ErrorBoundary onReset={() => refreshPlotData(config.id)}>
                  {config.viz_type === 'root_cause' && plotData?.root_cause_analysis ? (
                    <RootCauseAnalysis data={plotData} config={config} height={500} />
                  ) : (
                    <InteractivePlot data={plotData} config={config} loading={isLoading} height={500} />
                  )}
                </ErrorBoundary>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {(!config.axis?.y_axis || config.axis.y_axis.length === 0) && config.viz_type !== 'formula'
                    ? "Add variables to visualize"
                    : <Loading size="md" />}
                </div>
              )
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Upload data to display visualizations
              </div>
            )}
          </div>
        </div>

        {/* Notes Display */}
        {config.notes && (
          <div className="mx-4 mb-4 p-3 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">📝 Notes:</span> {config.notes}
            </p>
          </div>
        )}



        {/* Prediction Panel */}
        {
          configOpen && plotData?.regression_model && config.viz_type === 'regression' && (
            <div className="px-4 pb-4">
              <RegressionPrediction
                model={plotData.regression_model}
                datasetId={currentDataset?.id || ''}
                config={config}
                globalVariables={globalVariables}
                onConfigUpdate={handleUpdate}
              />
            </div>
          )
        }

        {/* Formula Editor Modal */}
        <FormulaEditorModal
          isOpen={formulaModalOpen}
          onClose={() => setFormulaModalOpen(false)}
          initialFormula={
            // If we're in regression mode with custom model type, show regression custom formula
            config.viz_type === 'regression' && config.regression.model_type === 'custom'
              ? config.regression.custom_formula || ''
              : config.formula.input || ''
          }
          onApply={(formula) => {
            // Save to appropriate location based on context
            if (config.viz_type === 'regression' && config.regression.model_type === 'custom') {
              handleUpdate({ regression: { ...config.regression, custom_formula: formula } });
            } else {
              handleUpdate({ formula: { ...config.formula, input: formula } });
            }
            setFormulaModalOpen(false);
            // Store is updated synchronously, refresh immediately
            refreshPlotData(config.id);
          }}
          numericColumns={numericColumns}
          mode={config.viz_type === 'regression' && config.regression.model_type === 'custom' ? 'regression' : 'formula'}
        />
      </Card >
    </div >

  );
};
