'use client';

/**
 * Rain events index for a project.
 *
 * /projects/[projectId]/events
 *
 * Two sections:
 *   * Current  — events still being captured (status: forecast | active)
 *   * Past     — read-only events (status: ended | completed)
 *
 * QSPs can also log a new event directly from this page via the
 * "New Event" CTA, which opens an inline form posting through the store's
 * `create()` action.
 *
 * Sample count per row is fetched in parallel on mount via
 * samplesStore.fetchForEvent. Small N (≤ ~10 events per project in
 * practice) so the N+1 fan-out is fine for now.
 */

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, CloudRain, Loader2, Plus, X } from 'lucide-react';

import { PageTransition } from '@/components/shared/page-transition';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  EMPTY_SMARTS_EVENTS,
  useSmartsEventsStore,
} from '@/stores/smarts-events-store';
import { useSamplesStore } from '@/stores/samples-store';
import { useProjectStore } from '@/stores/project-store';
import { OfficialForecastEvidence } from '@/components/weather/official-forecast-evidence';
import { cn } from '@/lib/utils';
import type { SmartsEvent, SmartsEventStatus } from '@/types';

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

const CURRENT_STATUSES: SmartsEventStatus[] = ['forecast', 'active'];

function nextStep(
  status: SmartsEventStatus,
  projectId: string,
  eventId: string,
): { href: string; label: string } {
  if (CURRENT_STATUSES.includes(status)) {
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

/** Format an ISO timestamp into the value expected by <input type="datetime-local">. */
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EventsIndexPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);

  const events = useSmartsEventsStore(
    (s) => s.byProject[projectId] ?? EMPTY_SMARTS_EVENTS,
  );
  const fetchForProject = useSmartsEventsStore((s) => s.fetchForProject);
  const createEvent = useSmartsEventsStore((s) => s.create);
  const loadingEvents = useSmartsEventsStore((s) =>
    s.loadingProjects.has(projectId),
  );

  const samplesByEvent = useSamplesStore((s) => s.byEvent);
  const fetchSamples = useSamplesStore((s) => s.fetchForEvent);

  const project = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );

  useEffect(() => {
    fetchForProject(projectId);
  }, [projectId, fetchForProject]);

  // Fan-out: fetch sample count per event after the events load.
  useEffect(() => {
    if (events.length === 0) return;
    for (const evt of events) {
      fetchSamples(evt.id);
    }
  }, [events, fetchSamples]);

  const { current, past } = useMemo(() => {
    const sorted = [...events].sort((a, b) =>
      b.forecastDetectedAt.localeCompare(a.forecastDetectedAt),
    );
    return {
      current: sorted.filter((e) => CURRENT_STATUSES.includes(e.status)),
      past: sorted.filter((e) => !CURRENT_STATUSES.includes(e.status)),
    };
  }, [events]);

  // New-event form state
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<SmartsEventStatus>('active');
  const [formStartedAt, setFormStartedAt] = useState(toDatetimeLocal(new Date().toISOString()));
  const [formEndedAt, setFormEndedAt] = useState('');
  const [formPrecip, setFormPrecip] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const resetForm = () => {
    setFormStatus('active');
    setFormStartedAt(toDatetimeLocal(new Date().toISOString()));
    setFormEndedAt('');
    setFormPrecip('');
    setFormNotes('');
    setCreateError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const event = await createEvent(projectId, {
        status: formStatus,
        startedAt: formStartedAt ? new Date(formStartedAt).toISOString() : undefined,
        endedAt: formEndedAt ? new Date(formEndedAt).toISOString() : undefined,
        precipitationInches: formPrecip ? Number(formPrecip) : undefined,
        notes: formNotes.trim() || undefined,
      });
      if (!event) {
        const storeErr = useSmartsEventsStore.getState().error;
        throw new Error(storeErr ?? 'Create returned null');
      }
      setShowForm(false);
      resetForm();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create event');
    } finally {
      setCreating(false);
    }
  };

  return (
    <PageTransition>
      <div className="flex min-h-screen flex-col">
        {/* Sticky header */}
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
                Rain events
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => {
                resetForm();
                setShowForm((v) => !v);
              }}
            >
              {showForm ? (
                <>
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  New Event
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-6 p-4">
          <OfficialForecastEvidence projectId={projectId} />

          {/* New-event form, expanded inline below the header. */}
          {showForm && (
            <form
              onSubmit={handleCreate}
              className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 space-y-3"
            >
              <div className="text-sm font-semibold text-amber-200">
                Log a rain event
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Status *
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) =>
                      setFormStatus(e.target.value as SmartsEventStatus)
                    }
                    className="w-full rounded border border-border bg-elevated px-2 py-1.5 text-sm focus:border-amber-500/50 focus:outline-none"
                  >
                    <option value="forecast">Forecast (expected)</option>
                    <option value="active">Active (in progress)</option>
                    <option value="ended">Ended (rain stopped)</option>
                    <option value="completed">Completed (review done)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Precipitation (inches)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formPrecip}
                    onChange={(e) => setFormPrecip(e.target.value)}
                    placeholder="0.50"
                    className="w-full rounded border border-border bg-elevated px-2 py-1.5 text-sm font-mono focus:border-amber-500/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Started at
                  </label>
                  <input
                    type="datetime-local"
                    value={formStartedAt}
                    onChange={(e) => setFormStartedAt(e.target.value)}
                    className="w-full rounded border border-border bg-elevated px-2 py-1.5 text-sm focus:border-amber-500/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Ended at (if known)
                  </label>
                  <input
                    type="datetime-local"
                    value={formEndedAt}
                    onChange={(e) => setFormEndedAt(e.target.value)}
                    className="w-full rounded border border-border bg-elevated px-2 py-1.5 text-sm focus:border-amber-500/50 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Anything relevant for SMARTS reporting…"
                    className="w-full rounded border border-border bg-elevated px-2 py-1.5 text-sm focus:border-amber-500/50 focus:outline-none"
                  />
                </div>
              </div>
              {createError && (
                <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {createError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {creating ? 'Creating…' : 'Create event'}
                </Button>
              </div>
            </form>
          )}

          {loadingEvents && events.length === 0 ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading events…
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center text-sm text-muted-foreground">
              <CloudRain className="mx-auto mb-2 h-5 w-5 text-amber-400" />
              No rain events yet for this project.
              <div className="mt-2 text-xs text-muted-foreground/70">
                Click <span className="text-amber-400">New Event</span> above to
                log one, or trigger a simulated event from the dashboard demo
                controls.
              </div>
            </div>
          ) : (
            <>
              <EventSection
                title="Current"
                hint="In-progress or upcoming events. Tap to open capture."
                events={current}
                projectId={projectId}
                samplesByEvent={samplesByEvent}
                emptyCopy="No current events. You're caught up."
              />
              <EventSection
                title="Past"
                hint="Read-only events. Tap to open review."
                events={past}
                projectId={projectId}
                samplesByEvent={samplesByEvent}
                emptyCopy="No past events yet."
              />
            </>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

interface EventSectionProps {
  title: string;
  hint: string;
  events: SmartsEvent[];
  projectId: string;
  samplesByEvent: Record<string, Array<{ id: string }>>;
  emptyCopy: string;
}

function EventSection({
  title,
  hint,
  events,
  projectId,
  samplesByEvent,
  emptyCopy,
}: EventSectionProps) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      {events.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-800 bg-slate-900/20 p-4 text-center text-xs text-muted-foreground">
          {emptyCopy}
        </div>
      ) : (
        <ul className="space-y-2">
          {events.map((evt) => {
            const sampleCount = (samplesByEvent[evt.id] ?? []).length;
            const nav = nextStep(evt.status, projectId, evt.id);
            const dateAnchor = evt.startedAt ?? evt.forecastDetectedAt;
            const dateLabel = evt.startedAt
              ? `Started ${format(new Date(evt.startedAt), 'MMM d, h:mm a')}`
              : `Forecast detected ${format(
                  new Date(evt.forecastDetectedAt),
                  'MMM d, h:mm a',
                )}`;
            return (
              <li key={evt.id}>
                <Link
                  href={nav.href}
                  className="block rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-amber-600/60"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className={cn(
                            'border text-[10px] uppercase',
                            eventStatusStyles(evt.status),
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
