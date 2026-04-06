/**
 * Export Settings Modal for configuring HTML report branding and metadata.
 *
 * This modal allows users to customize the appearance and authorship information
 * of exported HTML reports. Settings are persisted in Zustand store and applied
 * to all subsequent exports, enabling consistent branding across reports.
 *
 * Configuration Options:
 * - Author name and job title
 * - Location/facility name
 * - Primary and secondary brand colors
 * - Company logo (base64-encoded image)
 *
 * Features:
 * - Debounced text inputs (300ms) to prevent excessive re-renders
 * - Visual color pickers with hex code display
 * - Drag-and-drop logo upload area with preview
 * - File reader converts images to base64 for storage
 * - Persistent storage in Zustand global state
 * - Applied to HTML export template rendering
 *
 * The modal is typically accessed from the Settings menu or export workflow,
 * allowing users to configure branding before generating reports.
 *
 * @module components/layout/ExportSettingsModal
 */

import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button, DebouncedInput, CustomColorPicker } from '@/components/common';
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useStore } from '@/store';

/**
 * Props for the ExportSettingsModal component.
 *
 * @interface ExportSettingsModalProps
 * @property {boolean} isOpen - Whether the modal is currently open
 * @property {() => void} onClose - Callback when modal is closed
 */
interface ExportSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Export Settings Modal component.
 *
 * Renders a configuration form for HTML export branding:
 *
 * **Header**:
 * - Title: "Export Configuration"
 * - Description: "Configure the settings for your generated reports."
 *
 * **Author Details Section**:
 * - Two-column grid layout
 * - **Author Name** (left):
 *   - DebouncedInput (300ms delay)
 *   - Updates exportConfig.authorName
 *   - Example: "John Smith"
 * - **Job Title** (right):
 *   - DebouncedInput (300ms delay)
 *   - Updates exportConfig.jobTitle
 *   - Example: "Process Engineer"
 * - **Location** (full-width):
 *   - DebouncedInput (300ms delay)
 *   - Updates exportConfig.location
 *   - Example: "Houston Refinery - Unit 5"
 *
 * **Branding Section**:
 * - Two-column grid layout
 * - **Primary Color** (left):
 *   - CustomColorPicker component
 *   - Size: 36x36 px (h-9 w-9)
 *   - Rounded with border and ring offset
 *   - Displays hex code next to picker
 *   - Example: "#3b82f6" (blue)
 * - **Secondary Color** (right):
 *   - Same as primary color picker
 *   - Used for accents in report
 *   - Example: "#6366f1" (indigo)
 * - Hex codes shown in monospace font (text-xs text-muted-foreground)
 *
 * **Logo Upload Section**:
 * - **Empty State**:
 *   - Dashed border box (border-2 border-dashed)
 *   - Upload icon (w-8 h-8, opacity-50)
 *   - Text: "Click to upload logo (PNG/JPG)"
 *   - Background: hover:bg-muted/50
 * - **Loaded State**:
 *   - Preview image (h-10, object-contain)
 *   - Green checkmark text: "Logo selected"
 * - **File Input**:
 *   - Hidden input (className="hidden")
 *   - Triggered by clicking upload area
 *   - Accept: image/* (all image types)
 *   - Ref: fileInputRef for programmatic click
 *
 * **Logo Upload Flow**:
 * 1. User clicks upload area → fileInputRef.current?.click()
 * 2. File dialog opens
 * 3. User selects image file
 * 4. handleLogoUpload triggered
 * 5. FileReader reads file as data URL
 * 6. reader.onloadend → setExportConfig({ logoBase64: ... })
 * 7. Base64 string stored in Zustand
 * 8. Preview updates immediately
 *
 * **Footer**:
 * - Single "Done" button (primary variant)
 * - Closes modal on click
 * - No explicit save needed (auto-saves via Zustand)
 *
 * **State Management**:
 * - **Zustand Store**:
 *   - `exportConfig`: Object containing all settings
 *     - authorName: string
 *     - jobTitle: string
 *     - location: string
 *     - primaryColor: string (hex)
 *     - secondaryColor: string (hex)
 *     - logoBase64: string (data URL)
 *   - `setExportConfig(partial)`: Merges partial config updates
 * - No local state (all controlled by store)
 *
 * **Debounced Inputs**:
 * - DebouncedInput component used for text fields
 * - 300ms delay prevents excessive store updates
 * - User can type freely without lag
 * - Final value committed after pause
 *
 * **Color Picker Integration**:
 * - CustomColorPicker provides native color input
 * - Updates immediately on change (no debounce needed)
 * - Visual preview updates in real-time
 * - Hex code displayed for reference/manual entry
 *
 * **File Handling**:
 * - FileReader API converts images to base64
 * - Base64 stored directly in config (no server upload)
 * - Allows offline report generation
 * - Image embedded in HTML export
 * - Supports all image formats (PNG, JPG, GIF, etc.)
 *
 * **Export Integration**:
 * - Settings applied to HTML template during export
 * - Logo inserted in report header
 * - Colors used for title bars, accents
 * - Author info appears in report footer
 * - Location shown in metadata section
 *
 * **Responsive Layout**:
 * - Max width: sm (640px)
 * - Grid layouts collapse on mobile
 * - Spacing: space-y-4 vertical rhythm
 * - Padding: py-2 section padding
 *
 * @param {ExportSettingsModalProps} props - Component props
 * @returns {JSX.Element} Export configuration modal
 *
 * @example
 * ```tsx
 * <ExportSettingsModal
 *   isOpen={showExportSettings}
 *   onClose={() => setShowExportSettings(false)}
 * />
 * ```
 */
