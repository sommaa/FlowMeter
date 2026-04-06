
import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Props for the Checkbox component.
 *
 * Extends standard HTML input checkbox attributes.
 */
export interface CheckboxProps
    extends React.InputHTMLAttributes<HTMLInputElement> { }

/**
 * Styled checkbox component with custom check icon.
 *
 * A replacement for the native checkbox with consistent styling across
 * browsers. Uses a hidden native checkbox input with CSS peer selector
 * to control a custom check icon overlay.
 *
 * Features:
 * - Custom appearance with rounded corners (sm)
 * - Primary color background when checked
 * - Lucide Check icon with bold stroke (strokeWidth: 3)
 * - Focus ring support (ring-2 on focus-visible)
 * - Disabled state with reduced opacity
 * - Centered alignment in inline contexts
 *
 * The component uses `appearance-none` to hide the native checkbox,
 * then shows a Lucide Check icon when the input is in `:checked` state
 * via the `peer-checked:block` utility.
 *
 * @example
 * ```tsx
 * <Checkbox
 *   checked={isEnabled}
 *   onChange={(e) => setIsEnabled(e.target.checked)}
 * />
 * ```
 *
 * @example
 * ```tsx
 * <label className="flex items-center gap-2">
 *   <Checkbox checked={acceptTerms} onChange={handleCheck} />
 *   <span>Accept terms and conditions</span>
 * </label>
 * ```
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
    ({ className, ...props }, ref) => {
        return (
            <div className="relative inline-flex items-center justify-center w-4 h-4 align-middle">
                <input
                    type="checkbox"
                    className={cn(
                        "peer h-4 w-4 shrink-0 rounded-sm border border-input ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-background checked:bg-primary checked:border-primary",
                        className
                    )}
                    ref={ref}
                    {...props}
                />
                <Check
                    className="absolute w-3 h-3 text-primary-foreground pointer-events-none hidden peer-checked:block"
                    strokeWidth={3}
                />
            </div>
        )
    }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
