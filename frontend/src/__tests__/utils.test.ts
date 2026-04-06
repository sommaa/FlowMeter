import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('merges simple class names', () => {
    expect(cn('px-2', 'py-1', 'bg-primary')).toBe('px-2 py-1 bg-primary');
  });

  it('resolves Tailwind conflicts by keeping the last value', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('handles conditional classes with falsy values', () => {
    expect(cn('base', false && 'hidden')).toBe('base');
    expect(cn('base', null, undefined, 0, '')).toBe('base');
  });

  it('includes conditional classes when truthy', () => {
    const isActive = true;
    expect(cn('base', isActive && 'active')).toBe('base active');
  });

  it('handles object syntax for conditional classes', () => {
    expect(cn({ 'bg-red-500': true, 'text-white': true, 'hidden': false })).toBe('bg-red-500 text-white');
  });

  it('handles array inputs', () => {
    expect(cn(['px-2', 'py-1'])).toBe('px-2 py-1');
  });

  it('resolves conflicting text color classes', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('');
  });

  it('resolves conflicting margin/padding classes', () => {
    expect(cn('m-2', 'm-4')).toBe('m-4');
    expect(cn('mt-2', 'mt-4')).toBe('mt-4');
  });

  it('handles mixed argument types', () => {
    const result = cn('base', { conditional: true }, ['array-class'], undefined);
    expect(result).toBe('base conditional array-class');
  });
});