export const ExportSettingsModal: React.FC<ExportSettingsModalProps> = ({ isOpen, onClose }) => {
    const exportConfig = useStore((state) => state.exportConfig);
    const setExportConfig = useStore((state) => state.setExportConfig);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setExportConfig({ logoBase64: reader.result as string });
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Export Configuration</DialogTitle>
                    <DialogDescription>
                        Configure the settings for your generated reports.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Author Details */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label htmlFor="author-name">Author Name</Label>
                            <DebouncedInput
                                id="author-name"
                                value={exportConfig.authorName}
                                onChange={(value) => setExportConfig({ authorName: value })}
                                debounceMs={300}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="job-title">Job Title</Label>
                            <DebouncedInput
                                id="job-title"
                                value={exportConfig.jobTitle}
                                onChange={(value) => setExportConfig({ jobTitle: value })}
                                debounceMs={300}
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label htmlFor="location">Location</Label>
                        <DebouncedInput
                            id="location"
                            value={exportConfig.location}
                            onChange={(value) => setExportConfig({ location: value })}
                            debounceMs={300}
                        />
                    </div>

                    {/* Branding */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label>Primary Color</Label>
                            <div className="flex items-center gap-2">
                                <CustomColorPicker
                                    value={exportConfig.primaryColor}
                                    onChange={(value) => setExportConfig({ primaryColor: value })}
                                    className="h-9 w-9 rounded border border-input ring-offset-background"
                                />
                                <span className="text-xs text-muted-foreground font-mono">{exportConfig.primaryColor}</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label>Secondary Color</Label>
                            <div className="flex items-center gap-2">
                                <CustomColorPicker
                                    value={exportConfig.secondaryColor}
                                    onChange={(value) => setExportConfig({ secondaryColor: value })}
                                    className="h-9 w-9 rounded border border-input ring-offset-background"
                                />
                                <span className="text-xs text-muted-foreground font-mono">{exportConfig.secondaryColor}</span>
                            </div>
                        </div>
                    </div>

                    {/* Logo Upload */}
                    <div className="space-y-1">
                        <Label>Company Logo</Label>
                        <div
                            className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {exportConfig.logoBase64 ? (
                                <div className="flex items-center justify-center gap-3">
                                    <img src={exportConfig.logoBase64} alt="Preview" className="h-10 object-contain" />
                                    <span className="text-sm text-green-600 dark:text-green-400">Logo selected</span>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                    <Upload className="w-8 h-8 opacity-50" />
                                    <span className="text-sm">Click to upload logo (PNG/JPG)</span>
                                </div>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleLogoUpload}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="primary" onClick={onClose}>
                        Done
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
