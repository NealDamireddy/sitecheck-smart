'use client';

/**
 * SMARTS events index for a project.
 *
 * /projects/[projectId]/events
 *
 * Lands the user from the sidebar SMARTS link. Lists all smarts_events
 * for the project (newest first by forecast_detected_at) and routes each
 * row to its next-step page:
 *
 *   forecast / active → capture (data still being collected)
 *   ended / completed → review  (read-only summary)
 *
 * Sample count per row is fetched in parallel on mount via
 * samplesStore.fetchForEvent — small N (≤ ~10 events per project in
 * practice) so the N+1 fan-out is fine for now. A future tighten would
 * be adding a JOIN aggregate to GET /api/smarts-events.
 */

import { use, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { AlertTriangle, ArrowLeft, CloudRain, Loader2 } from 'lucide-react';

import { PageTransition } from '@/components/shared/page-transition';
import { Badge } from '@/components/ui/badge';
import {
  EMPTY_SMARTS_EVENTS,
  useSmartsEventsStore,
} from '@/stores/smarts-events-store';
import { useSamplesStore } from '@/stores/samples-store';
import { useProjectStore } from '@/stores/project-store';
import { cn } from '@/lib/utils';
import type { SmartsEventStatus } from '@/types';

function eventStatusStyles(status: SmartsEventStatus): string {
  switch (status) {
    case 'forecast':
      return 'border-amber-700 bg-amber-900/40 text-amber-200';
    case 'active':
      return 'border-red-700 bg-red-900/40 text-red-200';
    case 'ended':
      return 'border-slate-700 bg-slate-800/40 text-slate-200';
    case 'completed':
      return 'border-emerald-700 bg-emerald-900/40 text-emerald-200';
    default:
      return 'border-slate-700 bg-slate-800/40 text-slate-300';
  }
}

function nextStep(
  status: SmartsEventStatus,
  projectId: string,
  eventId: string
): { href: string; label: string } {
  if (status === 'forecast' || status === 'active') {
    return {
      href: `/projects/${projectId}/events/${eventId}/capture`,
      label: 'Open capture →',
    };
  }
  return {
    href: `/projects/${projectId}/events/${eventId}/review`,
    label: 'Open review →',
  };
}

export default function EventsIndexPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);

  const events = useSmartsEventsStore(
    (s) => s.byProject[projectId] ?? EMPTY_SMARTS_EVENTS
  );
  const fetchForProject = useSmartsEventsStore((s) => s.fetchForProject);
  const loadingEvents = useSmartsEventsStore((s) =>
    s.loadingProjects.has(projectId)
  );

  const samplesByEvent = useSamplesStore((s) => s.byEvent);
  const fetchSamples = useSamplesStore((s) => s.fetchForEvent);

  const project = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId)
  );

  useEffect(() => {
    fetchForProject(projectId);
  }, [projectId, fetchForProject]);

  // Fan-out: fetch sample count per event after the events load. Each
  // store call dedupes via its own loading set so re-renders are safe.
  useEffect(() => {
    if (events.length === 0) return;
    for (const evt of events) {
      fetchSamples(evt.id);
    }
  }, [events, fetchSamples]);

  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) =>
        b.forecastDetectedAt.localeCompare(a.forecastDetectedAt)
      ),
    [events]
  );

  return (
    <PageTransition>
      <div className="flex min-h-screen flex-col">
        {/* Sticky header — same shape as capture / review */}
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-background/95 backdrop-blur">
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1 text-xs text-amber-400 hover:underline"
              >
                <ArrowLeft className="h-3 w-3" />
                Dashboard
              </Link>
              <h1 className="mt-1 truncate font-heading text-base font-bold text-slate-100">
                {project?.name ?? projectId}
              </h1>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                SMARTS events
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-3 p-4">
          {loadingEvents && events.length === 0 ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading events…
            </div>
          ) : sortedEvents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center text-sm text-muted-foreground">
              <CloudRain className="mx-auto mb-2 h-5 w-5 text-amber-400" />
              No SMARTS events yet for this project.
              <div className="mt-2 text-xs text-muted-foreground/70">
                Trigger a simulated event from the dashboard demo controls,
                or wait for the NOAA detector to surface a real forecast.
              </div>
              <div className="mt-3">
                <Link
                  href="/dashboard"
                  className="text-amber-400 hover:underline"
                >
                  ← Back to dashboard
                </Link>
              </div>
            </div>
          ) : (
            sortedEvents.map((evt) => {
              const sampleCount = (samplesByEvent[evt.id] ?? []).length;
              const nav = nextStep(evt.status, projectId, evt.id);
              const dateAnchor = evt.startedAt ?? evt.forecastDetectedAt;
              const dateLabel = evt.startedAt
                ? `Started ${format(new Date(evt.startedAt), 'MMM d, h:mm a')}`
                : `Forecast detected ${format(
                    new Date(evt.forecastDetectedAt),
                    'MMM d, h:mm a'
                  )}`;
              return (
                <Link
                  key={evt.id}
                  href={nav.href}
                  className="block rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-amber-600/60"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className={cn(
                            'border text-[10px] uppercase',
                            eventStatusStyles(evt.status)
                          )}
                        >
                          {evt.status}
                        </Badge>
                        <Badge className="border border-slate-700 bg-slate-800/40 text-[9px] uppercase text-slate-300">
                          {evt.source}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {sampleCount} sample{sampleCount === 1 ? '' : 's'}
                        </span>
                        {evt.precipitationInches != null && (
                          <span className="text-xs text-muted-foreground">
                            · {Number(evt.precipitationInches).toFixed(2)}&quot;
                          </span>
                        )}
                      </div>
                      <div
                        className="mt-1 truncate font-mono text-xs text-slate-300"
                        title={evt.id}
                      >
                        {evt.id}
                      </div>
                      <div
                        className="mt-1 text-xs text-muted-foreground"
                        title={dateAnchor}
                      >
                        {dateLabel}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-amber-400">
                      {nav.label}
                    </span>
                  </div>
                </Link>
              );
            })
          )}

          {/* Subtle hint card pointing at the dashboard demo controls — only
              shown when at least one event already exists, so empty-state's
              call-to-action doesn't double up. */}
          {sortedEvents.length > 0 && (
            <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3 text-xs text-muted-foreground">
              <AlertTriangle className="mr-1 inline h-3 w-3 text-amber-400" />
              Need another event for testing? Use the dashboard&apos;s SMARTS
              demo controls.
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
