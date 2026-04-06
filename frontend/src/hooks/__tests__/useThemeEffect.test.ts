import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useThemeEffect } from '@/hooks/useThemeEffect';
import { THEMES } from '@/lib/themes';

describe('useThemeEffect', () => {
  beforeEach(() => {
    // Reset the document element state before each test
    document.documentElement.classList.remove('dark');
    document.documentElement.style.removeProperty('--primary');
    document.documentElement.style.removeProperty('--ring');
  });

  it('adds the "dark" class when isDarkMode is true', () => {
    renderHook(() => useThemeEffect('teal', true));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes the "dark" class when isDarkMode is false', () => {
    document.documentElement.classList.add('dark');
    renderHook(() => useThemeEffect('teal', false));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('sets CSS custom properties for light mode teal theme', () => {
    renderHook(() => useThemeEffect('teal', false));
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--primary')).toBe(THEMES.teal.colors.light.primary);
    expect(style.getPropertyValue('--ring')).toBe(THEMES.teal.colors.light.ring);
  });

  it('sets CSS custom properties for dark mode teal theme', () => {
    renderHook(() => useThemeEffect('teal', true));
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--primary')).toBe(THEMES.teal.colors.dark.primary);
    expect(style.getPropertyValue('--ring')).toBe(THEMES.teal.colors.dark.ring);
  });

  it('applies blue theme colors in light mode', () => {
    renderHook(() => useThemeEffect('blue', false));
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--primary')).toBe(THEMES.blue.colors.light.primary);
    expect(style.getPropertyValue('--ring')).toBe(THEMES.blue.colors.light.ring);
  });

  it('applies violet theme colors in dark mode', () => {
    renderHook(() => useThemeEffect('violet', true));
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--primary')).toBe(THEMES.violet.colors.dark.primary);
    expect(style.getPropertyValue('--ring')).toBe(THEMES.violet.colors.dark.ring);
  });

  it('updates CSS properties when theme changes', () => {
    const { rerender } = renderHook(
      ({ theme, isDark }) => useThemeEffect(theme, isDark),
      { initialProps: { theme: 'teal' as const, isDark: false } }
    );

    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(
      THEMES.teal.colors.light.primary
    );

    rerender({ theme: 'rose' as const, isDark: false });

    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(
      THEMES.rose.colors.light.primary
    );
  });

  it('updates CSS properties when dark mode toggles', () => {
    const { rerender } = renderHook(
      ({ theme, isDark }) => useThemeEffect(theme, isDark),
      { initialProps: { theme: 'orange' as const, isDark: false } }
    );

    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(
      THEMES.orange.colors.light.primary
    );
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    rerender({ theme: 'orange' as const, isDark: true });

    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(
      THEMES.orange.colors.dark.primary
    );
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('falls back to teal theme for an unknown theme id', () => {
    // Cast to bypass TypeScript for testing the fallback
    renderHook(() => useThemeEffect('nonexistent' as any, false));
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--primary')).toBe(THEMES.teal.colors.light.primary);
    expect(style.getPropertyValue('--ring')).toBe(THEMES.teal.colors.light.ring);
  });
});
