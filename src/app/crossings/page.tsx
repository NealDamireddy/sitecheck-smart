'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { CrossingsPanel } from '@/components/crossings/crossings-panel';
import { useProjectStore } from '@/stores/project-store';
import { useCrossingsStore } from '@/stores/crossings-store';
import { PageTransition } from '@/components/shared/page-transition';
import {
  CROSSING_STATUS_LABELS,
  CROSSING_STATUS_COLORS,
} from '@/types/crossing';
import type { Crossing, CrossingStatus } from '@/types/crossing';

const EMPTY_CROSSINGS: Crossing[] = [];

const SiteOverviewMap = dynamic(
  () =>
    import('@/components/dashboard/site-overview-map').then((m) => ({
      default: m.SiteOverviewMap,
    })),
  {
    ssr: false,
    loading: () => <div className="h-80 animate-pulse rounded-lg bg-muted" />,
  }
);

export default function CrossingsPage() {
  const router = useRouter();
  const project = useProjectStore((s) => s.currentProject());
  const projectId = useProjectStore((s) => s.currentProjectId);
  // Select raw value (stable ref) and default outside the selector — see error #185.
  const crossingsForProject = useCrossingsStore((s) => s.crossingsByProject[projectId]);
  const crossings = crossingsForProject ?? EMPTY_CROSSINGS;
  const fetchCrossings = useCrossingsStore((s) => s.fetchCrossings);

  useEffect(() => {
    if (project && project.projectType !== 'linear') {
      router.replace('/dashboard');
    }
  }, [project, router]);

  useEffect(() => {
    if (project?.projectType === 'linear' && projectId) {
      fetchCrossings(projectId);
    }
  }, [project?.projectType, projectId, fetchCrossings]);

  if (!project || project.projectType !== 'linear') {
    return null;
  }

  // Status summary
  const statusCounts: Record<CrossingStatus, number> = {
    pending: 0,
    approved: 0,
    'in-progress': 0,
    completed: 0,
    flagged: 0,
  };
  for (const c of crossings) statusCounts[c.status]++;

  return (
    <PageTransition>
      <div className="space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Crossings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Stream, road, utility, and railroad crossings along the {project.name} corridor.
          </p>
        </div>

        {/* Status summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(Object.keys(statusCounts) as CrossingStatus[]).map((s) => {
            const colors = CROSSING_STATUS_COLORS[s];
            return (
              <div
                key={s}
                className={`rounded-lg border ${colors.border} ${colors.bg} p-3`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {CROSSING_STATUS_LABELS[s]}
                </p>
                <p className={`mt-1 text-2xl font-bold ${colors.text}`}>
                  {statusCounts[s]}
                </p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <SiteOverviewMap />
          </div>
          <div>
            <CrossingsPanel />
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
