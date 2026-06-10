'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, ClipboardList, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

const OPTIONS: { value: ActiveVisit; label: string; hint: string }[] = [
  { value: 'weekly', label: 'Weekly visit', hint: 'Routine BMP walk-through' },
  { value: 'monthly', label: 'Monthly visit', hint: 'Full-site BMP audit' },
  { value: 'pre-storm', label: 'Pre-precipitation visit', hint: 'Within 48 hours of forecast' },
  { value: 'during-storm', label: 'During precipitation visit', hint: 'SMARTS sample collection' },
  { value: 'post-storm', label: 'Post-precipitation visit', hint: 'Within 48 hours after rain ends' },
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
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold">Start an inspection</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{selected.hint}</p>
          {inspectionInProgress && (
            <p className="mt-1 text-[11px] text-amber-300">
              An inspection is already in progress. Starting a new one will replace it.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor="visit-type">
            Visit type
          </label>
          <select
            id="visit-type"
            value={visit}
            onChange={(e) => setVisit(e.target.value as ActiveVisit)}
            disabled={starting}
            className="rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
          >
            {OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Button
            onClick={start}
            disabled={!currentProjectId || starting}
            className="min-h-[40px]"
          >
            {starting ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Starting…
              </>
            ) : (
              <>
                Start
                <ArrowRight className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-700 bg-red-900/40 p-2 text-xs text-red-200">
          <AlertTriangle className="mr-1 inline h-3 w-3" />
          {error}
        </div>
      )}
    </div>
  );
}
