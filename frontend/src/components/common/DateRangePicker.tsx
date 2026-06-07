import React, { useEffect, useState, useRef } from 'react';
import { Calendar, ChevronDown, Check, ArrowRight, Clock } from 'lucide-react';
import { useStore } from '@/store';
import { clsx } from 'clsx';
import { Button } from './index';

/**
 * Date range filter component for filtering dataset visualizations by time period.
 *
 * Provides a dropdown interface for selecting date ranges with:
 * - Quick preset options (Last 7/30/90 days, All Time)
 * - Custom date range picker with start/end inputs
 * - Validation against the dataset's available date range
 * - Apply/Cancel/Clear actions with temporary state management
 *
 * The component syncs with the global date range state in the Zustand store
 * and applies filters across all visualizations when confirmed.
 *
 * @example
 * ```tsx
 * <DateRangePicker />
 * ```
 *
 * Features:
 * - Displays "No Date Filter" when no dataset is loaded
 * - Shows active state when a range is applied
 * - Prevents selection outside dataset's available range
 * - Closes on click outside with state reset
 * - Auto-applies preset selections for quick filtering
 */
export const DateRangePicker: React.FC = () => {
    // Use individual selectors instead of useStore() to ensure proper reactivity
    const currentDataset = useStore((state) => state.currentDataset);
    const globalDateRange = useStore((state) => state.globalDateRange);
    const setGlobalDateRange = useStore((state) => state.setGlobalDateRange);
    const isDarkMode = useStore((state) => state.isDarkMode);
    const [isOpen, setIsOpen] = useState(false);

    // Internal state for the dropdown (not applied yet)
    const [tempRange, setTempRange] = useState<{ start: string; end: string } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Sync with global state when opening or when global changes externally
    useEffect(() => {
        // Only sync if they correspond to different values to avoid loops
        if (
            globalDateRange?.start !== tempRange?.start ||
            globalDateRange?.end !== tempRange?.end
        ) {
            setTempRange(globalDateRange);
        }
        // Sync only on external globalDateRange changes; depending on tempRange would
        // reset the user's in-progress (unapplied) selection on every edit.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [globalDateRange]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                // Reset temp to global on close without apply
                setTempRange(globalDateRange);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, globalDateRange]);

    const availableRange = currentDataset?.date_range;

    if (!availableRange) {
        return (
            <div className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-muted-foreground text-xs cursor-not-allowed opacity-50">
                <Calendar className="w-3.5 h-3.5" />
                <span>No Date Filter</span>
            </div>
        );
    }

    // Helper: ISO to datetime-local format (YYYY-MM-DDTHH:MM)
    const toDateTimeInput = (isoStr: string) => {
        if (!isoStr) return '';
        // If already in datetime-local format, return as-is
        if (isoStr.includes('T') && !isoStr.endsWith('Z')) return isoStr.slice(0, 16);
        // If date-only (YYYY-MM-DD), append T00:00
        if (!isoStr.includes('T')) return `${isoStr}T00:00`;
        // ISO format — convert to local datetime-local string
        const d = new Date(isoStr);
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    // Helper: Display Format (MMM DD, YYYY HH:MM)
    const formatDisplayDate = (isoStr: string) => {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timePart = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        // Only show time if it's not midnight
        if (timePart === '00:00') return datePart;
        return `${datePart} ${timePart}`;
    };

    const minDate = toDateTimeInput(availableRange.start);
    const maxDate = toDateTimeInput(availableRange.end);

    const handleApply = () => {
        if (tempRange) {
            setGlobalDateRange(tempRange);
        }
        setIsOpen(false);
    };

    const handleClear = () => {
        setTempRange(null);
        setGlobalDateRange(null);
        setIsOpen(false);
    };

    const handlePresetHours = (hours: number) => {
        const endData = new Date(availableRange.end);
        const startData = new Date(availableRange.end);
        startData.setHours(endData.getHours() - hours);

        const absoluteStart = new Date(availableRange.start);
        const finalStart = startData < absoluteStart ? absoluteStart : startData;

        const range = {
            start: toDateTimeInput(finalStart.toISOString()),
            end: toDateTimeInput(endData.toISOString())
        };

        setTempRange(range);
        setGlobalDateRange(range);
        setIsOpen(false);
    };

    const handlePreset = (days: number) => {
        // Calculate based on Dataset END date
        const endData = new Date(availableRange.end);
        const startData = new Date(availableRange.end);
        startData.setDate(endData.getDate() - days);

        // Clamp to start
        const absoluteStart = new Date(availableRange.start);
        const finalStart = startData < absoluteStart ? absoluteStart : startData;

        const range = {
            start: toDateTimeInput(finalStart.toISOString()),
            end: toDateTimeInput(endData.toISOString())
        };

        setTempRange(range);
        setGlobalDateRange(range); // Auto-apply
        setIsOpen(false);
    };

    const handleAllTime = () => {
        const range = {
            start: minDate,
            end: maxDate
        };
        setTempRange(range);
        setGlobalDateRange(range); // Auto-apply
        setIsOpen(false);
    };

    // Range Selection Input Handlers
    const updateTempStart = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (!val) return;
        setTempRange(prev => ({
            start: val,
            end: prev?.end || maxDate // Default end if missing
        }));
    };

    const updateTempEnd = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (!val) return;
        setTempRange(prev => ({
            start: prev?.start || minDate, // Default start if missing
            end: val
        }));
    };

    const isActive = !!globalDateRange;
    const displayText = isActive
        ? `${formatDisplayDate(globalDateRange.start)} - ${formatDisplayDate(globalDateRange.end)}`
        : 'Select Date Range';

    return (
        <div className="relative" ref={containerRef}>
            {/* Trigger Button */}
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={clsx(
                    "flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors border",
                    isActive
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-secondary-foreground border-border hover:bg-accent"
                )}
            >
                <Calendar className="w-3.5 h-3.5" />
                <span className={clsx("truncate max-w-[240px] hidden sm:inline-block")}>
                    {displayText}
                </span>
                <ChevronDown className={clsx("w-3.5 h-3.5 transition-transform duration-150 ml-0 opacity-60", isOpen && "rotate-180")} />
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div className="absolute top-full -right-2 mt-2 pt-1 z-[var(--z-dropdown)] w-[380px] origin-top-right animate-in fade-in zoom-in-95 duration-200">
                    <div className="bg-popover text-popover-foreground rounded-lg shadow-lg border border-border overflow-hidden">

                        <div className="flex divide-x divide-border">
                            {/* Presets Sidebar */}
                            <div className="w-32 bg-muted/50 p-2 flex flex-col gap-1">
                                <span className="text-[10px] items-center gap-1 font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 mb-1 flex">
                                    <Clock className="w-3 h-3" /> Quick Select
                                </span>
                                {[{ hours: 12, label: 'Last 12h' }, { hours: 24, label: 'Last 24h' }].map(({ hours, label }) => (
                                    <button
                                        key={label}
                                        onClick={() => handlePresetHours(hours)}
                                        className="text-left px-3 py-1.5 text-xs font-medium rounded-md hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors"
                                    >
                                        {label}
                                    </button>
                                ))}
                                {[7, 30, 90].map(days => (
                                    <button
                                        key={days}
                                        onClick={() => handlePreset(days)}
                                        className="text-left px-3 py-1.5 text-xs font-medium rounded-md hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors"
                                    >
                                        Last {days}d
                                    </button>
                                ))}
                                <button
                                    onClick={handleAllTime}
                                    className="text-left px-3 py-1.5 text-xs font-medium rounded-md hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors"
                                >
                                    All Time
                                </button>
                            </div>

                            {/* Main Input Area */}
                            <div className="flex-1 p-4">
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground">Start</label>
                                        <input
                                            type="datetime-local"
                                            value={tempRange?.start || ''}
                                            onChange={updateTempStart}
                                            min={minDate}
                                            max={maxDate}
                                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                            style={{ colorScheme: isDarkMode ? 'dark' : 'light' }}
                                        />
                                    </div>

                                    <div className="flex justify-center text-muted-foreground">
                                        <ArrowRight className="w-4 h-4 rotate-90 sm:rotate-0 opacity-100 text-foreground" />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground">End</label>
                                        <input
                                            type="datetime-local"
                                            value={tempRange?.end || ''}
                                            onChange={updateTempEnd}
                                            min={minDate}
                                            max={maxDate}
                                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                            style={{ colorScheme: isDarkMode ? 'dark' : 'light' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-3 bg-muted/20 border-t border-border flex items-center justify-between gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClear}
                                className="h-8 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                                Clear
                            </Button>
                            <div className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsOpen(false)}
                                    className="h-8 px-2 text-xs"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handleApply}
                                    className="h-8 text-xs font-medium"
                                    icon={<Check className="w-3 h-3" />}
                                >
                                    Apply
                                </Button>
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
};
