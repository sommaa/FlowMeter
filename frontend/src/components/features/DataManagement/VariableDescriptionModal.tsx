/**
 * Variable Description Modal for maintaining a data dictionary.
 *
 * This modal provides an independent interface for managing column descriptions
 * without requiring users to enter the full AI Wizard workflow. It serves as a
 * standalone "Data Dictionary" tool where users can document their variables for:
 * - Team collaboration and knowledge sharing
 * - Onboarding new analysts
 * - Maintaining institutional memory
 * - Preparing data for AI visualization suggestions
 *
 * The modal reuses the ColumnDescriptionEditor component but hides the "Analysis Goals"
 * section (showGuidance=false), focusing solely on variable-level documentation.
 *
 * Features:
 * - Reuses ColumnDescriptionEditor for consistency
 * - Hides analysis goals textarea (guidance disabled)
 * - Direct integration with global columnDescriptions state
 * - Real-time save to Zustand store
 * - Progress tracking for completion
 * - Simple "Done" button to close
 *
 * This modal is triggered from the sidebar or TopBar, distinct from the AI Wizard,
 * allowing users to maintain variable descriptions as a standalone task.
 *
 * @module components/features/DataManagement/VariableDescriptionModal
 */

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/common';
import { BookText, Check } from 'lucide-react';
import { useStore } from '@/store';
import { ColumnDescriptionEditor } from '../AI/ColumnDescriptionEditor';

/**
 * Props for the VariableDescriptionModal component.
 *
 * @interface Props
 * @property {boolean} isOpen - Whether the modal is currently open
 * @property {() => void} onClose - Callback when modal is closed
 */
interface Props {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Variable Description Modal component.
 *
 * Renders a simplified data dictionary editor using ColumnDescriptionEditor:
 *
 * **Header**:
 * - BookText icon (primary color)
 * - Title: "Data Dictionary"
 * - Description: "Define your data variables to maintain a clear record of your columns."
 * - Positions modal as a documentation/reference tool
 *
 * **Content Area**:
 * - ColumnDescriptionEditor component:
 *   - Shows progress bar (filled/total columns)
 *   - Lists all columns with description inputs
 *   - Data type badges (datetime, numeric, text)
 *   - Completion indicators (checkmarks)
 *   - **Does NOT show**: Analysis goals textarea (showGuidance=false)
 *
 * - Scrollable area (min-height: 300px)
 * - Overflow handling for large datasets
 * - Vertical padding for visual breathing room
 *
 * **Footer**:
 * - Single "Done" button (primary variant)
 * - Check icon for affirmative action
 * - Border-top separator
 * - Right-aligned (flex justify-end)
 *
 * **State Management**:
 * - **Zustand Store**:
 *   - `columnDescriptions`: Record<string, string> (column name → description)
 *   - `setColumnDescriptions(descriptions)`: Updates global state
 * - All changes persist immediately (controlled inputs)
 * - No local state needed (editor handles internally)
 *
 * **Integration with AI Wizard**:
 * - Shares same columnDescriptions state
 * - Descriptions populated from here appear in AI Wizard step 1
 * - Allows pre-filling before AI generation
 * - Reduces friction in AI workflow
 *
 * **Difference from AI Wizard Step 1**:
 * - **AI Wizard**: Shows analysis goals textarea + variable descriptions
 * - **This Modal**: Shows ONLY variable descriptions (no goals)
 * - **Purpose**: Standalone documentation vs. AI preparation
 *
 * **Use Cases**:
 * - Documenting data dictionary for team reference
 * - Updating descriptions as data schema evolves
 * - Maintaining metadata without AI generation intent
 * - Quick edits without full wizard flow
 *
 * **Guidance Comment**:
 * The component includes an internal comment noting that analysis goals are
 * separate from variable management per user request. This reinforces the
 * separation of concerns: variable docs (this modal) vs. AI intent (wizard).
 *
 * **Responsive Behavior**:
 * - Max width: 2xl (672px)
 * - Max height: 90vh (prevents overflow on small screens)
 * - Scrolls internally if content exceeds height
 * - Flex column layout for proper footer pinning
 *
 * @param {Props} props - Component props
 * @returns {JSX.Element} Variable description editor modal
 *
 * @example
 * ```tsx
 * <VariableDescriptionModal
 *   isOpen={showDataDictionary}
 *   onClose={() => setShowDataDictionary(false)}
 * />
 * ```
 */
export const VariableDescriptionModal: React.FC<Props> = ({
    isOpen,
    onClose
}) => {
    const columnDescriptions = useStore(state => state.columnDescriptions);
    const setColumnDescriptions = useStore(state => state.setColumnDescriptions);

    // GUIDANCE: Analysis goals are now separate from variable management
    // as per user request. This modal focuses solely on column descriptions.

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BookText className="w-5 h-5 text-primary" />
                        Data Dictionary
                    </DialogTitle>
                    <DialogDescription>
                        Define your data variables to maintain a clear record of your columns.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 min-h-[300px] overflow-y-auto py-4">
                    <ColumnDescriptionEditor
                        columnDescriptions={columnDescriptions}
                        onDescriptionsChange={setColumnDescriptions}
                        showGuidance={false}
                    />
                </div>

                <div className="flex justify-end pt-4 border-t">
                    <Button variant="primary" onClick={onClose}>
                        <Check className="w-4 h-4 mr-1" />
                        Done
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
