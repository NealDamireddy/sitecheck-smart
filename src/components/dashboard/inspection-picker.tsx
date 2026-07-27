'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  CloudDrizzle,
  CloudRain,
  Droplets,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/stores/project-store';
import {
  useActiveInspectionStore,
  type ActiveVisit,
} from '@/stores/active-inspection-store';

/**
 * Entry point shown at the top of the dashboard. The QSP picks the type
 * of visit they're about to perform; the picker creates a draft
 * inspection record (POST /api/inspections), stores it in the active-
 * inspection store, and routes to the appropriate capture flow:
 *
 *   weekly / monthly / pre-storm / post-storm → /checkpoints?inspectionId=...
 *     (BMP walkthrough — banner shows reviewed-count and Generate Report)
 *   during-storm → /projects/{currentProjectId}/events
 *     (SMARTS event capture — sample collection for qualifying storms;
 *      not a checkpoint walkthrough, so no inspection draft is created)
 */

const OPTIONS: {
  value: ActiveVisit;
  label: string;
  hint: string;
  icon: typeof CalendarDays;
}[] = [
  { value: 'weekly', label: 'Weekly visit', hint: 'Routine BMP walk-through', icon: ClipboardCheck },
  { value: 'monthly', label: 'Monthly visit', hint: 'Full-site BMP audit', icon: CalendarDays },
  { value: 'pre-storm', label: 'Pre-precipitation', hint: 'Within 48 hours of forecast', icon: CloudDrizzle },
  { value: 'during-storm', label: 'During precipitation', hint: 'SMARTS sample collection', icon: CloudRain },
  { value: 'post-storm', label: 'Post-precipitation', hint: 'Within 48 hours after rain', icon: Droplets },
];

const VISIT_TO_INSPECTION_TYPE: Record<
  Exclude<ActiveVisit, 'during-storm'>,
  { type: 'routine' | 'pre-storm' | 'post-storm'; trigger: 'routine' | 'pre-storm' | 'post-storm' }
> = {
  weekly: { type: 'routine', trigger: 'routine' },
  monthly: { type: 'routine', trigger: 'routine' },
  'pre-storm': { type: 'pre-storm', trigger: 'pre-storm' },
  'post-storm': { type: 'post-storm', trigger: 'post-storm' },
};

export function InspectionPicker() {
  const router = useRouter();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const startActive = useActiveInspectionStore((s) => s.start);
  const activeInspectionId = useActiveInspectionStore((s) => s.inspectionId);
  const activeVisit = useActiveInspectionStore((s) => s.visit);
  const [visit, setVisit] = useState<ActiveVisit>('weekly');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = OPTIONS.find((o) => o.value === visit) ?? OPTIONS[0];
  const inspectionInProgress = !!activeInspectionId && activeVisit !== 'during-storm';

  const start = async () => {
    if (!currentProjectId) {
      setError('Pick a project first');
      return;
    }
    if (visit === 'during-storm') {
      router.push(`/projects/${currentProjectId}/events`);
      return;
    }

    setStarting(true);
    setError(null);
    try {
      const mapping = VISIT_TO_INSPECTION_TYPE[visit];
      const res = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProjectId,
          date: new Date().toISOString(),
          type: mapping.type,
          trigger: mapping.trigger,
          status: 'in-progress',
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const inspection = await res.json();
      if (!inspection?.id) {
        throw new Error('Inspection created but no id returned');
      }
      startActive({
        inspectionId: inspection.id,
        projectId: currentProjectId,
        visit,
      });
      router.push(`/checkpoints?inspectionId=${inspection.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start inspection');
      setStarting(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/25 bg-surface p-5 shadow-lg shadow-amber-500/5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
          <ClipboardList className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-heading text-base font-bold tracking-wide text-foreground">
            Start an inspection
          </h2>
          <p className="text-xs text-muted-foreground">
            Pick the visit you&apos;re performing today
          </p>
        </div>
      </div>

      {/* Direct, tappable visit-type cards — no dropdown hunting. */}
      <fieldset
        disabled={starting}
        className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
      >
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const active = o.value === visit;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setVisit(o.value)}
              aria-pressed={active}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3 text-left transition-all',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50',
                active
                  ? 'border-amber-500/70 bg-amber-500/10 ring-1 ring-amber-500/40'
                  : 'border-border bg-surface-elevated hover:border-amber-500/40 hover:bg-surface-overlay'
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 h-5 w-5 shrink-0',
                  active ? 'text-amber-400' : 'text-muted-foreground'
                )}
              />
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-sm font-semibold',
                    active ? 'text-foreground' : 'text-foreground/90'
                  )}
                >
                  {o.label}
                </span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
                  {o.hint}
                </span>
              </span>
            </button>
          );
        })}
      </fieldset>

      {inspectionInProgress && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-300">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          An inspection is already in progress — starting a new one will replace it.
        </p>
      )}

      <Button
        onClick={start}
        disabled={!currentProjectId || starting}
        size="lg"
        className="mt-4 h-12 w-full text-base font-semibold"
      >
        {starting ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Starting…
          </>
        ) : (
          <>
            Start {selected.label.toLowerCase()}
            <ArrowRight className="ml-1.5 h-5 w-5" />
          </>
        )}
      </Button>

      {!currentProjectId && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Select a project from the top bar to begin.
        </p>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          <AlertTriangle className="mr-1 inline h-3 w-3" />
          {error}
        </div>
      )}
    </div>
  );
}
