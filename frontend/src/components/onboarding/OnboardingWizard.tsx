
import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store';
import { Button } from '@/components/common';
import { AnimatedLogo } from '@/components/common/AnimatedLogo';
import { SettingsMenu } from '@/components/common/SettingsMenu';
import {
    Upload, FileUp, Plus, ArrowRight, LayoutDashboard,
    Settings2, Scale, Variable, ChevronDown, Check, Info, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { DataCleaningModal } from '@/components/features/DataCleaning/DataCleaningModal';
import { ReconciliationModal } from '@/components/features/Reconciliation/ReconciliationModal';
import { GlobalVariablesModal } from '@/components/features/GlobalVariables/GlobalVariablesModal';
import { AIWizardModal } from '@/components/features/AI';
import { CleaningConfig, VisualizationConfig } from '@/types';

/**
 * Multi-step onboarding wizard for first-time setup and data initialization.
 *
 * Guides users through the complete setup flow with an intuitive step-by-step interface:
 *
 * **Step 1: File Upload**
 * - Drag-and-drop or click-to-browse file upload
 * - Accepts Excel (.xlsx, .xls) and CSV files
 * - Shows loading state and error handling
 *
 * **Step 2: Data Preprocessing (Optional)**
 * - Configure data cleaning options
 * - Handle missing values, apply filters
 * - Visual completion indicator when configured
 *
 * **Step 3: Getting Started Choice**
 * - **Import Template**: Load saved visualization configuration
 * - **Start from Scratch**: Manual setup with optional reconciliation and global variables
 * - **AI-Assisted** (NEW): AI suggests visualizations based on data description
 *
 * **Step 4: Advanced Configuration (if "Start from Scratch")**
 * - Data Reconciliation: Balance material flows with constraint equations
 * - Global Variables: Create computed variables for all visualizations
 *
 * Features:
 * - Smooth scroll-into-view behavior between steps
 * - Auto-scroll to next step after completing actions
 * - Visual completion indicators (green checkmarks) for optional steps
 * - Settings menu accessible in top-right corner
 * - Animated logo and themed styling
 * - Responsive layout with fade-in animations
 *
 * The wizard uses Zustand store for state management and sets the `hasOnboarded`
 * flag when complete to prevent showing the wizard again on subsequent visits.
 *
 * @example
 * ```tsx
 * // Displayed when hasOnboarded is false
 * {!hasOnboarded && <OnboardingWizard />}
 * ```
 */
export const OnboardingWizard: React.FC = () => {
    const uploadFile = useStore((state) => state.uploadFile);
    const currentDataset = useStore((state) => state.currentDataset);
    const toggleTemplateManager = useStore((state) => state.toggleTemplateManager);
    const addVisualization = useStore((state) => state.addVisualization);
    const setHasOnboarded = useStore((state) => state.setHasOnboarded);

    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // Track if user chose "Start from Scratch" to show additional steps
    const [showAdvancedSteps, setShowAdvancedSteps] = useState(false);

    // Modal states
    const [preprocessingOpen, setPreprocessingOpen] = useState(false);
    const [reconciliationOpen, setReconciliationOpen] = useState(false);
    const [globalVarsOpen, setGlobalVarsOpen] = useState(false);
    const [aiWizardOpen, setAiWizardOpen] = useState(false);

    // Track completed optional steps for visual feedback
    const [stepsCompleted, setStepsCompleted] = useState({
        preprocessing: false,
        reconciliation: false,
        globalVars: false
    });

    // Refs for scroll-into-view behavior
    const step2Ref = useRef<HTMLDivElement>(null);
    const step3Ref = useRef<HTMLDivElement>(null);
    const advancedRef = useRef<HTMLDivElement>(null);

    // Scroll to preprocessing step when dataset is loaded
    useEffect(() => {
        if (currentDataset && step2Ref.current) {
            const timer = setTimeout(() => {
                step2Ref.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [currentDataset]);

    // Scroll to advanced steps when user chooses "Start from Scratch"
    useEffect(() => {
        if (showAdvancedSteps && advancedRef.current) {
            const timer = setTimeout(() => {
                advancedRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [showAdvancedSteps]);

    // Step 1: File Upload
    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setSelectedFile(file);
        setIsUploading(true);
        setError(null);

        try {
            await uploadFile(file);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to upload file');
        } finally {
            setIsUploading(false);
        }
    };

    const handlePreprocessingUpload = async (config: CleaningConfig) => {
        // Re-upload the file with the cleaning configuration to apply preprocessing
        if (selectedFile) {
            setIsUploading(true);
            setError(null);
            try {
                await uploadFile(selectedFile, config);
            } catch (err: any) {
                console.error(err);
                setError(err.message || 'Failed to apply preprocessing');
            } finally {
                setIsUploading(false);
            }
        }

        setStepsCompleted(prev => ({ ...prev, preprocessing: true }));
        setPreprocessingOpen(false);

        // Auto-scroll to the next step
        setTimeout(() => {
            scrollToChoice();
        }, 300);
    };

    const scrollToChoice = () => {
        step3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const handleStartFromScratch = () => {
        setShowAdvancedSteps(true);
    };

    const handleFinish = () => {
        setHasOnboarded(true);
        addVisualization();
    };

    // Handle AI wizard completion
    const handleAIComplete = (configs: VisualizationConfig[]) => {
        setHasOnboarded(true);
        // Add all AI-generated visualizations
        configs.forEach(config => {
            addVisualization(config);
        });
    };

    return (
        <div className="h-full overflow-y-auto scroll-smooth relative">
            {/* Settings Button - Top Right Corner */}
            <div className="fixed top-4 right-4 z-50">
                <SettingsMenu />
            </div>

            {/* Step 1: Upload Data */}
            <div className={cn(
                "flex flex-col items-center justify-center min-h-screen p-6 transition-all duration-700",
                currentDataset ? "opacity-30 scale-95" : "animate-in fade-in duration-500"
            )}>
                <div className="mb-8 flex items-center justify-center">
                    <AnimatedLogo size={120} />
                </div>

                <h1 className="text-3xl font-semibold text-foreground mb-3 font-sans text-center tracking-tight">
                    Welcome to FlowMeter
                </h1>

                <p className="text-base text-muted-foreground mb-10 text-center max-w-md leading-relaxed">
                    Your process monitoring dashboard. <br />
                    Get started by uploading your dataset.
                </p>

                <div className="w-full max-w-md">
                    <div className="relative group cursor-pointer">
                        <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleFileUpload}
                            disabled={isUploading || !!currentDataset}
                            className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <div className={cn(
                            "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center transition-all duration-200 bg-card",
                            error ? "border-destructive/50 bg-destructive/5" : "border-border hover:border-primary hover:bg-muted/30 group-hover:border-primary group-hover:bg-muted/30",
                            (isUploading || currentDataset) && "opacity-50 pointer-events-none"
                        )}>
                            <div className={cn(
                                "p-4 rounded-full mb-4 transition-colors",
                                error ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary group-hover:bg-primary/20"
                            )}>
                                {isUploading ? (
                                    <Upload className="w-8 h-8 animate-pulse" />
                                ) : (
                                    <FileUp className="w-8 h-8" />
                                )}
                            </div>

                            <h3 className="text-lg font-semibold text-foreground mb-2">
                                {isUploading ? 'Uploading...' : currentDataset ? 'Dataset Loaded!' : 'Upload Data File'}
                            </h3>

                            <p className="text-sm text-muted-foreground text-center">
                                {error ? (
                                    <span className="text-destructive font-medium">{error}</span>
                                ) : (
                                    "Drag & drop or click to browse (Excel, CSV)"
                                )}
                            </p>
                        </div>
                    </div>

                    {/* Info tooltip for file format */}
                    <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-border/50">
                        <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="text-xs text-muted-foreground leading-relaxed">
                            <span className="font-medium text-foreground/80">Expected format:</span> Excel or CSV with variables as columns.
                            First row should contain column headers (variable names).
                            Optional: include a "Date" or "Timestamp" column for time-series data.
                        </div>
                    </div>
                </div>
            </div>

            {/* Step 2: Data Preprocessing (Optional, before choice) */}
            {currentDataset && !showAdvancedSteps && (
                <div
                    ref={step2Ref}
                    className="flex flex-col items-center justify-center min-h-screen py-16 px-6 animate-in fade-in slide-in-from-bottom-8 duration-700"
                >
                    <div className="flex items-center gap-3 mb-8 text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-4 py-2 rounded-full border border-green-300 dark:border-green-700">
                        <div className="w-2 h-2 rounded-full bg-green-600 dark:bg-green-400 animate-pulse" />
                        <span className="font-medium text-sm">Dataset Loaded Successfully</span>
                    </div>

                    <h2 className="text-2xl font-bold text-foreground mb-2 font-sans text-center">
                        Data Preprocessing
                    </h2>
                    <p className="text-muted-foreground mb-8 text-center max-w-lg">
                        Configure data cleaning options before proceeding. This step is optional.
                    </p>

                    {/* Preprocessing Card */}
                    <Card
                        className={cn(
                            "relative p-6 w-full max-w-sm transition-all cursor-pointer group flex flex-col items-center text-center border-border hover:shadow-lg mb-8",
                            stepsCompleted.preprocessing && "ring-2 ring-green-500 border-green-500"
                        )}
                        onClick={() => setPreprocessingOpen(true)}
                    >
                        {stepsCompleted.preprocessing && (
                            <div className="absolute top-3 right-3 bg-green-500 text-white rounded-full p-1">
                                <Check className="w-4 h-4" />
                            </div>
                        )}
                        <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 mb-3 group-hover:scale-110 transition-transform">
                            <Settings2 className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-semibold mb-1">Configure Preprocessing</h3>
                        <p className="text-sm text-muted-foreground mb-3">
                            Clean data, handle missing values, apply filters
                        </p>
                        <span className="text-xs text-muted-foreground/70 italic">Click to configure (optional)</span>
                    </Card>

                    {/* Continue Button */}
                    <Button
                        variant="outline"
                        onClick={scrollToChoice}
                        className="group"
                    >
                        Continue
                        <ChevronDown className="w-4 h-4 ml-2 group-hover:translate-y-0.5 transition-transform" />
                    </Button>
                </div>
            )}

            {/* Step 3: Template or Scratch Choice */}
            {currentDataset && !showAdvancedSteps && (
                <div
                    ref={step3Ref}
                    className="flex flex-col items-center justify-center min-h-screen p-6"
                >
                    <h2 className="text-3xl font-bold text-foreground mb-4 font-sans text-center">
                        How would you like to start?
                    </h2>

                    <p className="text-muted-foreground mb-12 text-center max-w-md">
                        Load a template, start manually, or let AI suggest visualizations for you.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
                        {/* Option A: Import Template */}
                        <Card
                            className="relative p-6 hover:shadow-lg hover:border-primary/50 transition-all cursor-pointer group flex flex-col items-center text-center border-border"
                            onClick={() => toggleTemplateManager()}
                        >
                            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                                <LayoutDashboard className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-semibold mb-2">Import Template</h3>
                            <p className="text-sm text-muted-foreground mb-6 flex-1">
                                Load a saved configuration with your visualizations.
                            </p>
                            <Button variant="outline" className="w-full group-hover:border-blue-300 dark:group-hover:border-blue-700 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 group-hover:text-blue-700 dark:group-hover:text-blue-300">
                                Browse Templates <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </Card>

                        {/* Option B: Start from Scratch */}
                        <Card
                            className="relative p-6 hover:shadow-lg hover:border-primary/50 transition-all cursor-pointer group flex flex-col items-center text-center border-border"
                            onClick={handleStartFromScratch}
                        >
                            <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 mb-4 group-hover:scale-110 transition-transform">
                                <Plus className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-semibold mb-2">Start from Scratch</h3>
                            <p className="text-sm text-muted-foreground mb-6 flex-1">
                                Configure reconciliation, variables, then create visualizations.
                            </p>
                            <Button variant="outline" className="w-full group-hover:border-purple-300 dark:group-hover:border-purple-700 group-hover:bg-purple-50 dark:group-hover:bg-purple-900/30 group-hover:text-purple-700 dark:group-hover:text-purple-300">
                                Continue <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </Card>

                        {/* Option C: AI-Assisted */}
                        <Card
                            className="relative p-6 hover:shadow-lg hover:border-primary/50 transition-all cursor-pointer group flex flex-col items-center text-center border-border"
                            onClick={() => setAiWizardOpen(true)}
                        >
                            <div className="p-3 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/40 text-amber-600 dark:text-amber-400 mb-4 group-hover:scale-110 transition-transform">
                                <Sparkles className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-semibold mb-2">AI-Assisted</h3>
                            <p className="text-sm text-muted-foreground mb-6 flex-1">
                                Describe your data and let AI suggest the best visualizations.
                            </p>
                            <Button variant="outline" className="w-full group-hover:border-amber-300 dark:group-hover:border-amber-700 group-hover:bg-amber-50 dark:group-hover:bg-amber-900/30 group-hover:text-amber-700 dark:group-hover:text-amber-300">
                                Get Started <Sparkles className="w-4 h-4 ml-2" />
                            </Button>
                        </Card>
                    </div>
                </div>
            )}

            {/* Step 4: Advanced Configuration (After "Start from Scratch") */}
            {showAdvancedSteps && (
                <div
                    ref={advancedRef}
                    className="flex flex-col items-center py-16 px-6 animate-in fade-in slide-in-from-bottom-8 duration-700"
                >
                    <h2 className="text-2xl font-bold text-foreground mb-2 font-sans text-center">
                        Additional Configuration
                    </h2>
                    <p className="text-muted-foreground mb-8 text-center max-w-lg">
                        Configure data reconciliation and global variables. These steps are optional.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl mb-8">
                        {/* Data Reconciliation */}
                        <Card
                            className={cn(
                                "relative p-5 transition-all cursor-pointer group flex flex-col items-center text-center border-border hover:shadow-lg",
                                stepsCompleted.reconciliation && "ring-2 ring-green-500 border-green-500"
                            )}
                            onClick={() => setReconciliationOpen(true)}
                        >
                            {stepsCompleted.reconciliation && (
                                <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                                    <Check className="w-3 h-3" />
                                </div>
                            )}
                            <div className="p-3 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 mb-3 group-hover:scale-110 transition-transform">
                                <Scale className="w-6 h-6" />
                            </div>
                            <h3 className="text-base font-semibold mb-1">Data Reconciliation</h3>
                            <p className="text-xs text-muted-foreground mb-3 flex-1">
                                Balance material flows using constraint equations
                            </p>
                            <span className="text-xs text-muted-foreground/70 italic">Optional</span>
                        </Card>

                        {/* Global Variables */}
                        <Card
                            className={cn(
                                "relative p-5 transition-all cursor-pointer group flex flex-col items-center text-center border-border hover:shadow-lg",
                                stepsCompleted.globalVars && "ring-2 ring-green-500 border-green-500"
                            )}
                            onClick={() => setGlobalVarsOpen(true)}
                        >
                            {stepsCompleted.globalVars && (
                                <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                                    <Check className="w-3 h-3" />
                                </div>
                            )}
                            <div className="p-3 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 mb-3 group-hover:scale-110 transition-transform">
                                <Variable className="w-6 h-6" />
                            </div>
                            <h3 className="text-base font-semibold mb-1">Global Variables</h3>
                            <p className="text-xs text-muted-foreground mb-3 flex-1">
                                Create computed variables for use across all visualizations
                            </p>
                            <span className="text-xs text-muted-foreground/70 italic">Optional</span>
                        </Card>
                    </div>

                    {/* Finish Button */}
                    <Button
                        variant="primary"
                        onClick={handleFinish}
                        className="group"
                    >
                        Create First Visualization
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
                    </Button>
                </div>
            )}

            {/* Modals */}
            <DataCleaningModal
                isOpen={preprocessingOpen}
                onClose={() => setPreprocessingOpen(false)}
                onUpload={handlePreprocessingUpload}
                fileName={selectedFile?.name || currentDataset?.name || ''}
                columnNames={currentDataset?.column_names || []}
            />
            <ReconciliationModal
                isOpen={reconciliationOpen}
                onClose={() => {
                    setReconciliationOpen(false);
                    setStepsCompleted(prev => ({ ...prev, reconciliation: true }));
                }}
            />
            <GlobalVariablesModal
                isOpen={globalVarsOpen}
                onClose={() => {
                    setGlobalVarsOpen(false);
                    setStepsCompleted(prev => ({ ...prev, globalVars: true }));
                }}
            />
            <AIWizardModal
                isOpen={aiWizardOpen}
                onClose={() => setAiWizardOpen(false)}
                onComplete={handleAIComplete}
            />
        </div>
    );
};
