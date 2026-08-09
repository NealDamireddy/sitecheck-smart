'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
import { readErrorMessage } from '@/lib/api-error';
import { useProjectStore } from '@/stores/project-store';
import {
  useActiveInspectionStore,
  type ActiveVisit,
} from '@/stores/active-inspection-store';

/**
 * Entry point shown at the top of the dashboard. The QSP picks the type
 * of visit they're about to perform; the picker creates a draft
 * inspection record, stores it in the active-
 * inspection store, and routes to the appropriate capture flow:
 *
 *   weekly / monthly → POST /api/site-records → /inspections/{id}
 *     (the Phase 4 company → inspector → site hierarchy)
 *   pre-storm / post-storm → /inspections/{id}
 *     (exception-based 22-question CGP checklist)
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

/**
 * Failures the inspector can resolve themselves, and where to do it.
 *
 * "The inspector is not assigned to this site" is accurate but a dead end —
 * on 2026-08-08 it took a manual hunt to discover that the fix is the
 * "Activate workspace" action on Field Records. The message now carries the
 * user there instead of describing the problem and stopping.
 */
const ERROR_REMEDIES: Record<string, { href: string; label: string }> = {
  assignment_required: {
    href: '/records',
    label: 'Activate your workspace on Field Records',
  },
  profile_required: {
    href: '/records',
    label: 'Set up your inspector profile on Field Records',
  },
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
  const [remedy, setRemedy] = useState<{ href: string; label: string } | null>(null);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const selected = OPTIONS.find((o) => o.value === visit) ?? OPTIONS[0];
  // The active-inspection store restores from localStorage in the browser.
  // Hide persisted-only UI until after mount so the server and first client
  // render stay identical and React can hydrate the dashboard safely.
  const inspectionInProgress =
    hasMounted && !!activeInspectionId && activeVisit !== 'during-storm';

  const start = async () => {
    if (!currentProjectId) {
      setError('Pick a project first');
      return;
    }
    if (visit === 'during-storm') {
      router.push('/records');
      return;
    }

    setStarting(true);
    setError(null);
    setRemedy(null);
    try {
      const mapping = VISIT_TO_INSPECTION_TYPE[visit];
      const usesFieldRecord = visit === 'weekly' || visit === 'monthly';
      const now = new Date().toISOString();
      const endpoint = usesFieldRecord ? '/api/site-records' : '/api/inspections';
      const requestBody = usesFieldRecord
        ? {
            projectId: currentProjectId,
            recordType:
              visit === 'weekly' ? 'weekly_inspection' : 'monthly_inspection',
            idempotencyKey: `dashboard:${currentProjectId}:${visit}:${Date.now()}`,
            title: visit === 'weekly' ? 'Weekly inspection' : 'Monthly inspection',
            observedFrom: now,
            detail: {
              inspectionDate: now,
              inspectionType: mapping.type,
              weatherTemperature: 0,
              weatherCondition: 'not recorded',
              weatherWindSpeedMph: 0,
              weatherHumidity: 0,
              overallCompliance: 0,
            },
            source: {
              sourceType: 'form',
              schemaVersion: 'sitecheck-dashboard-v1',
              rawPayload: { visit, startedAt: now },
            },
          }
        : {
            projectId: currentProjectId,
            date: now,
            type: mapping.type,
            trigger: mapping.trigger,
            status: 'in-progress',
          };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const failure = new Error(
          readErrorMessage(body, `HTTP ${res.status}`)
        ) as Error & { code?: string };
        failure.code = (body as { code?: string })?.code;
        throw failure;
      }
      const created = await res.json();
      const inspectionId = usesFieldRecord ? created?.detailId : created?.id;
      if (!inspectionId) {
        throw new Error('Inspection created but no id returned');
      }
      startActive({
        inspectionId,
        projectId: currentProjectId,
        visit,
      });
      router.push(`/inspections/${inspectionId}`);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      setRemedy(code ? ERROR_REMEDIES[code] ?? null : null);
      setError(err instanceof Error ? err.message : 'Failed to start inspection');
      setStarting(false);
    }
  };

  return (
    // @container: the visit grid below sizes itself against THIS card, not the
    // viewport. The dashboard renders this card inside a one-third-width column,
    // so viewport breakpoints promoted it to three columns in ~300px of space
    // and the labels overflowed. Container queries make the card correct at
    // every window size instead of only the ones we happened to test.
    <div className="@container rounded-xl border border-amber-500/25 bg-surface p-5 shadow-lg shadow-amber-500/5">
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
        className="mt-4 grid grid-cols-1 gap-2 @sm:grid-cols-2 @lg:grid-cols-3"
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
                // min-w-0: a grid item defaults to min-width:auto and refuses to
                // shrink below its longest word, which is how "precipitation"
                // pushed past the card border.
                'flex min-w-0 items-start gap-3 rounded-lg border p-3 text-left transition-all',
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
                    // break-words is the backstop: even if some future layout
                    // squeezes this card, the label wraps inside its border
                    // rather than spilling over it.
                    'block break-words text-sm font-semibold',
                    active ? 'text-foreground' : 'text-foreground/90'
                  )}
                >
                  {o.label}
                </span>
                <span className="block break-words text-[11px] leading-snug text-muted-foreground">
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
        disabled={!hasMounted || !currentProjectId || starting}
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

      {(!hasMounted || !currentProjectId) && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Select a project from the top bar to begin.
        </p>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          <AlertTriangle className="mr-1 inline h-3 w-3" />
          {error}
          {remedy && (
            <Link
              href={remedy.href}
              className="mt-1.5 block font-semibold underline underline-offset-2 hover:no-underline"
            >
              {remedy.label} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
