/**
 * FlowMeter - Main Application Component
 *
 * Root application component that orchestrates the entire UI layout and manages
 * top-level application state and behaviors.
 */
import React, { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';
import { Sidebar, ExportSettingsModal, ExportDownloadModal, ExportDataModal, FloatingControls, TopBar } from '@/components/layout';
import { DashboardGrid } from '@/components/features/Dashboard/DashboardGrid';
import { Alert } from '@/components/common';
import { TemplateManager } from '@/components/features/Templates/TemplateManager';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { StorylineModal } from '@/components/features/Storyline/StorylineModal';
import { useThemeEffect } from '@/hooks';

/**
 * Main application component with layout and global state management.
 *
 * Provides the primary application structure with:
 *
 * **Layout:**
 * - Fixed top bar (64px height) with actions and controls
 * - Collapsible left sidebar (68px collapsed, 280px expanded)
 * - Main scrollable content area for visualization grid
 * - Floating controls overlay
 *
 * **Features:**
 * - Theme application via useThemeEffect hook
 * - Onboarding wizard for first-time users (shown when hasOnboarded is false)
 * - Global error alerts
 * - Export modals (settings and download)
 * - Template manager modal
 * - Storyline modal
 * - Auto-scroll to new visualizations when added
 * - Auto-complete onboarding when first visualization is created
 *
 * **State Management:**
 * Uses Zustand store for all global state including visualizations,
 * theme, error messages, modal visibility, and onboarding status.
 *
 * **Layout Constants:**
 * - Collapsed sidebar width: 68px
 * - Expanded sidebar width: 280px
 * - Top bar height: 64px
 *
 * @example
 * ```tsx
 * // Rendered in main.tsx
 * <App />
 * ```
 */
const App: React.FC = () => {
  const theme = useStore((state) => state.theme);
  const isDarkMode = useStore((state) => state.isDarkMode);
  // Sidebar toggle state is removed from UI but might exist in store. We ignore it here.
  const visualizations = useStore((state) => state.visualizations);
  const error = useStore((state) => state.error);
  const setError = useStore((state) => state.setError);
  const isExportConfigOpen = useStore((state) => state.isExportConfigOpen);
  const setExportConfigOpen = useStore((state) => state.setExportConfigOpen);
  const isExportDownloadOpen = useStore((state) => state.isExportDownloadOpen);
  const setExportDownloadOpen = useStore((state) => state.setExportDownloadOpen);
  const isDataExportModalOpen = useStore((state) => state.isDataExportModalOpen);
  const setDataExportModalOpen = useStore((state) => state.setDataExportModalOpen);
  const hasOnboarded = useStore((state) => state.hasOnboarded);
  const setHasOnboarded = useStore((state) => state.setHasOnboarded);
  const addVisualization = useStore((state) => state.addVisualization);

  // Ref for the main scrollable area
  const mainRef = useRef<HTMLElement>(null);

  // Handler to add visualization and scroll to bottom
  const handleAddVisualization = () => {
    addVisualization();
    // Scroll to bottom after a small delay to allow the new visualization to render
    setTimeout(() => {
      if (mainRef.current) {
        mainRef.current.scrollTo({
          top: mainRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 100);
  };

  // Auto-onboard ONLY when a visualization is created.
  React.useEffect(() => {
    if (visualizations.length > 0 && !hasOnboarded) {
      setHasOnboarded(true);
    }
  }, [visualizations.length, hasOnboarded, setHasOnboarded]);

  // Theme effect
  useThemeEffect(theme, isDarkMode);

  // Sidebar state and constants
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const COLLAPSED_WIDTH = 68;
  const EXPANDED_WIDTH = 280;
  const TOPBAR_HEIGHT = 56;
  const sidebarWidth = sidebarExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH;

  return (
    <div className={cn('h-screen w-screen bg-background transition-colors duration-200 overflow-hidden')}>

      {/* FIXED TOPBAR - Full width at top */}
      <TopBar
        onAddVisualization={handleAddVisualization}
        sidebarWidth={sidebarWidth}
        isSidebarExpanded={sidebarExpanded}
        onToggleSidebar={() => setSidebarExpanded(!sidebarExpanded)}
      />

      {/* FIXED SIDEBAR - Left edge, below topbar */}
      <aside
        className={cn(
          'fixed left-0 z-20 transition-all duration-200 ease-out overflow-visible',
          'bg-card border-r border-border'
        )}
        style={{
          width: sidebarWidth,
          top: TOPBAR_HEIGHT,
          height: `calc(100vh - ${TOPBAR_HEIGHT}px)`
        }}
      >
        <Sidebar isExpanded={sidebarExpanded} />
      </aside>

      {/* MAIN CONTENT AREA - Offset by sidebar and topbar */}
      <main
        ref={mainRef}
        className="h-screen overflow-y-auto scroll-smooth transition-all duration-200 ease-out"
        style={{
          marginLeft: sidebarWidth,
          paddingTop: TOPBAR_HEIGHT + 16,
          paddingLeft: 16,
          paddingRight: 16,
          paddingBottom: 16
        }}
      >
        {/* Error Alert */}
        {error && (
          <div className="mb-6 mx-auto max-w-2xl animate-in fade-in slide-in-from-top-4">
            <Alert type="error" message={error} onClose={() => {
              setError(null);
            }} />
          </div>
        )}

        <DashboardGrid />
      </main>

      {/* Floating Controls (Columns) - Bottom Right */}
      <FloatingControls />

      {/* Global Modals */}
      <StorylineModal />
      <TemplateManager />
      <ExportSettingsModal
        isOpen={isExportConfigOpen}
        onClose={() => setExportConfigOpen(false)}
      />
      <ExportDownloadModal
        isOpen={isExportDownloadOpen}
        onClose={() => setExportDownloadOpen(false)}
      />
      <ExportDataModal
        isOpen={isDataExportModalOpen}
        onClose={() => setDataExportModalOpen(false)}
      />

      {/* Onboarding Wizard */}
      {!hasOnboarded && visualizations.length === 0 && (
        <div className="fixed inset-0 z-[var(--z-overlay)] bg-background">
          <OnboardingWizard />
        </div>
      )}
    </div>
  );
};

export default App;
