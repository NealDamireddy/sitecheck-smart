'use client';

import { useEffect } from 'react';
import { SectionHeader } from '@/components/shared/section-header';
import { CheckpointFilters } from '@/components/checkpoints/checkpoint-filters';
import { CheckpointGrid } from '@/components/checkpoints/checkpoint-grid';
import { PageTransition } from '@/components/shared/page-transition';
import { useAppMode } from '@/hooks/use-app-mode';
import { useProjectStore } from '@/stores/project-store';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { cn } from '@/lib/utils';

export default function CheckpointsPage() {
  const { isApp } = useAppMode();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const fetchCheckpoints = useCheckpointStore((s) => s.fetchCheckpoints);

  // Refetch whenever the active project changes (or on mount). The store
  // is shared across pages, so without this the grid would happily
  // render whichever project's BMPs were last loaded — which is exactly
  // what was happening after the new-project wizard created a site.
  useEffect(() => {
    if (currentProjectId) fetchCheckpoints();
  }, [currentProjectId, fetchCheckpoints]);

  return (
    <PageTransition>
    <div className={cn('flex flex-col gap-6 p-6', isApp && 'gap-3 p-3')}>
      <SectionHeader
        title="Checkpoint Inspector"
        description="AI-powered BMP monitoring across 34 control points"
      />
      <CheckpointFilters />
      <CheckpointGrid />
    </div>
    </PageTransition>
  );
}
