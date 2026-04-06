import React, { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CHART_COLORS } from "@/lib/constants";
import { Pipette } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

/**
 * Props for the CustomColorPicker component.
 */
interface CustomColorPickerProps {
    /** Current hex color value (e.g., "#FF5733") */
    value: string;
    /** Callback when color changes (debounced) */
    onChange: (value: string) => void;
    /** Additional CSS classes for the trigger button */
    className?: string;
    /** Debounce delay in milliseconds for onChange (default: 200ms) */
    debounceMs?: number;
}

/**
 * Color picker with hex input, system picker, and preset palette.
 *
 * Provides multiple ways to select colors:
 * - **Preset Palette**: Grid of predefined chart colors from CHART_COLORS
 * - **System Picker**: Native browser color picker (hidden overlay)
 * - **Hex Input**: Manual hex color entry with validation
 *
 * Features:
 * - Debounced onChange to reduce update frequency during typing
 * - Validates hex format (#RRGGBB) and resets to external value on blur if invalid
 * - Visual feedback for active color with ring indicator
 * - Popover interface that doesn't auto-focus input (prevents scroll jumps)
 *
 * @example
 * ```tsx
 * <CustomColorPicker
 *   value="#FF5733"
 *   onChange={(color) => updateSeriesColor(seriesId, color)}
 *   debounceMs={300}
 * />
 * ```
 */
export const CustomColorPicker: React.FC<CustomColorPickerProps> = ({
    value,
    onChange,
    className,
    debounceMs = 200
}) => {
    const [localValue, setLocalValue] = useState(value);
    const debouncedValue = useDebounce(localValue, debounceMs);
    const [isOpen, setIsOpen] = useState(false);
    const isFirstRender = React.useRef(true);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        if (debouncedValue !== value) {
            onChange(debouncedValue);
        }
    }, [debouncedValue]);

    const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setLocalValue(newValue);
    };

    const handleBlur = () => {
        // Reset to external value if invalid
        if (!/^#[0-9A-F]{6}$/i.test(localValue)) {
            setLocalValue(value);
        }
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen} modal={true}>
            <PopoverTrigger asChild>
                <div
                    className={cn(
                        "w-9 h-9 rounded-md border border-input cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all",
                        className
                    )}
                    style={{ backgroundColor: value }}
                    role="button"
                    title="Pick Color"
                />
            </PopoverTrigger>
            <PopoverContent
                className="w-64 p-3"
                align="start"
                side="bottom"
                sideOffset={5}
                onOpenAutoFocus={(e) => e.preventDefault()} // Prevent auto-focusing input which might scroll
            >
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label className="text-xs">Hex Color</Label>
                        <div className="flex items-center gap-2">
                            <div
                                className="w-8 h-8 rounded border border-border shrink-0 relative overflow-hidden group cursor-pointer"
                                style={{ backgroundColor: localValue }}
                                title="Click for System Picker"
                            >
                                <input
                                    type="color"
                                    value={localValue}
                                    onChange={(e) => {
                                        setLocalValue(e.target.value);
                                    }}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity pointer-events-none">
                                    <Pipette className="w-4 h-4 text-white" />
                                </div>
                            </div>
                            <Input
                                value={localValue}
                                onChange={handleHexChange}
                                onBlur={handleBlur}
                                className="h-8 font-mono"
                                placeholder="#000000"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs">Presets</Label>
                        <div className="grid grid-cols-5 gap-2">
                            {CHART_COLORS.map((color) => (
                                <button
                                    key={color}
                                    className={cn(
                                        "w-8 h-8 rounded-md border border-transparent hover:border-foreground/20 transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary",
                                        value === color && "ring-2 ring-offset-1 ring-primary border-foreground/50"
                                    )}
                                    style={{ backgroundColor: color }}
                                    onClick={() => {
                                        setLocalValue(color);
                                        // Presets can update immediately if we want, but sticking to debounce pattern
                                        // or force immediate update to close popover potentially?
                                        // Let's stick to consistent debounce behavior or standard update.
                                        // Actually for presets, we often want immediate feedback + close.
                                        // But keeping it unified via debounce is safer for now, or we can explicit call.
                                        // If we set localValue, debounce will trigger.
                                        setIsOpen(false);
                                    }}
                                    title={color}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};
