/**
 * Debounced opacity input component with validation and clamping.
 *
 * This component provides a text input specifically designed for opacity values (0.0 - 1.0).
 * It uses local state to allow smooth typing and only updates the parent component on blur
 * or Enter key press. Invalid values are clamped to the valid range and NaN defaults to 0.1.
 *
 * Features:
 * - Local state for immediate UI feedback during typing
 * - Validation and clamping on blur/Enter (0.0 - 1.0 range)
 * - Text input type to allow intermediate states like "0." while typing
 * - Automatic fallback to 0.1 for invalid inputs
 * - Right-aligned text for numeric values
 * - Compact 64px width, 24px height sizing
 *
 * @module components/visualizations/controls/DebouncedOpacityInput
 */

import React, { useState, useEffect } from 'react';

/**
 * Debounced opacity input component.
 *
 * Provides a specialized input for opacity values with validation and clamping.
 * The component maintains local state for the input value and only propagates
 * changes to the parent on blur or Enter key press. This allows users to type
 * intermediate values (like "0.") without triggering validation until complete.
 *
 * Behavior:
 * - **During Typing**: Local state updates immediately, no validation
 * - **On Blur**: Validates, clamps to 0.0-1.0, updates parent if changed
 * - **On Enter**: Same as blur (validates and updates parent)
 * - **On External Change**: Syncs local state with new value
 *
 * Validation Rules:
 * - Parses input as float
 * - If NaN (empty or invalid): defaults to 0.1
 * - If valid number: clamps to range [0.0, 1.0]
 * - Only calls onChange if value actually changed
 *
 * Input Type:
 * - Uses "text" type instead of "number" to allow intermediate states
 * - This lets users type "0." without immediate validation error
 * - Prevents browser number input spinner arrows
 *
 * Styling:
 * - Width: 64px (w-16)
 * - Height: 24px (h-6)
 * - Text: Extra small (text-xs), right-aligned
 * - Border: Standard input border with rounded corners
 * - Padding: Minimal (1px horizontal, 0px vertical)
 *
 * Use Cases:
 * - Threshold shaded area opacity (0.0 = transparent, 1.0 = opaque)
 * - Legend/annotation opacity
 * - Background/fill opacity for chart elements
 *
 * @param {Object} props - Component props
 * @param {number} props.value - Current opacity value from parent (0.0 - 1.0)
 * @param {(value: number) => void} props.onChange - Callback when validated value changes
 * @returns {JSX.Element} Compact opacity text input
 *
 * @example
 * ```tsx
 * <DebouncedOpacityInput
 *   value={0.15}
 *   onChange={(val) => updateThreshold({ shaded_area_opacity: val })}
 * />
 * ```
 */
export const DebouncedOpacityInput: React.FC<{
    value: number;
    onChange: (value: number) => void;
}> = ({ value, onChange }) => {
    const [localValue, setLocalValue] = useState<string>(value.toString());

    useEffect(() => {
        setLocalValue(value.toString());
    }, [value]);

    const handleBlur = () => {
        let val = parseFloat(localValue);
        if (isNaN(val)) {
            val = 0.1; // Default fallback
        } else {
            // Clamp between 0 and 1
            val = Math.min(1, Math.max(0, val));
        }

        // Update local formatting and parent
        setLocalValue(val.toString());
        if (val !== value) {
            onChange(val);
        }
    };

    return (
        <input
            type="text" // Use text to allow "0." and intermediate states
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    handleBlur();
                }
            }}
            className="w-16 h-6 px-1 py-0 text-xs border border-input rounded bg-transparent text-right"
        />
    );
};
