'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/stores/project-store';

/**
 * Entry point shown at the top of the dashboard. The QSP picks the type
 * of visit they're about to perform and the picker routes them to the
 * appropriate capture flow:
 *
 *   weekly / monthly / pre-storm / post-storm → /checkpoints
 *     (the BMP walkthrough — for now all four route to the same screen;
 *      differentiating them into distinct inspection records is a future
 *      build. The query param is preserved so the BMP page can read it.)
 *   during-storm → /projects/{currentProjectId}/events
 *     (SMARTS event capture — sample collection for qualifying storms)
 */

type Visit =
  | 'weekly'
  | 'monthly'
  | 'pre-storm'
  | 'during-storm'
  | 'post-storm';

const OPTIONS: { value: Visit; label: string; hint: string }[] = [
  { value: 'weekly', label: 'Weekly visit', hint: 'Routine BMP walk-through' },
  { value: 'monthly', label: 'Monthly visit', hint: 'Full-site BMP audit' },
  { value: 'pre-storm', label: 'Pre-precipitation visit', hint: 'Within 48 hours of forecast' },
  { value: 'during-storm', label: 'During precipitation visit', hint: 'SMARTS sample collection' },
  { value: 'post-storm', label: 'Post-precipitation visit', hint: 'Within 48 hours after rain ends' },
];

export function InspectionPicker() {
  const router = useRouter();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const [visit, setVisit] = useState<Visit>('weekly');

  const start = () => {
    if (visit === 'during-storm') {
      if (!currentProjectId) return;
      router.push(`/projects/${currentProjectId}/events`);
      return;
    }
    router.push(`/checkpoints?visit=${visit}`);
  };

  const selected = OPTIONS.find((o) => o.value === visit) ?? OPTIONS[0];

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold">Start an inspection</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {selected.hint}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor="visit-type">
            Visit type
          </label>
          <select
            id="visit-type"
            value={visit}
            onChange={(e) => setVisit(e.target.value as Visit)}
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
            disabled={visit === 'during-storm' && !currentProjectId}
            className="min-h-[40px]"
          >
            Start
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
