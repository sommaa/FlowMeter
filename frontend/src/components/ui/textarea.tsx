import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Styled multi-line text input component.
 *
 * A standard textarea with consistent styling matching the Input component.
 * Suitable for longer text entry like comments, descriptions, or notes.
 *
 * Features:
 * - Minimum height of 80px (can expand with content)
 * - Rounded corners (rounded-lg)
 * - Theme-aware background (muted/50 light, muted/30 dark)
 * - Inset shadow for depth
 * - Border hover effect
 * - Focus state with primary border
 * - Disabled state with reduced opacity
 * - Responsive text sizing (base on mobile, sm on desktop)
 * - Smooth transitions (200ms ease-out)
 *
 * @example
 * ```tsx
 * <Textarea
 *   placeholder="Enter your comments..."
 *   value={comments}
 *   onChange={(e) => setComments(e.target.value)}
 *   rows={4}
 * />
 * ```
 *
 * @example
 * ```tsx
 * <Textarea
 *   placeholder="Description"
 *   value={description}
 *   onChange={(e) => setDescription(e.target.value)}
 *   className="resize-none"
 * />
 * ```
 */
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-lg border border-border bg-muted/50 dark:bg-muted/30 px-3 py-2 text-base text-foreground ring-offset-background placeholder:text-muted-foreground/70 transition-all duration-200 ease-out",
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
})
Textarea.displayName = "Textarea"

export { Textarea }
