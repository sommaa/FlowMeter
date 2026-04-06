import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Button style variants using class-variance-authority (CVA).
 *
 * Defines base styles and variant combinations for the Button component.
 * Base styles include: flexbox layout, rounded corners, focus ring, transitions,
 * disabled state, and SVG icon sizing.
 *
 * Variants:
 * - **default**: Primary blue with glow effect
 * - **destructive**: Red for dangerous actions
 * - **outline**: Bordered transparent background
 * - **secondary**: Gray muted styling
 * - **ghost**: Transparent with hover accent
 * - **link**: Text-only with underline on hover
 * - **success**: Green (emerald-500)
 * - **warning**: Yellow (amber-500)
 * - **info**: Cyan (cyan-500)
 *
 * Sizes:
 * - **default**: h-10 px-4 py-2
 * - **sm**: h-9 px-3 (smaller padding)
 * - **lg**: h-11 px-8 (larger padding)
 * - **icon**: h-10 w-10 (square for icon-only buttons)
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
        success: "bg-emerald-600 text-white hover:bg-emerald-700",
        warning: "bg-amber-500 text-white hover:bg-amber-600",
        info: "bg-cyan-500 text-white hover:bg-cyan-600",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Props for the Button component.
 *
 * Extends standard HTML button attributes and includes CVA variant props.
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  /**
   * When true, renders as Radix UI Slot instead of <button>.
   * Allows merging button props with child element (useful for custom components).
   */
  asChild?: boolean
}

/**
 * Base button component from shadcn/ui with extensive variant support.
 *
 * A foundational button component built with Radix UI Slot and CVA for flexible
 * styling. Supports multiple visual variants, sizes, and can render as a child
 * component via the `asChild` prop.
 *
 * Features:
 * - 9 visual variants (default, destructive, outline, secondary, ghost, link, success, warning, info)
 * - 4 size options (sm, default, lg, icon)
 * - Radix UI Slot integration for polymorphic rendering
 * - Forward ref support for external access
 * - Automatic icon sizing and spacing
 * - Focus ring and disabled states
 * - Smooth transitions (200ms ease-out)
 *
 * The `asChild` prop enables composition by merging props with the immediate child:
 * ```tsx
 * <Button asChild>
 *   <Link to="/profile">Profile</Link>
 * </Button>
 * // Renders: <Link> with button styles, not <button><Link></button>
 * ```
 *
 * @example
 * ```tsx
 * <Button variant="default" size="md">
 *   Click Me
 * </Button>
 * ```
 *
 * @example
 * ```tsx
 * <Button variant="destructive" size="sm">
 *   Delete
 * </Button>
 * ```
 *
 * @example
 * ```tsx
 * <Button variant="ghost" size="icon">
 *   <Settings className="w-4 h-4" />
 * </Button>
 * ```
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
