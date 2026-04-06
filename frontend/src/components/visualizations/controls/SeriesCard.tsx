/**
 * Series configuration card for individual data series settings.
 *
 * Collapsible card that starts collapsed, showing only the color swatch,
 * series name, type badge, and action buttons. Expands to reveal full
 * configuration controls for chart type, axis, markers, line style, and trendlines.
 *
 * @module components/visualizations/controls/SeriesCard
 */

import React, { useState } from 'react';
import { Trash2, ChevronDown, Pencil } from 'lucide-react';
import { VisualizationType, SeriesConfiguration } from '@/types';
import {
    Select,
    DebouncedInput,
    CustomColorPicker,
    Button,
    Checkbox
} from '@/components/common';

/**
 * Readable labels for chart type badges shown in the collapsed header.
 */
const TYPE_LABELS: Record<string, string> = {
    line: 'Line',
    scatter: 'Scatter',
    'line+scatter': 'Line+Scatter',
    bar: 'Bar',
    step: 'Step',
};

export const SeriesCard: React.FC<{
    title: string;
    legendLabel: string;
    seriesConfig: SeriesConfiguration;
    vizType: VisualizationType;
    index: number;
    color: string;
    onUpdateSeries: (updates: Partial<SeriesConfiguration>) => void;
    onUpdateLegend: (label: string) => void;
    onUpdateColor: (color: string) => void;
    onDelete?: () => void;
}> = ({
    title,
    legendLabel,
    seriesConfig,
    vizType,
    color,
    onUpdateSeries,
    onUpdateLegend,
    onUpdateColor,
    onDelete
}) => {
        const [isExpanded, setIsExpanded] = useState(false);

        // Feature flags based on visualization type
        const showTypeSelector = !['correlation', 'regression', 'hist', 'box', 'pca', 'area'].includes(vizType);
        const showAxisSelector = !['correlation', 'regression', 'pca', 'hist'].includes(vizType);
        const showTrendline = !['correlation', 'regression', 'hist', 'box', 'pca', 'area'].includes(vizType);
        const showHistogramOptions = vizType === 'hist';

        const hasMarkers = seriesConfig.type === 'scatter' || seriesConfig.type === 'line+scatter';
        const hasLines = seriesConfig.type === 'line' || seriesConfig.type === 'line+scatter' || seriesConfig.type === 'step' || !seriesConfig.type;

        return (
            <div className="bg-muted/40 rounded-lg border border-border overflow-hidden">
                {/* Collapsed Header — always visible */}
                <div
                    className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/60 transition-colors select-none"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {/* Color swatch */}
                    <div
                        className="relative w-6 h-6 rounded-full shrink-0 ring-1 ring-border group/color flex items-center justify-center overflow-hidden"
                        style={{ backgroundColor: color }}
                        onClick={(e) => e.stopPropagation()} // Don't toggle when clicking color
                    >
                        <CustomColorPicker
                            value={color}
                            onChange={onUpdateColor}
                            className="absolute inset-0 w-full h-full p-0 opacity-0 cursor-pointer z-10"
                        />
                        {/* Hover pencil icon overlay */}
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover/color:opacity-100 transition-opacity pointer-events-none">
                            <Pencil className="w-3 h-3 text-white" />
                        </div>
                    </div>

                    {/* Series name */}
                    <span className="flex-1 text-xs font-medium text-foreground truncate">
                        {legendLabel || title}
                    </span>

                    {/* Type badge */}
                    {showTypeSelector && (
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                            {TYPE_LABELS[seriesConfig.type || 'line'] || seriesConfig.type}
                        </span>
                    )}

                    {/* Delete button */}
                    {onDelete && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                            title="Remove Series"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                    )}

                    {/* Expand/Collapse chevron */}
                    <ChevronDown
                        className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                </div>

                {/* Expandable Content */}
                {isExpanded && (
                    <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/40 animate-in fade-in slide-in-from-top-1 duration-150">
                        {/* Legend Label */}
                        <DebouncedInput
                            label="Legend Label"
                            value={legendLabel}
                            onChange={onUpdateLegend}
                            placeholder={title}
                            className="h-8 text-xs font-medium"
                            debounceMs={300}
                        />

                        {/* Type & Axis */}
                        {(showTypeSelector || showAxisSelector) && (
                            <div className="grid grid-cols-2 gap-2">
                                {showTypeSelector ? (
                                    <Select
                                        label="Type"
                                        options={[
                                            { value: 'line', label: 'Line' },
                                            { value: 'scatter', label: 'Scatter' },
                                            { value: 'line+scatter', label: 'Line + Scatter' },
                                            { value: 'bar', label: 'Bar' },
                                            { value: 'step', label: 'Step' },
                                        ]}
                                        value={seriesConfig.type || 'line'}
                                        onChange={(e) => onUpdateSeries({ type: e.target.value })}
                                        className="h-8 text-xs"
                                    />
                                ) : (
                                    <div />
                                )}

                                {showAxisSelector && (
                                    <Select
                                        label="Axis"
                                        options={[
                                            { value: 'left', label: 'Left Axis' },
                                            { value: 'right', label: 'Right Axis' },
                                        ]}
                                        value={seriesConfig.y_axis_id || 'left'}
                                        onChange={(e) => onUpdateSeries({ y_axis_id: e.target.value })}
                                        className="h-8 text-xs"
                                    />
                                )}
                            </div>
                        )}

                        {/* Line Style Options */}
                        {showTypeSelector && hasLines && (
                            <div className="grid grid-cols-2 gap-2">
                                <Select
                                    label="Line Style"
                                    options={[
                                        { value: 'solid', label: '── Solid' },
                                        { value: 'dot', label: '·· Dotted' },
                                        { value: 'dash', label: '-- Dashed' },
                                        { value: 'longdash', label: '— Long Dash' },
                                        { value: 'dashdot', label: '-· Dash Dot' },
                                        { value: 'longdashdot', label: '—· Long Dash Dot' },
                                    ]}
                                    value={seriesConfig.line_dash || 'solid'}
                                    onChange={(e) => onUpdateSeries({ line_dash: e.target.value })}
                                    className="h-8 text-xs"
                                />
                                <DebouncedInput
                                    label="Line Width"
                                    value={seriesConfig.line_width != null ? String(seriesConfig.line_width) : ''}
                                    onChange={(value) => onUpdateSeries({ line_width: value ? Number(value) : undefined })}
                                    type="number"
                                    placeholder="2"
                                    className="h-8 text-xs"
                                    min={1}
                                    max={10}
                                    debounceMs={300}
                                />
                            </div>
                        )}

                        {/* Marker Options */}
                        {showTypeSelector && hasMarkers && (
                            <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <Select
                                        label="Marker Shape"
                                        options={[
                                            { value: 'circle', label: '● Circle' },
                                            { value: 'square', label: '■ Square' },
                                            { value: 'diamond', label: '◆ Diamond' },
                                            { value: 'triangle-up', label: '▲ Triangle Up' },
                                            { value: 'triangle-down', label: '▼ Triangle Down' },
                                            { value: 'cross', label: '✚ Cross' },
                                            { value: 'x', label: '✕ X' },
                                            { value: 'star', label: '★ Star' },
                                            { value: 'hexagon', label: '⬡ Hexagon' },
                                        ]}
                                        value={seriesConfig.marker_symbol || 'circle'}
                                        onChange={(e) => onUpdateSeries({ marker_symbol: e.target.value })}
                                        className="h-8 text-xs"
                                    />
                                    <DebouncedInput
                                        label="Marker Size"
                                        value={seriesConfig.marker_size != null ? String(seriesConfig.marker_size) : ''}
                                        onChange={(value) => onUpdateSeries({ marker_size: value ? Number(value) : undefined })}
                                        type="number"
                                        placeholder="Auto"
                                        className="h-8 text-xs"
                                        min={1}
                                        max={30}
                                        debounceMs={300}
                                    />
                                </div>
                                <label className="flex items-center gap-2.5 p-2 px-3 rounded-md border border-border/50 cursor-pointer group/fill hover:bg-muted/50 transition-colors">
                                    <Checkbox
                                        checked={seriesConfig.marker_filled !== false}
                                        onChange={(e) => onUpdateSeries({ marker_filled: e.target.checked })}
                                    />
                                    <span className="text-[11px] font-medium text-foreground select-none">Filled Markers</span>
                                </label>
                            </div>
                        )}

                        {/* Histogram Options */}
                        {showHistogramOptions && (
                            <div className="grid grid-cols-2 gap-2">
                                <Select
                                    label="Axis"
                                    options={[
                                        { value: 'left', label: 'Left' },
                                        { value: 'right', label: 'Right' },
                                    ]}
                                    value={seriesConfig.y_axis_id || 'left'}
                                    onChange={(e) => onUpdateSeries({ y_axis_id: e.target.value })}
                                    className="h-8 text-xs"
                                />
                                <DebouncedInput
                                    label="Bins"
                                    value={String(seriesConfig.bins || 30)}
                                    onChange={(value) => onUpdateSeries({ bins: Number(value) })}
                                    type="number"
                                    className="h-8 text-xs"
                                    min={1}
                                    max={500}
                                />
                                <label className="flex items-center gap-2.5 p-2 px-3 rounded-md border border-border/50 cursor-pointer group/kde hover:bg-muted/50 transition-colors col-span-2 mt-1">
                                    <Checkbox
                                        checked={seriesConfig.show_kde}
                                        onChange={(e) => onUpdateSeries({ show_kde: e.target.checked })}
                                    />
                                    <span className="text-[11px] font-medium text-foreground select-none">Show KDE Overlay</span>
                                </label>
                            </div>
                        )}

                        {/* Trendline Controls */}
                        {showTrendline && (
                            <div className="flex flex-col gap-2 pt-1 border-t border-border/40">
                                <label className="flex items-center gap-2.5 p-2 px-3 rounded-md border border-border/50 cursor-pointer group/toggle hover:bg-muted/50 transition-colors">
                                    <Checkbox
                                        checked={seriesConfig.show_regression}
                                        onChange={(e) => onUpdateSeries({ show_regression: e.target.checked })}
                                    />
                                    <span className="text-[11px] font-medium text-foreground select-none">Show Trendline</span>
                                </label>

                                {seriesConfig.show_regression && (
                                    <div className="pl-6 pt-1 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <div className="grid grid-cols-2 gap-2">
                                            <label className="flex items-center gap-2.5 p-2 px-3 rounded-md border border-border/50 cursor-pointer group/option hover:bg-muted/50 transition-colors">
                                                <Checkbox
                                                    checked={seriesConfig.show_confidence_interval}
                                                    onChange={(e) => onUpdateSeries({ show_confidence_interval: e.target.checked })}
                                                />
                                                <span className="text-[11px] font-medium text-foreground select-none">95% CI</span>
                                            </label>
                                            <label className="flex items-center gap-2.5 p-2 px-3 rounded-md border border-border/50 cursor-pointer group/option hover:bg-muted/50 transition-colors">
                                                <Checkbox
                                                    checked={seriesConfig.remove_outliers}
                                                    onChange={(e) => onUpdateSeries({ remove_outliers: e.target.checked })}
                                                />
                                                <span className="text-[11px] font-medium text-foreground select-none">Remove Outliers</span>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };
