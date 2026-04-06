import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Styled text input component with theme-aware styling and states.
 *
 * A standard text input with consistent styling across the application.
 * Supports all native input types and features enhanced visual states.
 *
 * Features:
 * - Rounded corners (rounded-lg)
 * - Theme-aware background (muted/50 light, muted/30 dark)
 * - Inset shadow for depth perception
 * - Border hover effect (border-muted-foreground/30)
 * - Focus state with primary border and background change
 * - Disabled state with reduced opacity
 * - Responsive text sizing (base on mobile, sm on desktop)
 * - File input styling (for type="file")
 * - Smooth transitions (200ms ease-out)
 *
 * The input adapts to the current theme and provides visual feedback
 * for hover, focus, and disabled states.
 *
 * @example
 * ```tsx
 * <Input
 *   type="text"
 *   placeholder="Enter your name"
 *   value={name}
 *   onChange={(e) => setName(e.target.value)}
 * />
 * ```
 *
 * @example
 * ```tsx
 * <Input
 *   type="number"
 *   min={0}
 *   max={100}
 *   value={count}
 *   onChange={(e) => setCount(Number(e.target.value))}
 * />
 * ```
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-border bg-muted/50 dark:bg-muted/30 px-3 py-2 text-base text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/70 transition-all duration-200 ease-out",
          "shadow-[inset_0_1px_2px_0_rgba(0,0,0,0.04)] dark:shadow-[inset_0_1px_2px_0_rgba(0,0,0,0.2)]",
          "hover:border-muted-foreground/30",
          "focus-visible:outline-none focus-visible:border-primary focus-visible:bg-background",
          "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
