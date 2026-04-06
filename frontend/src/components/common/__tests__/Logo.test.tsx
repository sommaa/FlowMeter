import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// Mock the store before importing the component
vi.mock('@/store', () => ({
  useStore: vi.fn((selector) => {
    // Provide a mock state with isDarkMode = false by default
    const state = { isDarkMode: false };
    return selector(state);
  }),
}));

import { Logo } from '@/components/common/Logo';
import { useStore } from '@/store';

describe('Logo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an SVG element', () => {
    const { container } = render(<Logo />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('uses the default size of 64', () => {
    const { container } = render(<Logo />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '64');
    expect(svg).toHaveAttribute('height', '64');
  });

  it('uses a custom size', () => {
    const { container } = render(<Logo size={128} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '128');
    expect(svg).toHaveAttribute('height', '128');
  });

  it('applies custom className', () => {
    const { container } = render(<Logo className="my-logo" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('my-logo');
  });

  it('has the correct viewBox', () => {
    const { container } = render(<Logo />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 337 337');
  });

  it('renders 4 wave path elements', () => {
    const { container } = render(<Logo />);
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(4);
  });

  it('uses dark fill color (#1f1f1f) in light mode', () => {
    const { container } = render(<Logo />);
    const paths = container.querySelectorAll('path');
    // In light mode (isDarkMode = false), fill should be #1f1f1f
    expect(paths[0]).toHaveStyle({ fill: '#1f1f1f' });
  });

  it('uses light fill color (#e0e0e0) in dark mode', () => {
    vi.mocked(useStore).mockImplementation((selector: any) => {
      const state = { isDarkMode: true };
      return selector(state);
    });

    const { container } = render(<Logo />);
    const paths = container.querySelectorAll('path');
    expect(paths[0]).toHaveStyle({ fill: '#e0e0e0' });
  });
});
