/**
 * Sidebar component providing primary navigation and action buttons.
 *
 * This fixed-position sidebar serves as the main control panel for the application,
 * offering quick access to core features: data upload, comments, global variables,
 * AI suggestions, reconciliation, export, and visualization management.
 *
 * The sidebar adapts between two modes:
 * - **Collapsed**: Icon-only buttons (40px) with tooltips
 * - **Expanded**: Icon + label buttons with full-width layout
 *
 * Features:
 * - Responsive width based on isExpanded prop
 * - Icon-only mode with SimpleTooltip on hover
 * - Active state highlighting for dataset and features with content
 * - Disabled states when no dataset loaded
 * - Modal launchers for all major features
 * - Confirmation dialogs for destructive actions
 * - Dedication popover with heart icon (bottom-pinned)
 *
 * Button Variants:
 * - Success: Dataset loaded (green)
 * - Primary: Feature active (has content)
 * - Secondary: Feature available but empty
 * - Danger: Destructive action (clear visualizations)
 *
 * @module components/layout/Sidebar
 */

import React, { useState } from 'react';
import {
  Database,
  Download,
  FileSpreadsheet,
  Trash2,
  Scale,
  Calculator,
  Heart,
  Sparkles,
  MessageSquare,
  X,
} from 'lucide-react';
import { useStore } from '@/store';
import {
  Button,
  SimpleTooltip,
} from '@/components/common';
import { FileUpload } from '@/components/features/DataManagement/FileUpload';
import { CommentEditorModal } from '@/components/common/CommentEditorModal';
import { ReconciliationModal } from '@/components/features/Reconciliation/ReconciliationModal';
import { ConfirmationModal } from '@/components/common/ConfirmationModal';
import { GlobalVariablesModal } from '@/components/features/GlobalVariables/GlobalVariablesModal';
import { AIWizardModal } from '@/components/features/AI';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Props for the Sidebar component.
 *
 * @interface SidebarProps
 * @property {boolean} [isExpanded=false] - Whether sidebar shows full labels or icons only
 */
interface SidebarProps {
  isExpanded?: boolean;
}



/**
 * Sidebar component.
 *
 * Renders a vertical navigation sidebar with action buttons and modals:
 *
 * **Container**:
 * - Full height flex column
 * - Padding: py-3 px-3
 * - Overflow-visible (allows tooltips to escape)
 * - Flex-1 scrollable section + pinned footer
 *
 * **Sidebar Section Helper** (internal component):
 * - Props: icon, label, onClick, active, disabled, variant, danger
 * - Collapsed mode: 40x40px circular button + SimpleTooltip
 * - Expanded mode: Full-width button (h-9) with icon + label
 * - Active state: ring-2 ring-primary/50 ring-offset-1
 * - Danger state: Hover red background and text
 * - Disabled: Grayed out, no interaction
 *
 * **Action Buttons**:
 *
 * 1. **Data Section** (special handling):
 *    - **No Dataset**: "Upload Data" button (secondary)
 *    - **Dataset Loaded**:
 *      - Success variant with ring highlight
 *      - Shows dataset name (truncated)
 *      - X button overlay (right-positioned) to clear dataset
 *      - Expanded: Button with embedded X
 *      - Collapsed: Circular button with tooltip
 *
 * 2. **Comments** (MessageSquare icon):
 *    - Primary variant if comments exist
 *    - Label changes: "Comments" vs "Add Comments"
 *    - Opens CommentEditorModal
 *
 * 3. **Global Variables** (Calculator icon):
 *    - Shows count in label if variables exist: "Variables (3)"
 *    - Primary variant if count > 0
 *    - Disabled if no dataset
 *    - Opens GlobalVariablesModal
 *
 * 4. **AI Suggestions** (Sparkles icon):
 *    - Secondary variant (always)
 *    - Disabled if no dataset
 *    - Opens AIWizardModal
 *
 * 5. **Reconcile Data** (Scale icon):
 *    - Secondary variant (always)
 *    - Disabled if no dataset
 *    - Opens ReconciliationModal
 *
 * 6. **Export Report** (Download icon):
 *    - Secondary variant (always)
 *    - Disabled if no dataset
 *    - Opens export download modal (via setExportDownloadOpen)
 *
 * 7. **Clear All** (Trash2 icon):
 *    - Danger variant (red hover)
 *    - Shows count if visualizations exist: "Clear All (5)"
 *    - Disabled if no visualizations
 *    - Opens ConfirmationModal before clearing
 *
 * **Dedication Popover** (bottom-pinned):
 * - Heart icon (muted, pink on hover)
 * - Popover content:
 *   - "Dedication" header
 *   - Heartfelt message to collaborators
 *   - Pink heart icon at bottom
 * - Positioned with border-top separator
 * - Shrink-0 prevents flex compression
 *
 * **Modals**:
 * - **CommentEditorModal**: Markdown editor for dashboard comments
 * - **ReconciliationModal**: Data reconciliation configuration
 * - **ConfirmationModal**: "Clear All Visualizations" confirmation
 * - **GlobalVariablesModal**: Computed column management
 * - **AIWizardModal**: AI-powered visualization suggestions
 * - **Upload Dialog**: Wraps FileUpload component
 *   - Shows data upload dropzone or dataset summary
 *   - Title: "Data Management"
 *
 * **State Management**:
 * - **Zustand Store**:
 *   - `comments`: Dashboard comments markdown
 *   - `currentDataset`: Loaded dataset or null
 *   - `visualizations`: Array of visualization configs
 *   - `globalVariables`: Array of computed columns
 *   - `setExportDownloadOpen`: Opens export modal
 *   - `clearDataset()`: Removes dataset
 *   - `clearVisualizations()`: Removes all charts
 *   - `addVisualization(config)`: Adds chart from AI
 *
 * - **Local State**:
 *   - `commentsModalOpen`: CommentEditor visibility
 *   - `reconciliationModalOpen`: Reconciliation modal visibility
 *   - `clearConfirmationOpen`: Confirmation modal visibility
 *   - `globalVarsModalOpen`: Global variables modal visibility
 *   - `uploadModalOpen`: Upload dialog visibility
 *   - `aiWizardOpen`: AI wizard visibility
 *
 * **Adaptive Layout**:
 * - Collapsed: `items-center` (center-aligned icons)
 * - Expanded: `items-stretch` (full-width buttons)
 * - Tooltip side: "right" (appears to right of sidebar)
 * - Button size transitions smoothly (transition-all duration-200)
 *
 * **Scroll Behavior**:
 * - Main section: overflow-y-auto (scrollable action list)
 * - Overflow-x-visible: Allows tooltips to escape horizontal bounds
 * - Footer: Pinned to bottom (shrink-0, border-top)
 *
 * **AI Wizard Integration**:
 * - onComplete callback receives array of VisualizationConfigs
 * - Each config added to dashboard via addVisualization()
 * - Allows batch addition from AI suggestions
 *
 * @param {SidebarProps} props - Component props
 * @returns {JSX.Element} Sidebar with action buttons and modals
 *
 * @example
 * ```tsx
 * <Sidebar isExpanded={sidebarExpanded} />
 * ```
 */
