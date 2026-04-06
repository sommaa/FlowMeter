import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/common';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

/**
 * Props for the ConfirmationModal component.
 */
interface ConfirmationModalProps {
    /** Whether the modal is open */
    isOpen: boolean;
    /** Callback when modal is closed (Cancel button or ESC) */
    onClose: () => void;
    /** Callback when user confirms the action */
    onConfirm: () => void;
    /** Modal title text */
    title: string;
    /** Modal description/message text */
    message: string;
    /** Label for confirm button (default: "Confirm") */
    confirmLabel?: string;
    /** Label for cancel button (default: "Cancel") */
    cancelLabel?: string;
    /** Visual style variant (default: "primary") */
    variant?: 'danger' | 'warning' | 'primary';
}

/**
 * Reusable confirmation dialog for destructive or important actions.
 *
 * Displays a modal dialog with customizable title, message, and action buttons.
 * Supports different visual variants to indicate action severity:
 * - `danger`: Red styling for destructive actions (delete, remove)
 * - `warning`: Yellow styling for caution (irreversible changes)
 * - `primary`: Default blue styling for normal confirmations
 *
 * The modal shows an alert icon for danger variant and automatically closes
 * after confirmation callback executes.
 *
 * @example
 * ```tsx
 * <ConfirmationModal
 *   isOpen={showDeleteConfirm}
 *   onClose={() => setShowDeleteConfirm(false)}
 *   onConfirm={() => deleteVisualization(vizId)}
 *   title="Delete Visualization"
 *   message="Are you sure? This action cannot be undone."
 *   confirmLabel="Delete"
 *   variant="danger"
 * />
 * ```
 */
export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'primary',
}) => {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {variant === 'danger' && <AlertTriangle className="w-5 h-5 text-destructive" />}
                        {title}
                    </DialogTitle>
                    <DialogDescription>
                        {message}
                    </DialogDescription>
                </DialogHeader>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={onClose}>
                        {cancelLabel}
                    </Button>
                    <Button variant={variant} onClick={() => {
                        onConfirm();
                        onClose();
                    }}>
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
