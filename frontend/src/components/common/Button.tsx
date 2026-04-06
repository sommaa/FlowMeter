import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button as ShadcnButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Props for the Button component.
 *
 * Extends standard HTML button attributes with custom styling and behavior props.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Visual style variant (default: "primary") */
    variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'ghost' | 'outline';
    /** Button size (default: "md") */
    size?: 'sm' | 'md' | 'lg';
    /** Shows loading spinner and disables button when true */
    loading?: boolean;
    /** Optional icon element to display before text */
    icon?: React.ReactNode;
}

/**
 * Reusable button component with loading state and icon support.
 *
 * A wrapper around the Shadcn Button component that provides:
 * - Consistent styling with application theme variants
 * - Loading state with animated spinner
 * - Optional icon support with automatic spacing
 * - Automatic disabled state when loading
 * - Forward ref support for external access
 *
 * The component maps legacy variant names to Shadcn equivalents:
 * - primary → default (blue)
 * - secondary → secondary (gray)
 * - success → success (green)
 * - warning → warning (yellow)
 * - danger → destructive (red)
 * - ghost → ghost (transparent)
 * - outline → outline (bordered)
 *
 * @example
 * ```tsx
 * <Button variant="primary" size="md" onClick={() => save()}>
 *   Save Changes
 * </Button>
 * ```
 *
 * @example
 * ```tsx
 * <Button
 *   variant="danger"
 *   loading={isDeleting}
 *   icon={<Trash className="w-4 h-4" />}
 * >
 *   Delete
 * </Button>
 * ```
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    className,
    disabled,
    ...props
}, ref) => {
    // Map legacy variants to Shadcn variants
    const variantMap: Record<string, "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "success" | "warning"> = {
        primary: "default",
        secondary: "secondary",
        success: "success",
        warning: "warning",
        danger: "destructive",
        ghost: "ghost",
        outline: "outline",
    };

    const sizeMap: Record<string, "default" | "sm" | "lg" | "icon"> = {
        sm: "sm",
        md: "default",
        lg: "lg",
    };

    return (
        <ShadcnButton
            ref={ref}
            variant={variantMap[variant] || "default"}
            size={sizeMap[size] || "default"}
            className={cn(className)}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {!loading && icon && <span className="mr-2">{icon}</span>}
            {children}
        </ShadcnButton>
    );
});

Button.displayName = 'Button';
