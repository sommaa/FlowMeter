import React, { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";

// ============= Debounced Input =============

/**
 * Props for the DebouncedInput component.
 *
 * Extends standard HTML input attributes, replacing onChange and value
 * with debounced versions.
 */
export interface DebouncedInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  /** Optional label text displayed above the input */
  label?: string;
  /** Controlled input value (string) */
  value: string;
  /** Debounced callback invoked with new value after delay */
  onChange: (value: string) => void;
  /** Debounce delay in milliseconds (default: 500ms) */
  debounceMs?: number;
}

/**
 * Text input component with debounced onChange callback.
 *
 * Provides a text input that delays onChange callbacks until the user
 * stops typing for the specified debounce period. Useful for reducing
 * API calls, expensive computations, or re-renders on every keystroke.
 *
 * Features:
 * - Maintains local state for immediate UI updates
 * - Syncs with external value prop changes
 * - Skips onChange on initial render
 * - Only calls onChange when debounced value differs from external value
 * - Optional label with consistent spacing
 *
 * The component uses a ref to track first render and prevent firing
 * onChange on mount, ensuring it only responds to user interactions.
 *
 * @example
 * ```tsx
 * <DebouncedInput
 *   label="Search"
 *   value={searchQuery}
 *   onChange={(query) => fetchResults(query)}
 *   debounceMs={300}
 *   placeholder="Type to search..."
 * />
 * ```
 */
export const DebouncedInput: React.FC<DebouncedInputProps> = ({
  label,
  value: externalValue,
  onChange,
  debounceMs = 500,
  className,
  ...props
}) => {
  const [localValue, setLocalValue] = useState(externalValue);
  const debouncedValue = useDebounce(localValue, debounceMs);
  const isFirstRender = useRef(true);

  // Sync external value changes
  useEffect(() => {
    setLocalValue(externalValue);
  }, [externalValue]);

  // Call onChange when debounced value changes (skip first render)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (debouncedValue !== externalValue) {
      onChange(debouncedValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValue]);

  return (
    <div className="w-full space-y-1">
      {label && <Label>{label}</Label>}
      <Input
        className={className}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        {...props}
      />
    </div>
  );
};

// ============= Debounced TextArea =============

/**
 * Props for the DebouncedTextArea component.
 *
 * Extends standard HTML textarea attributes, replacing onChange and value
 * with debounced versions.
 */
export interface DebouncedTextAreaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  /** Optional label text displayed above the textarea */
  label?: string;
  /** Controlled textarea value (string) */
  value: string;
  /** Debounced callback invoked with new value after delay */
  onChange: (value: string) => void;
  /** Debounce delay in milliseconds (default: 500ms) */
  debounceMs?: number;
}

/**
 * Multi-line text input component with debounced onChange callback.
 *
 * Similar to DebouncedInput but for multi-line text areas. Delays onChange
 * callbacks until the user stops typing, making it ideal for:
 * - Formula editors with live validation
 * - Comment fields with auto-save
 * - Description editors with preview rendering
 * - Any large text input with expensive onChange operations
 *
 * Features:
 * - Non-resizable by default (resize-none class)
 * - Maintains local state for immediate UI updates
 * - Syncs with external value prop changes
 * - Skips onChange on initial render
 * - Optional label with consistent spacing
 *
 * @example
 * ```tsx
 * <DebouncedTextArea
 *   label="Description"
 *   value={description}
 *   onChange={(text) => updateDescription(text)}
 *   debounceMs={800}
 *   rows={4}
 *   placeholder="Enter description..."
 * />
 * ```
 */
export const DebouncedTextArea: React.FC<DebouncedTextAreaProps> = ({
  label,
  value: externalValue,
  onChange,
  debounceMs = 500,
  className,
  ...props
}) => {
  const [localValue, setLocalValue] = useState(externalValue);
  const debouncedValue = useDebounce(localValue, debounceMs);
  const isFirstRender = useRef(true);

  useEffect(() => {
    setLocalValue(externalValue);
  }, [externalValue]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Only call onChange if the debounced value is different from the external value
    // AND the change comes from local interaction (implied by debouncedValue changing)
    if (debouncedValue !== externalValue) {
      onChange(debouncedValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValue]);

  return (
    <div className="w-full space-y-1">
      {label && <Label>{label}</Label>}
      <Textarea
        className={cn('resize-none', className)}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        {...props}
      />
    </div>
  );
};

// ============= Debounced Color Picker =============

/**
 * Props for the DebouncedColorPicker component.
 *
 * Extends standard HTML input attributes, replacing onChange and value
 * with debounced versions.
 */
export interface DebouncedColorPickerProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  /** Current hex color value (e.g., "#FF5733") */
  value: string;
  /** Debounced callback invoked with new color after delay */
  onChange: (value: string) => void;
  /** Debounce delay in milliseconds (default: 200ms) */
  debounceMs?: number;
}

/**
 * Native color picker input with debounced onChange callback.
 *
 * Wraps the native HTML5 color input (`<input type="color">`) with
 * debounced onChange behavior. Uses a shorter default debounce delay
 * (200ms vs 500ms) since color picker interactions are typically
 * more intentional than text input.
 *
 * Features:
 * - Native browser color picker UI
 * - Styled to match application theme (rounded, bordered)
 * - Maintains local state for immediate UI feedback
 * - Syncs with external value prop changes
 * - Shorter debounce optimized for color selection
 *
 * The native color picker provides a platform-specific color selection
 * interface and always returns values in lowercase hex format (#rrggbb).
 *
 * @example
 * ```tsx
 * <DebouncedColorPicker
 *   value={seriesColor}
 *   onChange={(color) => updateSeriesColor(seriesId, color)}
 *   debounceMs={150}
 * />
 * ```
 */
export const DebouncedColorPicker: React.FC<DebouncedColorPickerProps> = ({
  value: externalValue,
  onChange,
  debounceMs = 200,
  className,
  ...props
}) => {
  const [localValue, setLocalValue] = useState(externalValue);
  const debouncedValue = useDebounce(localValue, debounceMs);
  const isFirstRender = useRef(true);

  useEffect(() => {
    setLocalValue(externalValue);
  }, [externalValue]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (debouncedValue !== externalValue) {
      onChange(debouncedValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValue]);

  return (
    <div className="relative">
      <input
        type="color"
        className={cn(
          "flex h-10 w-full cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        {...props}
      />
    </div>
  );
};
