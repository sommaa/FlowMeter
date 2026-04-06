"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Label style variants using class-variance-authority.
 *
 * Defines base label styles:
 * - sm text size, medium font weight, tight leading
 * - Peer-disabled support: cursor-not-allowed and reduced opacity when sibling input is disabled
 */
const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
)

/**
 * Form label component built on Radix UI Label primitive.
 *
 * Accessible label for form controls with automatic association via Radix UI.
 * Supports peer-disabled styling to gray out labels when associated inputs
 * are disabled (using Tailwind's peer modifier).
 *
 * Features:
 * - Accessible labeling with proper ARIA attributes
 * - Peer-disabled state styling (70% opacity, not-allowed cursor)
 * - Small text (text-sm) with medium weight
 * - Forward ref support
 *
 * Use with form controls by wrapping or using htmlFor/id association:
 * ```tsx
 * <Label htmlFor="email">Email</Label>
 * <Input id="email" type="email" />
 * ```
 *
 * Or inline:
 * ```tsx
 * <Label>
 *   Email
 *   <Input type="email" />
 * </Label>
 * ```
 *
 * @example
 * ```tsx
 * <div className="space-y-2">
 *   <Label htmlFor="username">Username</Label>
 *   <Input id="username" placeholder="Enter username" />
 * </div>
 * ```
 */
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
