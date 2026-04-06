import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

// A component that throws an error on render
const ThrowingComponent = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test render error');
  }
  return <div>Child content</div>;
};

describe('ErrorBoundary', () => {
  // Suppress console.error noise from React error boundary logging
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Safe content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('displays default fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test render error')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('displays custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom error view</div>}>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom error view')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('resets error state when "Try Again" is clicked', () => {
    let shouldThrow = true;
    const ToggleComponent = () => {
      if (shouldThrow) {
        throw new Error('Temporary error');
      }
      return <div>Recovered content</div>;
    };

    render(
      <ErrorBoundary>
        <ToggleComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Fix the component before clicking Try Again
    shouldThrow = false;
    fireEvent.click(screen.getByText('Try Again'));

    expect(screen.getByText('Recovered content')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('calls onReset callback when reset is triggered', () => {
    const onReset = vi.fn();
    render(
      <ErrorBoundary onReset={onReset}>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText('Try Again'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('logs errors to console via componentDidCatch', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    // React and the ErrorBoundary both log to console.error
    expect(consoleErrorSpy).toHaveBeenCalled();
    // Check our specific log call
    const ourCall = consoleErrorSpy.mock.calls.find(
      (call) => call[0] === 'Uncaught error:'
    );
    expect(ourCall).toBeDefined();

    consoleErrorSpy.mockRestore();
  });

  it('shows default message when error has no message', () => {
    const NoMessageError = () => {
      throw new Error('');
    };

    render(
      <ErrorBoundary>
        <NoMessageError />
      </ErrorBoundary>
    );

    expect(screen.getByText('An unexpected error occurred while rendering this component.')).toBeInTheDocument();
  });
});
