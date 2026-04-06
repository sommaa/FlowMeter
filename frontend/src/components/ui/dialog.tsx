import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Dialog root component (re-exported from Radix UI).
 * Manages open/close state and provides context to child components.
 */
const Dialog = DialogPrimitive.Root

/**
 * Dialog trigger component (re-exported from Radix UI).
 * Wraps the element that opens the dialog when clicked.
 */
const DialogTrigger = DialogPrimitive.Trigger

/**
 * Dialog portal component (re-exported from Radix UI).
 * Renders dialog content in a React portal at document.body.
 */
const DialogPortal = DialogPrimitive.Portal

/**
 * Dialog close component (re-exported from Radix UI).
 * Wraps elements that should close the dialog when clicked.
 */
const DialogClose = DialogPrimitive.Close

/**
 * Styled dialog overlay with fade animation.
 *
 * Renders a semi-transparent black backdrop (60% opacity) behind the dialog.
 * Fade-in/fade-out animations on open/close with data-state animations.
 * Uses z-index from CSS custom property (--z-modal).
 */
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[var(--z-modal)] bg-black/60",
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/**
 * Styled dialog content container with animations and close button.
 *
 * Renders a centered modal dialog with:
 * - Centered positioning (transform translate -50%)
 * - Maximum width (max-w-lg)
 * - Elevation shadow (elevation-5)
 * - Rounded corners (rounded-2xl)
 * - Border with 60% opacity
 * - Zoom and slide animations on open/close
 * - Automatic close button (X icon) in top-right corner
 * - 300ms ease-out transitions
 *
 * The dialog appears with a zoom-in + slide-in-from-top animation and
 * closes with a zoom-out + slide-out-to-top animation.
 *
 * @example
 * ```tsx
 * <Dialog open={isOpen} onOpenChange={setIsOpen}>
 *   <DialogContent>
 *     <DialogHeader>
 *       <DialogTitle>Title</DialogTitle>
 *       <DialogDescription>Description</DialogDescription>
 *     </DialogHeader>
 *     <div>Content</div>
 *     <DialogFooter>
 *       <Button onClick={() => setIsOpen(false)}>Close</Button>
 *     </DialogFooter>
 *   </DialogContent>
 * </Dialog>
 * ```
 */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-[var(--z-modal)] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-card p-6 duration-200 ease-out",
        "shadow-lg rounded-xl",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-lg p-1.5 opacity-70 ring-offset-background transition-all duration-200 hover:opacity-100 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

/**
 * Dialog header container for title and description.
 *
 * Flexbox column layout with vertical spacing (space-y-1.5).
 * Text alignment: centered on mobile, left-aligned on desktop (sm:text-left).
 */
const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

/**
 * Dialog footer container for action buttons.
 *
 * Responsive layout: stacked column on mobile, horizontal row on desktop.
 * Desktop (sm+): right-aligned with horizontal spacing (space-x-2).
 * Mobile: reverse column order (primary action appears first visually).
 */
const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

/**
 * Dialog title component with semibold styling.
 *
 * Typography: lg size, semibold weight, tight leading and tracking.
 * Automatically provides accessible title for screen readers via Radix UI.
 */
const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

/**
 * Dialog description component with muted text.
 *
 * Typography: sm size, muted-foreground color for secondary text.
 * Automatically provides accessible description for screen readers via Radix UI.
 */
const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
