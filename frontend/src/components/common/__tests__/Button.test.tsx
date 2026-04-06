import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/common/Button';

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByRole('button', { name: 'Click Me' })).toBeInTheDocument();
  });

  it('calls onClick handler when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Click' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled();
  });

  it('is disabled when loading is true', () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole('button', { name: /Loading/ })).toBeDisabled();
  });

  it('shows a loading spinner when loading is true', () => {
    const { container } = render(<Button loading>Saving</Button>);
    // Loader2 renders an SVG with the animate-spin class
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('does not show the loading spinner when loading is false', () => {
    const { container } = render(<Button loading={false}>Save</Button>);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).not.toBeInTheDocument();
  });

  it('renders an icon when icon prop is provided and not loading', () => {
    const icon = <span data-testid="test-icon">icon</span>;
    render(<Button icon={icon}>With Icon</Button>);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('does not render the icon when loading is true', () => {
    const icon = <span data-testid="test-icon">icon</span>;
    render(<Button icon={icon} loading>Loading</Button>);
    expect(screen.queryByTestId('test-icon')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Button className="my-custom-class">Styled</Button>);
    expect(screen.getByRole('button', { name: 'Styled' })).toHaveClass('my-custom-class');
  });

  it('forwards ref to the underlying button element', () => {
    const ref = vi.fn();
    render(<Button ref={ref}>Ref Button</Button>);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLButtonElement);
  });

  it('passes additional HTML button attributes through', () => {
    render(<Button type="submit" aria-label="Submit form">Submit</Button>);
    const button = screen.getByRole('button', { name: 'Submit form' });
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('does not call onClick when disabled', () => {
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>No Click</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'No Click' }));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('does not call onClick when loading', () => {
    const handleClick = vi.fn();
    render(<Button loading onClick={handleClick}>No Click</Button>);
    fireEvent.click(screen.getByRole('button', { name: /No Click/ }));
    expect(handleClick).not.toHaveBeenCalled();
  });
});
