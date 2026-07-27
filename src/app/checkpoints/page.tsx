'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { SectionHeader } from '@/components/shared/section-header';
import { ActiveInspectionBanner } from '@/components/checkpoints/active-inspection-banner';
import { CheckpointFilters } from '@/components/checkpoints/checkpoint-filters';
import { CheckpointGrid } from '@/components/checkpoints/checkpoint-grid';
import { PageTransition } from '@/components/shared/page-transition';
import { useAppMode } from '@/hooks/use-app-mode';
import { useProjectStore } from '@/stores/project-store';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { useActiveInspectionStore } from '@/stores/active-inspection-store';
import { cn } from '@/lib/utils';

function CheckpointsPageInner() {
  const { isApp } = useAppMode();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const fetchCheckpoints = useCheckpointStore((s) => s.fetchCheckpoints);
  const checkpointCount = useCheckpointStore((s) => s.checkpoints.length);
  const searchParams = useSearchParams();
  const activeInspectionId = useActiveInspectionStore((s) => s.inspectionId);
  const clearActive = useActiveInspectionStore((s) => s.clear);

  // Refetch whenever the active project changes (or on mount). The store
  // is shared across pages, so without this the grid would happily
  // render whichever project's BMPs were last loaded — which is exactly
  // what was happening after the new-project wizard created a site.
  useEffect(() => {
    if (currentProjectId) fetchCheckpoints();
  }, [currentProjectId, fetchCheckpoints]);

  // If the URL points to a different inspection than the store
  // remembers (e.g. the QSP shared a link, or jumped between tabs),
  // bail to a clean state rather than show a misleading banner.
  useEffect(() => {
    const urlInspectionId = searchParams.get('inspectionId');
    if (urlInspectionId && activeInspectionId && urlInspectionId !== activeInspectionId) {
      clearActive();
    }
  }, [searchParams, activeInspectionId, clearActive]);

  return (
    <PageTransition>
      <div className={cn('flex flex-col gap-6 p-6', isApp && 'gap-3 p-3')}>
        <SectionHeader
          title="Checkpoint Inspector"
          description={
            checkpointCount > 0
              ? `AI-powered BMP monitoring across ${checkpointCount} control point${checkpointCount === 1 ? '' : 's'}`
              : 'AI-powered BMP monitoring'
          }
        />
        <ActiveInspectionBanner />
        <CheckpointFilters />
        <CheckpointGrid />
      </div>
    </PageTransition>
  );
}

export default function CheckpointsPage() {
  return (
    <Suspense fallback={null}>
      <CheckpointsPageInner />
    </Suspense>
  );
}
