import React, { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/common';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

/**
 * Props for the CommentEditorModal component.
 */
interface CommentEditorModalProps {
    /** Whether the modal is open */
    isOpen: boolean;
    /** Callback when modal is closed */
    onClose: () => void;
    /** Initial comment text to populate the editor */
    initialComments: string;
    /** Callback when comments are saved with updated text */
    onApply: (comments: string) => void;
}

/**
 * Modal dialog for editing visualization or workspace comments.
 *
 * Provides a large textarea for adding detailed notes and observations
 * that will be included in exported reports. The editor supports:
 * - Multi-line text input with spell-check enabled
 * - Large fixed-height textarea (320px) optimized for longer content
 * - Cancel action to discard changes
 * - Save action to apply changes and close
 *
 * The component maintains local state that syncs with initialComments
 * when the modal opens, preventing external updates from interrupting
 * the user while typing.
 *
 * @example
 * ```tsx
 * <CommentEditorModal
 *   isOpen={isEditing}
 *   onClose={() => setIsEditing(false)}
 *   initialComments={visualization.comments}
 *   onApply={(text) => updateVisualization({ comments: text })}
 * />
 * ```
 */
export const CommentEditorModal: React.FC<CommentEditorModalProps> = ({
    isOpen,
    onClose,
    initialComments,
    onApply,
}) => {
    const [localComments, setLocalComments] = useState(initialComments);

    useEffect(() => {
        if (isOpen) {
            setLocalComments(initialComments);
        }
    }, [isOpen, initialComments]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-muted-foreground" />
                        Comments
                    </DialogTitle>
                    <DialogDescription>
                        Add detailed notes and observations for the report
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    <Textarea
                        value={localComments}
                        onChange={(e) => setLocalComments(e.target.value)}
                        placeholder="Enter your detailed comments here..."
                        className="h-80 resize-none font-sans"
                        spellCheck={true}
                    />
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={() => {
                            onApply(localComments);
                            onClose();
                        }}
                    >
                        Save Comments
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
