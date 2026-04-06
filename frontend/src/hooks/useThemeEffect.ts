import { useEffect } from 'react';
import { THEMES, ThemeId } from '@/lib/themes';

/**
 * Custom hook for applying theme colors and dark mode to the document.
 *
 * Synchronizes theme state with the DOM by:
 * 1. Adding/removing 'dark' class on `<html>` element for Tailwind dark mode
 * 2. Setting CSS custom properties (--primary, --ring) based on selected theme
 *
 * The hook responds to changes in theme or dark mode by updating CSS variables
 * that control the application's color scheme. Theme colors are defined in
 * THEMES configuration with separate light/dark mode color values.
 *
 * CSS variables updated:
 * - `--primary`: Primary brand color (e.g., "180 100% 35%")
 * - `--ring`: Focus ring color (e.g., "180 100% 35%")
 *
 * @param theme - Theme identifier (e.g., "teal", "blue", "purple")
 * @param isDarkMode - Whether dark mode is active
 *
 * @example
 * ```tsx
 * const theme = useStore(state => state.theme);
 * const isDarkMode = useStore(state => state.isDarkMode);
 * useThemeEffect(theme, isDarkMode);
 * ```
 */
export function useThemeEffect(theme: ThemeId, isDarkMode: boolean): void {
    useEffect(() => {
        // Dark Mode
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        // Theme Variables
        const currentTheme = THEMES[theme] || THEMES.teal;
        const mode = isDarkMode ? 'dark' : 'light';
        const colors = currentTheme.colors[mode];

        document.documentElement.style.setProperty('--primary', colors.primary);
        document.documentElement.style.setProperty('--ring', colors.ring);
    }, [isDarkMode, theme]);
}
