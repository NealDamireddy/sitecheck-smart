'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { RotateCcw, ArrowRight } from 'lucide-react';
import { SectionHeader } from '@/components/shared/section-header';
import { ConfidenceIndicator } from '@/components/swppp/confidence-indicator';
import { CheckpointListPanel } from '@/components/swppp/checkpoint-list-panel';
import { UploadZone } from '@/components/swppp/upload-zone';
import { GenerateMissionButton } from '@/components/swppp/generate-mission-button';
import { DocumentPageSelector } from '@/components/swppp/document-page-selector';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSwpppStore } from '@/stores/swppp-store';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { PageTransition } from '@/components/shared/page-transition';
import { useAppMode } from '@/hooks/use-app-mode';
import { cn } from '@/lib/utils';

const PdfViewerPanel = dynamic(
  () => import('@/components/swppp/pdf-viewer-panel').then((m) => ({ default: m.PdfViewerPanel })),
  {
    ssr: false,
    loading: () => <div className="h-full animate-pulse rounded-lg bg-muted" />,
  }
);

const CheckpointMapPanel = dynamic(
  () => import('@/components/swppp/checkpoint-map-panel').then((m) => ({ default: m.CheckpointMapPanel })),
  {
    ssr: false,
    loading: () => <div className="h-full animate-pulse rounded-lg bg-muted" />,
  }
);

/**
 * sessionStorage key for handing extracted siteInfo to /projects/new.
 * Must match the constant in app/projects/new/page.tsx.
 */
const SWPPP_PREFILL_KEY = 'sitecheck-swppp-prefill';

