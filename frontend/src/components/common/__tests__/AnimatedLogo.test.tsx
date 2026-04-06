import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AnimatedLogo } from '@/components/common/AnimatedLogo';

describe('AnimatedLogo', () => {
  it('renders a wrapper div with an SVG element', () => {
    const { container } = render(<AnimatedLogo />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('uses the default size of 64', () => {
    const { container } = render(<AnimatedLogo />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '64');
    expect(svg).toHaveAttribute('height', '64');
  });

  it('uses a custom size', () => {
    const { container } = render(<AnimatedLogo size={128} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '128');
    expect(svg).toHaveAttribute('height', '128');
  });

  it('applies custom className to the wrapper div', () => {
    const { container } = render(<AnimatedLogo className="mx-auto" />);
    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass('mx-auto');
  });

  it('contains animation keyframes in a style element', () => {
    const { container } = render(<AnimatedLogo />);
    const style = container.querySelector('style');
    expect(style).toBeInTheDocument();
    expect(style?.textContent).toContain('logoFloat');
    expect(style?.textContent).toContain('logoSporadicSpin');
  });

  it('renders 4 wave path elements', () => {
    const { container } = render(<AnimatedLogo />);
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(4);
  });

  it('defines a shimmer gradient', () => {
    const { container } = render(<AnimatedLogo />);
    const gradient = container.querySelector('#accentShimmer');
    expect(gradient).toBeInTheDocument();
  });

  it('renders an ambient glow element', () => {
    const { container } = render(<AnimatedLogo />);
    // The glow element is a div with pointer-events-none class
    const glow = container.querySelector('.pointer-events-none');
    expect(glow).toBeInTheDocument();
  });

  it('has animation style on the wrapper div', () => {
    const { container } = render(<AnimatedLogo />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.animation).toContain('logoFloat');
    expect(wrapper.style.animation).toContain('logoSporadicSpin');
  });

  it('has the correct viewBox on the SVG', () => {
    const { container } = render(<AnimatedLogo />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 337 337');
  });
});
