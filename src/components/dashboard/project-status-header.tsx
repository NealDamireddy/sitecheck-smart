'use client';

import { useEffect } from 'react';
import { Shield, User, FileText, Cloud, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useProjectStore } from '@/stores/project-store';
import { usePermitsStore } from '@/stores/permits-store';
import type { SegmentPermit } from '@/types/permit';

const EMPTY_PERMITS: SegmentPermit[] = [];

export function ProjectStatusHeader({ compact }: { compact?: boolean }) {
  const project = useProjectStore((s) => s.currentProject());
  const projectId = useProjectStore((s) => s.currentProjectId);
  // Select raw value so the reference is stable across renders.
  const permitsForProject = usePermitsStore((s) => s.permitsByProject[projectId]);
  const permits = permitsForProject ?? EMPTY_PERMITS;
  const fetchPermits = usePermitsStore((s) => s.fetchPermits);

  useEffect(() => {
    if (project?.projectType === 'linear' && projectId) {
      fetchPermits(projectId);
    }
  }, [project?.projectType, projectId, fetchPermits]);

  const expiringPermits = permits.filter((p) => p.status === 'expiring' || p.status === 'expired');

  const riskLabel = `RL-${project?.riskLevel ?? 2}`;
  const qspDisplay = compact
    ? (project?.qsp?.name?.split(' ').map((n, i) => i === 0 ? n.charAt(0) + '.' : n).join(' ') ?? 'N/A')
    : `${project?.qsp?.name ?? 'N/A'}, QSP #${project?.qsp?.licenseNumber?.replace('QSP-', '') ?? ''}`;
  const permitNumber = project?.permitNumber ?? 'N/A';
  const isActive = project?.status === 'active';

  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-2 py-1.5">
          <Shield className="h-3 w-3 text-amber-500" />
          <span className="text-[10px] text-muted-foreground">Risk</span>
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500 text-[10px] font-mono px-1.5 py-0">{riskLabel}</Badge>
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-2 py-1.5">
          <User className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">QSP</span>
          <span className="text-[10px] text-foreground truncate">{qspDisplay}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-2 py-1.5">
          <FileText className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-mono text-foreground">{permitNumber}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-2 py-1.5">
          <Cloud className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] text-foreground">72°F</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6 rounded-lg border border-border bg-surface-elevated px-5 py-3">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-amber-500" />
        <span className="text-xs text-muted-foreground">Risk Level</span>
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs font-mono">
          {riskLabel}
        </Badge>
      </div>
      <div className="h-6 w-px bg-border" />
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">QSP</span>
        <span className="text-xs text-foreground">{qspDisplay}</span>
      </div>
      <div className="h-6 w-px bg-border" />
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">CGP Permit</span>
        <span className="text-xs font-mono text-foreground">{permitNumber}</span>
        <Badge variant="outline" className={isActive ? 'border-green-500/30 bg-green-500/10 text-green-500 text-xs' : 'border-muted-foreground/30 bg-muted-foreground/10 text-muted-foreground text-xs'}>
          {isActive ? 'Active' : 'Inactive'}
        </Badge>
      </div>
      <div className="h-6 w-px bg-border" />
      <div className="flex items-center gap-2">
        <Cloud className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Weather</span>
        <span className="text-xs text-foreground">Partly Cloudy, 72°F</span>
      </div>
      {expiringPermits.length > 0 && (
        <>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/15 text-amber-300 text-xs"
            >
              {expiringPermits.length} permit{expiringPermits.length !== 1 ? 's' : ''} expiring
            </Badge>
          </div>
        </>
      )}
    </div>
  );
}
