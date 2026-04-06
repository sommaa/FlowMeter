import { useState, useEffect } from 'react';

/**
 * Debounces a rapidly changing value by delaying updates.
 *
 * Returns a debounced version of the input value that only updates after
 * the specified delay has elapsed since the last change. Useful for:
 * - Search inputs (wait for user to stop typing before API call)
 * - Form validation (delay validation until user pauses)
 * - Window resize handlers (reduce re-render frequency)
 * - Any rapidly changing value that triggers expensive operations
 *
 * The hook automatically cleans up pending timeouts on value changes and
 * component unmount to prevent memory leaks and stale updates.
 *
 * @template T - Type of the value being debounced
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds before updating debounced value
 * @returns The debounced value (updates after delay since last change)
 *
 * @example
 * ```tsx
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearch = useDebounce(searchTerm, 500);
 *
 * useEffect(() => {
 *   if (debouncedSearch) {
 *     fetchSearchResults(debouncedSearch);
 *   }
 * }, [debouncedSearch]);
 *
 * return <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />;
 * ```
 */
export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => clearTimeout(handler);
    }, [value, delay]);

    return debouncedValue;
}