export const Sidebar: React.FC<SidebarProps> = ({ isExpanded = false }) => {

  const comments = useStore((state) => state.comments);
  const setComments = useStore((state) => state.setComments);
  const currentDataset = useStore((state) => state.currentDataset);
  const clearDataset = useStore((state) => state.clearDataset);
  const visualizations = useStore((state) => state.visualizations);
  const addVisualization = useStore((state) => state.addVisualization);
  const clearVisualizations = useStore((state) => state.clearVisualizations);
  const setExportDownloadOpen = useStore((state) => state.setExportDownloadOpen);
  const setDataExportModalOpen = useStore((state) => state.setDataExportModalOpen);
  const globalVariables = useStore((state) => state.globalVariables);

  const [commentsModalOpen, setCommentsModalOpen] = useState(false);
  const [reconciliationModalOpen, setReconciliationModalOpen] = useState(false);
  const [clearConfirmationOpen, setClearConfirmationOpen] = useState(false);
  const [globalVarsModalOpen, setGlobalVarsModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [aiWizardOpen, setAiWizardOpen] = useState(false);

  // Sidebar section with icon and label
  interface SidebarSectionProps {
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'success' | 'danger';
    danger?: boolean;
  }

  const SidebarSection: React.FC<SidebarSectionProps> = ({
    icon: Icon,
    label,
    onClick,
    active = false,
    disabled = false,
    variant: _variant = 'secondary',
    danger = false,
  }) => {
    const buttonContent = (
      <Button
        variant="ghost"
        disabled={disabled}
        onClick={onClick}
        className={`
          ${isExpanded
            ? 'w-full h-9 px-3 justify-start gap-2.5 rounded-lg'
            : 'w-9 h-9 rounded-lg p-0 justify-center'
          }
          flex items-center transition-colors duration-150 text-sm font-medium
          ${active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}
          ${danger ? 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400' : ''}
          active:scale-[0.98]
        `}
      >
        <Icon className="w-[18px] h-[18px] shrink-0" />
        {isExpanded && (
          <span className="truncate">{label}</span>
        )}
      </Button>
    );

    if (!isExpanded) {
      return (
        <SimpleTooltip content={label} side="right">
          {buttonContent}
        </SimpleTooltip>
      );
    }

    return buttonContent;
  };

  return (
    <div className="w-full h-full flex flex-col py-2 px-2 overflow-visible">

      {/* Sidebar Sections */}
      <div className={`flex-1 flex flex-col gap-1 py-1 overflow-y-auto overflow-x-visible ${isExpanded ? 'items-stretch' : 'items-center'}`}>

        {/* Data Section - Special handling with X button */}
        {currentDataset ? (
          isExpanded ? (
            <div className="relative">
              <Button
                variant="ghost"
                onClick={() => setUploadModalOpen(true)}
                className="w-full h-9 px-3 pr-9 justify-start gap-2.5 rounded-lg flex items-center transition-colors duration-150 text-sm font-medium bg-accent text-foreground"
              >
                <Database className="w-[18px] h-[18px] shrink-0 text-primary" />
                <span className="truncate">{currentDataset.name}</span>
              </Button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearDataset();
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted transition-colors"
                title="Remove dataset"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          ) : (
            <SimpleTooltip content={currentDataset.name} side="right">
              <Button
                variant="ghost"
                onClick={() => setUploadModalOpen(true)}
                className="w-9 h-9 rounded-lg p-0 justify-center flex items-center bg-accent text-foreground"
              >
                <Database className="w-[18px] h-[18px] text-primary" />
              </Button>
            </SimpleTooltip>
          )
        ) : (
          <SidebarSection
            icon={Database}
            label="Upload Data"
            onClick={() => setUploadModalOpen(true)}
            variant="secondary"
          />
        )}

        {/* Comments Section */}
        <SidebarSection
          icon={MessageSquare}
          label={comments ? "Comments" : "Add Comments"}
          onClick={() => setCommentsModalOpen(true)}
          variant={comments ? 'primary' : 'secondary'}
        />

        {/* Global Variables Section */}
        <SidebarSection
          icon={Calculator}
          label={`Variables${globalVariables.length > 0 ? ` (${globalVariables.length})` : ''}`}
          onClick={() => setGlobalVarsModalOpen(true)}
          disabled={!currentDataset}
          variant={globalVariables.length > 0 ? 'primary' : 'secondary'}
        />

        {/* AI Suggestions */}
        <SidebarSection
          icon={Sparkles}
          label="AI Suggestions"
          onClick={() => setAiWizardOpen(true)}
          disabled={!currentDataset}
          variant="secondary"
        />

        {/* Reconciliation */}
        <SidebarSection
          icon={Scale}
          label="Reconcile Data"
          onClick={() => setReconciliationModalOpen(true)}
          disabled={!currentDataset}
          variant="secondary"
        />



        {/* Export Report */}
        <SidebarSection
          icon={Download}
          label="Export Report"
          onClick={() => setExportDownloadOpen(true)}
          disabled={!currentDataset}
          variant="secondary"
        />

        {/* Export Data */}
        <SidebarSection
          icon={FileSpreadsheet}
          label="Export Data"
          onClick={() => setDataExportModalOpen(true)}
          disabled={!currentDataset}
          variant="secondary"
        />

        {/* Clear Visualizations */}
        <SidebarSection
          icon={Trash2}
          label={`Clear All${visualizations.length > 0 ? ` (${visualizations.length})` : ''}`}
          onClick={() => {
            if (visualizations.length > 0) {
              setClearConfirmationOpen(true);
            }
          }}
          disabled={visualizations.length === 0}
          variant="danger"
          danger
        />

      </div>

      {/* Dedication (Pinned to Bottom) */}
      <div className="shrink-0 pt-2 flex justify-center">
        <Popover>
          <PopoverTrigger asChild>
            <div className="cursor-pointer group p-2 hover:bg-muted/50 rounded-full transition-colors">
              <Heart className="w-4 h-4 text-muted-foreground/30 group-hover:text-pink-400 transition-colors" />
            </div>
          </PopoverTrigger>
          <PopoverContent side="right" align="end" className="w-64 p-4 border-border/50 bg-card shadow-xl">
            <div className="space-y-2">
              <p className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Dedication
              </p>
              <p className="text-center text-xs text-muted-foreground/80 leading-relaxed">
                To all the good people I have worked with and will work with.
              </p>
              <p className="text-center text-xs text-muted-foreground/80 leading-relaxed mt-2">
                To every engineer and person who chooses to give more than expected — who strives to build something meaningful.
              </p>
              <p className="text-center text-[10px] text-muted-foreground/50 mt-3 italic">
                Thank you for making the journey worthwhile.
              </p>
              <div className="flex justify-center mt-2">
                <Heart className="w-3 h-3 text-pink-400/70 fill-pink-400/70" />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Modals */}
      <CommentEditorModal
        isOpen={commentsModalOpen}
        onClose={() => setCommentsModalOpen(false)}
        initialComments={comments}
        onApply={setComments}
      />

      <ReconciliationModal
        isOpen={reconciliationModalOpen}
        onClose={() => setReconciliationModalOpen(false)}
      />

      <ConfirmationModal
        isOpen={clearConfirmationOpen}
        onClose={() => setClearConfirmationOpen(false)}
        onConfirm={clearVisualizations}
        title="Clear All Visualizations"
        message="Are you sure you want to remove all visualizations? This action cannot be undone."
        variant="danger"
        confirmLabel="Clear All"
      />

      <GlobalVariablesModal
        isOpen={globalVarsModalOpen}
        onClose={() => setGlobalVarsModalOpen(false)}
      />

      <AIWizardModal
        isOpen={aiWizardOpen}
        onClose={() => setAiWizardOpen(false)}
        onComplete={(configs) => {
          configs.forEach(config => addVisualization(config));
        }}
      />

      {/* Upload Modal */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Data Management</DialogTitle>
            <DialogDescription>
              Upload and manage your dataset here.
            </DialogDescription>
          </DialogHeader>
          <FileUpload />
        </DialogContent>
      </Dialog>



    </div >
  );
};
