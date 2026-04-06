/**
 * Theme configuration and color definitions.
 *
 * Defines the available color themes for the application with HSL values
 * for CSS custom properties in both light and dark modes.
 *
 * Colors are specified in HSL format without the `hsl()` wrapper (e.g., "176 61% 32%")
 * to allow usage in Tailwind's opacity modifiers (e.g., `bg-primary/50`).
 */

/**
 * Available theme identifiers.
 */
export type ThemeId = 'teal' | 'blue' | 'violet' | 'orange' | 'rose';

/**
 * Theme configuration interface.
 */
export interface Theme {
    /** Unique theme identifier */
    id: ThemeId;
    /** Human-readable theme name */
    name: string;
    /** Color values for light and dark modes */
    colors: {
        light: {
            /** Primary brand color in HSL format (e.g., "176 61% 32%") */
            primary: string;
            /** Focus ring color in HSL format */
            ring: string;
        };
        dark: {
            /** Primary brand color in HSL format (lighter for dark mode) */
            primary: string;
            /** Focus ring color in HSL format */
            ring: string;
        };
    };
}

/**
 * Theme registry mapping theme IDs to complete theme configurations.
 *
 * Themes included:
 * - **teal** (default): Professional teal - balanced and neutral
 * - **blue**: Corporate blue - traditional and trustworthy
 * - **violet**: Creative violet - modern and vibrant
 * - **orange**: Warm orange - energetic and friendly
 * - **rose**: Vibrant rose - bold and expressive
 *
 * Each theme has separate light/dark mode colors optimized for
 * readability and visual appeal in their respective modes.
 */
export const THEMES: Record<ThemeId, Theme> = {
    teal: {
        id: 'teal',
        name: 'Professional Teal',
        colors: {
            light: {
                primary: '176 61% 32%', // Teal-700 based
                ring: '176 61% 32%',
            },
            dark: {
                primary: '175 77% 50%', // Teal-400
                ring: '175 77% 50%',
            },
        },
    },
    blue: {
        id: 'blue',
        name: 'Corporate Blue',
        colors: {
            light: {
                primary: '221.2 83.2% 53.3%', // Blue-500
                ring: '221.2 83.2% 53.3%',
            },
            dark: {
                primary: '217.2 91.2% 59.8%', // Blue-400
                ring: '217.2 91.2% 59.8%',
            },
        },
    },
    violet: {
        id: 'violet',
        name: 'Creative Violet',
        colors: {
            light: {
                primary: '262.1 83.3% 57.8%', // Violet-500
                ring: '262.1 83.3% 57.8%',
            },
            dark: {
                primary: '258.3 89.5% 66.3%', // Violet-400
                ring: '258.3 89.5% 66.3%',
            },
        },
    },
    orange: {
        id: 'orange',
        name: 'Warm Orange',
        colors: {
            light: {
                primary: '24.6 95% 53.1%', // Orange-500
                ring: '24.6 95% 53.1%',
            },
            dark: {
                // Orange-400: 32.1 94.6% 64.3%
                // Let's go with Orange-400 for dark mode visibility
                primary: '32.1 94.6% 64.3%',
                ring: '32.1 94.6% 64.3%',
            },
        },
    },
    rose: {
        id: 'rose',
        name: 'Vibrant Rose',
        colors: {
            light: {
                primary: '346.8 77.2% 49.8%', // Rose-500
                ring: '346.8 77.2% 49.8%',
            },
            dark: {
                primary: '350.6 89.1% 71.8%', // Rose-400
                ring: '350.6 89.1% 71.8%',
            },
        },
    },
};
