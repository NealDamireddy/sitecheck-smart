'use client';

import { useEffect } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { usePermitsStore } from '@/stores/permits-store';
import { PERMIT_STATUS_LABELS, PERMIT_STATUS_COLORS } from '@/types/permit';
import type { PermitStatus, SegmentPermit } from '@/types/permit';
import { formatDate } from '@/lib/format';

const EMPTY_PERMITS: SegmentPermit[] = [];

interface PermitStatusPanelProps {
  /** Optional project id override (defaults to current project) */
  projectId?: string;
}

export function PermitStatusPanel({ projectId: projectIdOverride }: PermitStatusPanelProps) {
  const project = useProjectStore((s) => s.currentProject());
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const projectId = projectIdOverride ?? currentProjectId;
  // Select raw value (stable ref) and default outside the selector — see error #185.
  const permitsForProject = usePermitsStore((s) => s.permitsByProject[projectId]);
  const permits = permitsForProject ?? EMPTY_PERMITS;
  const loading = usePermitsStore((s) => s.loading);
  const fetchPermits = usePermitsStore((s) => s.fetchPermits);

  useEffect(() => {
    if (project?.projectType === 'linear' && projectId) {
      fetchPermits(projectId);
    }
  }, [project?.projectType, projectId, fetchPermits]);

  if (project?.projectType !== 'linear') return null;

  // Sort: expiring/expired first, then by expiration date ascending
  const sorted = [...permits].sort((a, b) => {
    const order: Record<PermitStatus, number> = {
      expired: 0,
      expiring: 1,
      pending: 2,
      active: 3,
      revoked: 4,
    };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    if (!a.expirationDate && !b.expirationDate) return 0;
    if (!a.expirationDate) return 1;
    if (!b.expirationDate) return -1;
    return a.expirationDate.localeCompare(b.expirationDate);
  });

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-heading text-sm font-semibold tracking-wide">Permits</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {permits.length} permit{permits.length !== 1 ? 's' : ''} tracked
        </p>
      </div>

      <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
        {loading && (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading permits…</div>
        )}
        {!loading && permits.length === 0 && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No permits tracked for this project yet.
          </div>
        )}
        {sorted.map((permit) => {
          const colors = PERMIT_STATUS_COLORS[permit.status];
          return (
            <div key={permit.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{permit.permitType}</p>
                  {permit.permitNumber && (
                    <p className="font-mono text-[11px] text-muted-foreground truncate">
                      {permit.permitNumber}
                    </p>
                  )}
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none border ${colors.bg} ${colors.text} ${colors.border} shrink-0`}
                >
                  {PERMIT_STATUS_LABELS[permit.status]}
                </span>
              </div>
              {(permit.agency || permit.expirationDate) && (
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                  {permit.agency && <span className="truncate">{permit.agency}</span>}
                  {permit.expirationDate && (
                    <span className="font-mono shrink-0 ml-2">
                      Exp: {formatDate(permit.expirationDate)}
                    </span>
                  )}
                </div>
              )}
              {permit.notes && (
                <p className="mt-1.5 text-[11px] text-muted-foreground italic line-clamp-2">
                  {permit.notes}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
