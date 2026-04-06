
import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

/**
 * Props for the ErrorBoundary component.
 */
interface Props {
    /** Child components to render and protect */
    children: ReactNode;
    /** Optional custom fallback UI to show on error */
    fallback?: ReactNode;
    /** Optional callback invoked when user clicks reset */
    onReset?: () => void;
}

/**
 * Internal state for the ErrorBoundary component.
 */
interface State {
    /** Whether an error has been caught */
    hasError: boolean;
    /** The caught error object, if any */
    error: Error | null;
}

/**
 * React Error Boundary component for graceful error handling.
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs them to console, and displays a fallback UI instead of crashing
 * the entire application.
 *
 * Features:
 * - Displays error message with red-themed alert UI
 * - Provides "Try Again" button to reset error state
 * - Supports custom fallback UI via `fallback` prop
 * - Logs errors with componentDidCatch for debugging
 * - Optional onReset callback for cleanup/retry logic
 *
 * Note: Error boundaries only catch errors in:
 * - Render methods
 * - Lifecycle methods
 * - Constructors of the tree below them
 *
 * They do NOT catch errors in:
 * - Event handlers (use try-catch)
 * - Asynchronous code (setTimeout, promises)
 * - Server-side rendering
 * - Errors thrown in the error boundary itself
 *
 * @example
 * ```tsx
 * <ErrorBoundary onReset={() => window.location.reload()}>
 *   <VisualizationCard config={vizConfig} />
 * </ErrorBoundary>
 * ```
 *
 * @example
 * ```tsx
 * <ErrorBoundary fallback={<CustomErrorView />}>
 *   <ComplexDashboard />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    /**
     * Static lifecycle method invoked when an error is thrown in a descendant.
     *
     * Updates state to display the fallback UI on the next render.
     *
     * @param error - The error that was thrown
     * @returns New state with hasError flag and error object
     */
    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    /**
     * Lifecycle method invoked after an error has been thrown by a descendant.
     *
     * Logs the error and its component stack to the console for debugging.
     *
     * @param error - The error that was thrown
     * @param errorInfo - Object containing componentStack property with stack trace
     */
    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    /**
     * Resets the error boundary state to allow re-rendering of children.
     *
     * Clears the error state and invokes the optional onReset callback
     * for cleanup or state management operations.
     */
    public reset = () => {
        this.setState({ hasError: false, error: null });
        this.props.onReset?.();
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex flex-col items-center justify-center p-6 text-center h-full min-h-[200px] bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-900/50">
                    <div className="p-3 bg-red-100 dark:bg-red-900/40 rounded-full mb-4 text-red-600 dark:text-red-400">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">
                        Something went wrong
                    </h3>
                    <p className="text-sm text-red-600 dark:text-red-400 mb-4 max-w-sm">
                        {this.state.error?.message || 'An unexpected error occurred while rendering this component.'}
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={this.reset}
                        className="border-red-200 hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300"
                        icon={<RefreshCw className="w-3 h-3" />}
                    >
                        Try Again
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}
