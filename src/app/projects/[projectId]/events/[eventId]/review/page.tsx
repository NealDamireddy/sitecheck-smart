'use client';

/**
 * SMARTS review page.
 *
 * /projects/[projectId]/events/[eventId]/review
 *
 * Read-only summary the QSP looks at before marking an event ended.
 * Shows:
 *   * Sticky header (matches capture page) — project name, event status
 *   * Event-summary banner — status, precipitation, X-of-Y sampled
 *   * One card per location-that-has-a-sample
 *   * Per-parameter row with NAL icons; card border + corner badge
 *     turn red when any parameter is in NAL exceedance
 *   * Bottom actions — "Back to capture" + "Mark event ended"
 *
 * The Excel download, walkthrough clipboard, and SMARTS sync flows are
 * step 11 / step 12 / step 13. They don't live on this page.
 */

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CloudRain,
  Loader2,
} from 'lucide-react';

import { PageTransition } from '@/components/shared/page-transition';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  EMPTY_MONITORING_LOCATIONS,
  useMonitoringLocationsStore,
} from '@/stores/monitoring-locations-store';
import { EMPTY_SAMPLES, useSamplesStore } from '@/stores/samples-store';
import { useSmartsEventsStore } from '@/stores/smarts-events-store';
import { useProjectStore } from '@/stores/project-store';
import {
  isNalExceedance,
  isParameterNal,
} from '@/lib/smarts/nal-thresholds';
import { cn } from '@/lib/utils';
import type {
  MonitoringLocation,
  Sample,
  SmartsEventStatus,
} from '@/types';

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

