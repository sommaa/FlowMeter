import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Main card container component with elevation and border styling.
 *
 * Provides a rounded container with subtle border, elevation shadow,
 * and smooth transitions. Adapts background and text colors to the
 * current theme via CSS custom properties.
 *
 * Base styles:
 * - Rounded corners (xl)
 * - Border with 60% opacity
 * - Elevation shadow (elevation-2)
 * - Theme-aware background (bg-card) and text (text-card-foreground)
 * - 300ms ease-out transitions
 *
 * @example
 * ```tsx
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Title</CardTitle>
 *     <CardDescription>Description</CardDescription>
 *   </CardHeader>
 *   <CardContent>Content goes here</CardContent>
 *   <CardFooter>Footer actions</CardFooter>
 * </Card>
 * ```
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-border bg-card text-card-foreground transition-colors duration-150",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

/**
 * Card header section for title and description.
 *
 * Provides consistent spacing for card headers with vertical layout.
 * Typically contains CardTitle and CardDescription components.
 *
 * Spacing: p-6 (24px padding), pb-4 (16px bottom padding), space-y-1.5 (6px gap)
 */
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6 pb-4", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

/**
 * Card title component with large semibold text.
 *
 * Typography: 2xl size, semibold weight, tight leading and tracking.
 */
const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

/**
 * Card description/subtitle component with muted text.
 *
 * Typography: sm size, muted-foreground color for secondary text.
 */
const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

/**
 * Card main content area.
 *
 * Provides consistent padding for card body content.
 * Spacing: p-6 (24px padding), pt-0 (no top padding to connect with header).
 */
const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

/**
 * Card footer section for actions or supplementary content.
 *
 * Uses flexbox with centered items for action buttons or metadata.
 * Spacing: p-6 (24px padding), pt-0 (no top padding), items-center alignment.
 */
const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