export default function SwpppPage() {
  const { isApp } = useAppMode();
  const router = useRouter();

  const {
    processingStep,
    extractedCheckpoints,
    error,
    reset,
    selectedPages,
    setSelectedPages,
    siteInfo,
  } = useSwpppStore();

  const handleCreateSite = useCallback(() => {
    if (!siteInfo) return;
    try {
      sessionStorage.setItem(SWPPP_PREFILL_KEY, JSON.stringify(siteInfo));
    } catch {
      // sessionStorage unavailable — wizard will just start blank.
    }
    router.push('/projects/new?source=swppp');
  }, [siteInfo, router]);

  const checkpoints = useCheckpointStore((s) => s.checkpoints);
  const fetchCheckpoints = useCheckpointStore((s) => s.fetchCheckpoints);

  useEffect(() => {
    if (checkpoints.length === 0) fetchCheckpoints();
  }, [checkpoints.length, fetchCheckpoints]);

  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);

  const isIdle = processingStep === 'idle';
  const isProcessing = ['uploading', 'extracting', 'cross-referencing', 'generating-mission'].includes(processingStep);
  const isComplete = processingStep === 'complete';
  const isError = processingStep === 'error';

  const handleSelectCheckpoint = useCallback((id: string) => {
    setSelectedCheckpointId(id);
    // Navigate PDF to the SWPPP page for this checkpoint (only for static checkpoints)
    const cp = checkpoints.find((c) => c.id === id);
    if (cp) {
      setActivePage(cp.swpppPage);
    }
  }, [checkpoints]);

  return (
    <PageTransition>
      <div className={cn('flex h-full flex-col gap-4 p-4', isApp && 'gap-3 p-3')}>
        <SectionHeader
          title="SWPPP Intelligence"
          description="Upload your SWPPP document for AI-powered BMP extraction and drone flight path generation"
          action={
            !isIdle ? (
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" />
                Upload New
              </Button>
            ) : undefined
          }
        />

        {/* Phase 1: Upload zone */}
        {isIdle && <UploadZone />}

        {/* Phase 2: Processing indicator */}
        {(isProcessing || isComplete || isError) && (
          <ConfidenceIndicator
            processingStep={processingStep}
            checkpointCount={extractedCheckpoints.length}
            error={error}
          />
        )}

        {/* Phase 3: Results panels */}
        {isComplete && (
          <>
            {/* Site-creation CTA: chains the SWPPP upload into the New Site
                wizard, pre-filling basic info from the extracted siteInfo. */}
            {siteInfo && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 sm:p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-amber-200">
                      Create a site from this SWPPP
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Auto-fills project name, address, acreage, and risk
                      level. You&apos;ll add monitoring locations on the next
                      screen.
                    </p>
                  </div>
                  <Button onClick={handleCreateSite} className="sm:ml-3">
                    Create Site
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Selective page filter + Mission generation */}
            <DocumentPageSelector
              selectedPages={selectedPages}
              onSelectionChange={setSelectedPages}
            />
            <GenerateMissionButton />

            {/* Three-panel layout (web) / Tabbed layout (app) */}
            {isApp ? (
              <Tabs defaultValue="checkpoints" className="flex-1">
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="pdf" className="text-xs">PDF</TabsTrigger>
                  <TabsTrigger value="checkpoints" className="text-xs">Checkpoints</TabsTrigger>
                  <TabsTrigger value="map" className="text-xs">Map</TabsTrigger>
                </TabsList>
                <TabsContent value="pdf" className="mt-2">
                  <div className="h-[350px] overflow-hidden rounded-lg border border-border">
                    <PdfViewerPanel
                      activePage={activePage}
                      onPageChange={setActivePage}
                      selectedCheckpointId={selectedCheckpointId}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="checkpoints" className="mt-2">
                  <div className="h-[350px] overflow-auto rounded-lg border border-border">
                    <CheckpointListPanel
                      selectedCheckpointId={selectedCheckpointId}
                      onSelect={handleSelectCheckpoint}
                      extractedCheckpoints={extractedCheckpoints}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="map" className="mt-2">
                  <div className="h-[350px] overflow-hidden rounded-lg border border-border">
                    <CheckpointMapPanel
                      selectedCheckpointId={selectedCheckpointId}
                      onSelect={handleSelectCheckpoint}
                      extractedCheckpoints={
                        extractedCheckpoints.length > 0
                          ? extractedCheckpoints.map((cp) => ({
                              id: cp.id,
                              lat: cp.lat,
                              lng: cp.lng,
                              name: cp.name,
                              bmpType: cp.bmpType,
                            }))
                          : undefined
                      }
                    />
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="grid flex-1 grid-cols-1 gap-px overflow-hidden rounded-lg border border-white/5 bg-white/5 md:grid-cols-2 lg:grid-cols-[1fr_300px_280px]">
                {/* Left: PDF Viewer */}
                <div className="min-h-[300px] overflow-hidden md:col-span-2 lg:col-span-1">
                  <PdfViewerPanel
                    activePage={activePage}
                    onPageChange={setActivePage}
                    selectedCheckpointId={selectedCheckpointId}
                  />
                </div>

                {/* Middle: Checkpoint List */}
                <div className="overflow-hidden border-t border-white/5 md:border-t-0 md:border-l">
                  <CheckpointListPanel
                    selectedCheckpointId={selectedCheckpointId}
                    onSelect={handleSelectCheckpoint}
                    extractedCheckpoints={extractedCheckpoints}
                  />
                </div>

                {/* Right: Map */}
                <div className="overflow-hidden border-t border-white/5 md:border-t-0 md:border-l">
                  <CheckpointMapPanel
                    selectedCheckpointId={selectedCheckpointId}
                    onSelect={handleSelectCheckpoint}
                    extractedCheckpoints={
                      extractedCheckpoints.length > 0
                        ? extractedCheckpoints.map((cp) => ({
                            id: cp.id,
                            lat: cp.lat,
                            lng: cp.lng,
                            name: cp.name,
                            bmpType: cp.bmpType,
                          }))
                        : undefined
                    }
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* Error state: allow retry */}
        {isError && (
          <div className="flex justify-center pt-4">
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              Try Again
            </Button>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