function eventStatusStyles(status: SmartsEventStatus | undefined): string {
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

// ──────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────

export default function ReviewPage({
  params,
}: {
  params: Promise<{ projectId: string; eventId: string }>;
}) {
  const { projectId, eventId } = use(params);
  const router = useRouter();

  // Stores
  const event = useSmartsEventsStore((s) => s.byId[eventId] ?? null);
  const fetchEvent = useSmartsEventsStore((s) => s.fetchById);
  const eventLoading = useSmartsEventsStore((s) => s.loadingIds.has(eventId));
  const updateEvent = useSmartsEventsStore((s) => s.update);

  const locations = useMonitoringLocationsStore(
    (s) => s.byProject[projectId] ?? EMPTY_MONITORING_LOCATIONS
  );
  const fetchLocations = useMonitoringLocationsStore((s) => s.fetchForProject);
  const locationsLoading = useMonitoringLocationsStore((s) =>
    s.loadingProjects.has(projectId)
  );

  const samples = useSamplesStore((s) => s.byEvent[eventId] ?? EMPTY_SAMPLES);
  const fetchSamples = useSamplesStore((s) => s.fetchForEvent);
  const samplesLoading = useSamplesStore((s) => s.loadingEvents.has(eventId));

  const project = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId)
  );

  // Local state for "Mark event ended"
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvent(eventId);
    fetchLocations(projectId);
    fetchSamples(eventId);
  }, [projectId, eventId, fetchEvent, fetchLocations, fetchSamples]);

  // Derived data
  const locationsById = useMemo(() => {
    const map: Record<string, MonitoringLocation> = {};
    for (const l of locations) map[l.id] = l;
    return map;
  }, [locations]);

  const activeLocations = useMemo(
    () => locations.filter((l) => l.status === 'active'),
    [locations]
  );

  /**
   * Sample cards — one per location that has at least one sample.
   * Sorted alphabetically by location name for stable display.
   * Samples without a resolvable location (deleted between fetches) are
   * skipped silently rather than rendering an orphan card.
   */
  const sampledCards = useMemo(() => {
    const pairs: Array<{ location: MonitoringLocation; sample: Sample }> = [];
    for (const sample of samples) {
      const loc = locationsById[sample.monitoringLocationId];
      if (!loc) continue;
      pairs.push({ location: loc, sample });
    }
    return pairs.sort((a, b) =>
      a.location.name.localeCompare(b.location.name)
    );
  }, [samples, locationsById]);

  const sampledCount = sampledCards.length;
  const totalCount = activeLocations.length;

  const initialLoading =
    (eventLoading && !event) ||
    (locationsLoading && locations.length === 0) ||
    (samplesLoading && samples.length === 0);

  const isEnded = event?.status === 'ended' || event?.status === 'completed';

  async function handleMarkEnded() {
    if (!event) return;
    setEnding(true);
    setEndError(null);
    try {
      await updateEvent(eventId, projectId, { status: 'ended' });
      // If the store recorded an error (network failure etc.) surface it.
      const storeError = useSmartsEventsStore.getState().error;
      if (storeError) {
        throw new Error(storeError);
      }
      router.push('/dashboard');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to mark event ended';
      setEndError(msg);
      setEnding(false);
    }
  }

  return (
    <PageTransition>
      <div className="flex min-h-screen flex-col">
        {/* Sticky header (matches capture page) */}
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
                Review · Event {eventId.slice(0, 16)}…
              </div>
            </div>
            {event && (
              <Badge
                className={cn(
                  'border text-[10px] uppercase',
                  eventStatusStyles(event.status)
                )}
              >
                {event.status}
              </Badge>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 p-4">
          {initialLoading ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading review…
            </div>
          ) : !event ? (
            <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center text-sm text-muted-foreground">
              <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-amber-400" />
              Event not found, or you don&apos;t have access to it.
              <div className="mt-2">
                <Link
                  href="/dashboard"
                  className="text-amber-400 hover:underline"
                >
                  Back to dashboard
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Event summary banner */}
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Event summary
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge
                        className={cn(
                          'border text-[10px] uppercase',
                          eventStatusStyles(event.status)
                        )}
                      >
                        {event.status}
                      </Badge>
                      <span className="inline-flex items-center gap-1.5 text-sm text-slate-200">
                        <CloudRain className="h-3.5 w-3.5 text-blue-400" />
                        {event.precipitationInches != null
                          ? `${event.precipitationInches}" ${
                              event.status === 'forecast'
                                ? 'predicted'
                                : 'recorded'
                            }`
                          : 'Precipitation not recorded'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-slate-100">
                      {sampledCount}
                      <span className="text-base text-muted-foreground">
                        /{totalCount}
                      </span>
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      locations sampled
                    </div>
                  </div>
                </div>
              </div>

              {/* Cards (or empty state) */}
              {sampledCards.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center text-sm text-muted-foreground">
                  <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-amber-400" />
                  No samples recorded for this event yet.
                  <div className="mt-2">
                    <Link
                      href={`/projects/${projectId}/events/${eventId}/capture`}
                      className="text-amber-400 hover:underline"
                    >
                      Go to field capture →
                    </Link>
                  </div>
                </div>
              ) : (
                sampledCards.map(({ location, sample }) => {
                  const nal = isNalExceedance(sample.parameterResults);
                  const prs = sample.parameterResults ?? [];
                  return (
                    <div
                      key={location.id}
                      className={cn(
                        'rounded-lg border bg-slate-900/60 p-4',
                        nal ? 'border-red-700' : 'border-slate-800'
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-100">
                              {location.name}
                            </span>
                            <Badge className="border border-slate-700 bg-slate-800/40 text-[9px] uppercase text-slate-300">
                              {location.dischargePointType}
                            </Badge>
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {location.drainageArea}
                          </div>
                        </div>
                        {nal && (
                          <Badge className="inline-flex items-center gap-1 border border-red-700 bg-red-900/40 text-[9px] uppercase text-red-200">
                            <AlertOctagon className="h-3 w-3" />
                            NAL Exceedance
                          </Badge>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          Sampled{' '}
                          {format(
                            new Date(sample.sampleDatetime),
                            'MMM d, h:mm a'
                          )}
                        </span>
                        <span className="text-slate-600">·</span>
                        <span>by {sample.qspName}</span>
                      </div>

                      <div className="mt-3 space-y-1.5">
                        {prs.length === 0 ? (
                          <div className="rounded-md border border-amber-700 bg-amber-900/30 p-2 text-xs text-amber-200">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              No readings recorded for this sample.
                            </div>
                          </div>
                        ) : (
                          prs.map((p) => {
                            const exceed = isParameterNal(p);
                            return (
                              <div
                                key={p.id}
                                className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/40 p-2 text-xs"
                              >
                                <span className="font-medium text-slate-200">
                                  {p.parameter}
                                </span>
                                <div className="flex items-center gap-3">
                                  <span
                                    className={cn(
                                      'font-mono',
                                      exceed && 'text-red-300'
                                    )}
                                  >
                                    {p.result != null ? p.result : p.qualifier}
                                    {p.result != null && (
                                      <span className="ml-1 text-muted-foreground">
                                        {p.units}
                                      </span>
                                    )}
                                  </span>
                                  {exceed ? (
                                    <AlertOctagon className="h-4 w-4 text-red-400" />
                                  ) : (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Bottom actions */}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href={`/projects/${projectId}/events/${eventId}/capture`}
                  className="flex-1"
                >
                  <Button
                    variant="outline"
                    className="min-h-[48px] w-full"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to capture
                  </Button>
                </Link>
                <Button
                  onClick={handleMarkEnded}
                  disabled={ending || isEnded}
                  className="min-h-[48px] flex-1 bg-emerald-600 text-emerald-50 hover:bg-emerald-700 disabled:opacity-50"
                >
                  {ending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Marking ended…
                    </>
                  ) : isEnded ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Event {event.status}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Mark event ended
                    </>
                  )}
                </Button>
              </div>

              {endError && (
                <div className="rounded-md border border-red-700 bg-red-900/40 p-3 text-xs text-red-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="break-words">{endError}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
