'use client';

import { SectionHeader } from '@/components/shared/section-header';
import { CheckpointFilters } from '@/components/checkpoints/checkpoint-filters';
import { CheckpointGrid } from '@/components/checkpoints/checkpoint-grid';
import { PageTransition } from '@/components/shared/page-transition';
import { useAppMode } from '@/hooks/use-app-mode';
import { cn } from '@/lib/utils';

export default function CheckpointsPage() {
  const { isApp } = useAppMode();

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
