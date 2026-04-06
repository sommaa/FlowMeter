import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Utility function for merging and deduplicating Tailwind CSS class names.
 *
 * Combines `clsx` for conditional class name construction with `twMerge`
 * for intelligent Tailwind class conflict resolution. This prevents duplicate
 * utility classes and ensures the last conflicting class takes precedence.
 *
 * **How it works:**
 * 1. `clsx` processes conditional class logic and combines class names
 * 2. `twMerge` removes Tailwind conflicts (e.g., keeps `px-4` over `px-2`)
 *
 * **Conflict resolution example:**
 * - Input: `cn('px-2 py-1', 'px-4')` → Output: `"py-1 px-4"` (px-2 removed)
 * - Input: `cn('text-red-500', condition && 'text-blue-500')` → Output depends on condition
 *
 * This is the standard utility function used throughout shadcn/ui components.
 *
 * @param inputs - Class names (strings), conditional objects, or arrays
 * @returns Merged and deduplicated class name string
 *
 * @example
 * ```tsx
 * // Basic usage
 * cn('px-2 py-1', 'bg-primary') // "px-2 py-1 bg-primary"
 *
 * // Conditional classes
 * cn('base-class', isActive && 'active-class') // includes active-class if true
 *
 * // Conflict resolution
 * cn('px-2', 'px-4') // "px-4" (px-2 removed)
 *
 * // With prop className override
 * cn('default-style', className) // className can override defaults
 * ```
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}
