/**
 * Application constants for colors, themes, and shared configuration values.
 *
 * Provides centralized color palettes and configuration values used throughout
 * the application to ensure visual consistency.
 */

/**
 * Default color palette for chart series.
 *
 * A sequence of distinct, accessible colors designed for data visualization.
 * Colors cycle through when creating multiple series in the same chart.
 *
 * Primary colors are inspired by MATLAB's default palette for scientific
 * familiarity. Backup Tailwind colors provide additional options.
 *
 * Used by:
 * - Visualization series color selection
 * - CustomColorPicker preset palette
 * - Default series color assignment
 */
export const CHART_COLORS = [
    '#0072BD', // Blue
    '#D95319', // Orange
    '#EDB120', // Yellow
    '#7E2F8E', // Purple
    '#77AC30', // Green
    '#4DBEEE', // Cyan
    '#A2142F', // Dark Red
    // Cycle repeats or add additional distinct colors if needed
    '#2563eb', // Backup Blue (Tailwind)
    '#16a34a', // Backup Green (Tailwind)
    '#dc2626', // Backup Red (Tailwind)
];

/**
 * Semantic theme colors for UI elements.
 *
 * Fixed hex color values for status indicators, buttons, and alerts.
 * These are separate from the dynamic theme system (THEMES) and remain
 * constant across theme changes.
 *
 * Used for:
 * - Destructive actions (danger)
 * - Warning messages (warning)
 * - Success notifications (success)
 * - Informational alerts (info)
 * - Primary brand color fallback (primary)
 *
 * @deprecated Consider using CSS custom properties (--primary, --destructive, etc.)
 * from the theme system instead for better theme consistency.
 */
export const THEME_COLORS = {
    primary: '#0d9488', // Teal-600
    danger: '#ef4444',  // Red-500
    warning: '#f59e0b', // Amber-500
    success: '#10b981', // Emerald-500
    info: '#0ea5e9',    // Sky-500

};
