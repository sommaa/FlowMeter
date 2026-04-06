import * as React from "react"
import { ChevronUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input as ShadcnInput } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Props for the NumberInput component.
 *
 * Extends standard HTML input attributes, replacing onChange with
 * a typed version and adding error/label props.
 */
export interface NumberInputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
    /** Optional label text displayed above the input */
    label?: string
    /** Change handler receiving synthetic React event */
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
    /** Optional error message displayed below input in destructive color */
    error?: string
}

/**
 * Enhanced number input with increment/decrement buttons.
 *
 * A styled number input featuring +/- buttons for step-based value adjustment.
 * Handles min/max constraints and dispatches synthetic React events for
 * compatibility with React's controlled component pattern.
 *
 * Features:
 * - Increment/decrement buttons with chevron icons
 * - Respects min, max, and step attributes
 * - Dispatches synthetic React change events when buttons are clicked
 * - Error state styling with destructive border and ring
 * - Optional label and error message display
 * - Disabled state support for both input and buttons
 * - Forward ref support with useImperativeHandle
 *
 * The component uses a sophisticated approach to trigger React's change
 * handler when buttons are clicked:
 * 1. Updates the native input value using property descriptor
 * 2. Dispatches native 'input' event for browser APIs
 * 3. Creates synthetic React ChangeEvent for React's onChange handler
 *
 * @example
 * ```tsx
 * <NumberInput
 *   label="Quantity"
 *   value={quantity}
 *   onChange={(e) => setQuantity(Number(e.target.value))}
 *   min={0}
 *   max={100}
 *   step={1}
 * />
 * ```
 *
 * @example
 * ```tsx
 * <NumberInput
 *   label="Opacity"
 *   value={opacity}
 *   onChange={(e) => setOpacity(Number(e.target.value))}
 *   min={0}
 *   max={1}
 *   step={0.1}
 *   error={opacity > 1 ? "Must be ≤ 1" : undefined}
 * />
 * ```
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
    ({ className, label, onChange, value, min, max, step = 1, disabled, error, ...props }, ref) => {
        const inputRef = React.useRef<HTMLInputElement>(null)

        const handleStep = (direction: number) => {
            if (inputRef.current) {
                const currentValue = parseFloat(inputRef.current.value || "0")
                const stepValue = typeof step === "string" ? parseFloat(step) : step
                const newValue = currentValue + (stepValue * direction)

                if (max !== undefined && newValue > parseFloat(max.toString())) return
                if (min !== undefined && newValue < parseFloat(min.toString())) return

                // standard React integration
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                nativeInputValueSetter?.call(inputRef.current, newValue);

                // Dispatch native event
                const event = new Event('input', { bubbles: true });
                inputRef.current.dispatchEvent(event);

                // Call handler directly
                if (onChange) {
                    const syntheticEvent = {
                        ...event,
                        target: inputRef.current,
                        currentTarget: inputRef.current,
                        bubbles: true,
                        cancelable: false,
                        defaultPrevented: false,
                        eventPhase: 3,
                        isTrusted: true,
                        nativeEvent: event,
                        persist: () => { },
                        preventDefault: () => { },
                        isDefaultPrevented: () => false,
                        stopPropagation: () => { },
                        isPropagationStopped: () => false,
                        type: 'change'
                    } as unknown as React.ChangeEvent<HTMLInputElement>;
                    onChange(syntheticEvent);
                }
            }
        }

        // Combine refs
        React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

        return (
            <div className={cn("w-full space-y-1", className)}>
                {label && <Label>{label}</Label>}
                <div className="relative">
                    <ShadcnInput
                        ref={inputRef}
                        type="number"
                        value={value}
                        onChange={onChange}
                        min={min}
                        max={max}
                        step={step}
                        disabled={disabled}
                        className={cn(
                            "pr-8",
                            error && 'border-destructive focus-visible:ring-destructive',
                            !label && "mt-0"
                        )}
                        {...props}
                    />
                    <div className="absolute right-0 top-0 h-full flex flex-col border-l border-input">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-1/2 w-8 rounded-none rounded-tr-md border-b border-input px-0 hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                            onClick={() => handleStep(1)}
                            disabled={disabled}
                            tabIndex={-1}
                        >
                            <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-1/2 w-8 rounded-none rounded-br-md px-0 hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                            onClick={() => handleStep(-1)}
                            disabled={disabled}
                            tabIndex={-1}
                        >
                            <ChevronDown className="h-3 w-3" />
                        </Button>
                    </div>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
        )
    }
)
NumberInput.displayName = "NumberInput"
