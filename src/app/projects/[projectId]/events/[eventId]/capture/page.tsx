'use client';

/**
 * SMARTS field capture page.
 *
 * /projects/[projectId]/events/[eventId]/capture
 *
 * Mobile-first, target 375px viewport. A QSP in the field opens the page
 * for a specific smarts_event and sees one card per active monitoring
 * location for the project. Tap a card → inline form for that location.
 * Save → POSTs to /api/samples (which upserts) → card flips to "sampled."
 *
 * Re-tapping a sampled card re-opens the form pre-filled with existing
 * values; saving re-POSTs and the upsert path on the server replaces
 * the parameter_results. This is the same flow as a paper logbook
 * "cross out and write the new number."
 *
 * Not in scope for v1: photo upload, parameters beyond pH/Turbidity,
 * client-side validation beyond what Zod enforces server-side.
 */

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
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
import { isNalExceedance } from '@/lib/smarts/nal-thresholds';
import { cn } from '@/lib/utils';
import type {
  MonitoringLocation,
  ParameterName,
  ParameterResult,
  Sample,
  SmartsEventStatus,
} from '@/types';

// ──────────────────────────────────────────────────────
// Constants + small helpers
// ──────────────────────────────────────────────────────
//
// NAL thresholds + isNalExceedance() live in @/lib/smarts/nal-thresholds —
// single source of truth shared with the review page.

const DEFAULT_UNITS: Record<ParameterName, string> = {
  pH: 'su',
  Turbidity: 'NTU',
};

const DEFAULT_METHOD: Record<ParameterName, string> = {
  pH: 'pH field',
  Turbidity: 'Hach 2100Q',
};

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

function sampleSummaryLine(sample: Sample): string {
  const prs = sample.parameterResults ?? [];
  const ph = prs.find((p) => p.parameter === 'pH');
  const turb = prs.find((p) => p.parameter === 'Turbidity');
  const parts: string[] = [];
  if (ph && ph.result != null) {
    parts.push(`pH ${ph.result}`);
  } else if (ph) {
    parts.push(`pH ${ph.qualifier}`);
  }
  if (turb && turb.result != null) {
    parts.push(`Turbidity ${turb.result} ${turb.units || 'NTU'}`);
  } else if (turb) {
    parts.push(`Turbidity ${turb.qualifier}`);
  }
  const at = format(new Date(sample.sampleDatetime), 'h:mm a');
  return `${parts.join(', ') || 'No readings'} at ${at}`;
}

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function localInputToIso(local: string): string {
  return new Date(local).toISOString();
}

// ──────────────────────────────────────────────────────
// Inline form component — owns its own state per expansion
// ──────────────────────────────────────────────────────

interface ParameterRow {
  parameter: ParameterName;
  result: string; // string so the input stays editable; convert on save
  units: string;
  analyticalMethod: string;
}

function defaultRows(): ParameterRow[] {
  return [
    {
      parameter: 'pH',
      result: '',
      units: DEFAULT_UNITS.pH,
      analyticalMethod: DEFAULT_METHOD.pH,
    },
    {
      parameter: 'Turbidity',
      result: '',
      units: DEFAULT_UNITS.Turbidity,
      analyticalMethod: DEFAULT_METHOD.Turbidity,
    },
  ];
}

function rowsFromSample(sample: Sample): ParameterRow[] {
  const prs = sample.parameterResults ?? [];
  if (prs.length === 0) return defaultRows();
  return prs.map((p) => ({
    parameter: p.parameter,
    result: p.result == null ? '' : String(p.result),
    units: p.units || DEFAULT_UNITS[p.parameter],
    analyticalMethod: p.analyticalMethod || DEFAULT_METHOD[p.parameter],
  }));
}

interface SampleSubmit {
  qspName: string;
  sampleDatetime: string;
  parameterResults: Array<{
    parameter: ParameterName;
    result: number | null;
    units: string;
    analyticalMethod: string;
  }>;
}

function SampleForm({
  location,
  existing,
  onSave,
  onCancel,
}: {
  location: MonitoringLocation;
  existing: Sample | undefined;
  onSave: (payload: SampleSubmit) => Promise<void>;
  onCancel: () => void;
}) {
  const [qspName, setQspName] = useState(existing?.qspName ?? '');
  const [datetimeLocal, setDatetimeLocal] = useState(() =>
    isoToLocalInput(existing?.sampleDatetime ?? new Date().toISOString())
  );
  const [rows, setRows] = useState<ParameterRow[]>(() =>
    existing ? rowsFromSample(existing) : defaultRows()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(idx: number, patch: Partial<ParameterRow>) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch };
        // When parameter dropdown changes, auto-fill units + method to the
        // sensible default for that parameter — unless the user typed over
        // them already (we compare to the old defaults).
        if (patch.parameter && patch.parameter !== r.parameter) {
          if (r.units === DEFAULT_UNITS[r.parameter] || !r.units) {
            next.units = DEFAULT_UNITS[patch.parameter];
          }
          if (r.analyticalMethod === DEFAULT_METHOD[r.parameter] || !r.analyticalMethod) {
            next.analyticalMethod = DEFAULT_METHOD[patch.parameter];
          }
        }
        return next;
      })
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload: SampleSubmit = {
        qspName: qspName.trim(),
        sampleDatetime: localInputToIso(datetimeLocal),
        parameterResults: rows.map((r) => ({
          parameter: r.parameter,
          result: r.result.trim() === '' ? null : Number(r.result),
          units: r.units,
          analyticalMethod: r.analyticalMethod,
        })),
      };
      await onSave(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save sample';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border border-slate-700 bg-slate-950/60 p-3">
      {/* qspName */}
      <div>
        <label className="block text-[10px] uppercase tracking-wide text-muted-foreground">
          QSP Name
        </label>
        <input
          type="text"
          value={qspName}
          onChange={(e) => setQspName(e.target.value)}
          placeholder="Your name"
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
        />
      </div>

      {/* sample datetime */}
      <div>
        <label className="block text-[10px] uppercase tracking-wide text-muted-foreground">
          Sample Date / Time
        </label>
        <input
          type="datetime-local"
          value={datetimeLocal}
          onChange={(e) => setDatetimeLocal(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
        />
      </div>

      {/* parameter rows */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Readings
        </div>
        {rows.map((row, idx) => (
          <div
            key={idx}
            className="space-y-2 rounded-md border border-slate-800 bg-slate-900/60 p-2"
          >
            <div className="grid grid-cols-2 gap-2">
              <select
                value={row.parameter}
                onChange={(e) =>
                  updateRow(idx, { parameter: e.target.value as ParameterName })
                }
                className="rounded-md border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="pH">pH</option>
                <option value="Turbidity">Turbidity</option>
              </select>
              <input
                type="number"
                inputMode="decimal"
                value={row.result}
                onChange={(e) => updateRow(idx, { result: e.target.value })}
                placeholder="Result"
                className="rounded-md border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={row.units}
                onChange={(e) => updateRow(idx, { units: e.target.value })}
                placeholder="Units"
                className="rounded-md border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
              />
              <input
                type="text"
                value={row.analyticalMethod}
                onChange={(e) =>
                  updateRow(idx, { analyticalMethod: e.target.value })
                }
                placeholder="Method"
                className="rounded-md border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-red-700 bg-red-900/40 p-3 text-xs text-red-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving || qspName.trim().length === 0}
          className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save sample'
          )}
        </Button>
        <Button
          type="button"
          onClick={onCancel}
          variant="secondary"
          disabled={saving}
          className="flex-1"
        >
          Cancel
        </Button>
      </div>

      {/* Visible context — keeps the location identifiable mid-form */}
      <div className="border-t border-slate-800 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        Capturing for {location.name} · {location.drainageArea}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────

export default function CapturePage({
  params,
}: {
  params: Promise<{ projectId: string; eventId: string }>;
}) {
  const { projectId, eventId } = use(params);

  // Event
  const event = useSmartsEventsStore((s) => s.byId[eventId] ?? null);
  const fetchEvent = useSmartsEventsStore((s) => s.fetchById);
  const eventLoading = useSmartsEventsStore((s) => s.loadingIds.has(eventId));

  // Locations (project fixtures)
  const locations = useMonitoringLocationsStore(
    (s) => s.byProject[projectId] ?? EMPTY_MONITORING_LOCATIONS
  );
  const fetchLocations = useMonitoringLocationsStore((s) => s.fetchForProject);
  const locationsLoading = useMonitoringLocationsStore((s) =>
    s.loadingProjects.has(projectId)
  );

  // Samples (per event)
  const samples = useSamplesStore((s) => s.byEvent[eventId] ?? EMPTY_SAMPLES);
  const fetchSamples = useSamplesStore((s) => s.fetchForEvent);
  const samplesLoading = useSamplesStore((s) => s.loadingEvents.has(eventId));
  const createSample = useSamplesStore((s) => s.create);

  // Project — read from the project store (currently static-fallback-seeded;
  // future API hookup is independent of this page).
  const project = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId)
  );

  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchEvent(eventId);
    fetchLocations(projectId);
    fetchSamples(eventId);
  }, [projectId, eventId, fetchEvent, fetchLocations, fetchSamples]);

  // location id → sample
  const sampleByLocation = useMemo(() => {
    const map: Record<string, Sample> = {};
    for (const s of samples) {
      map[s.monitoringLocationId] = s;
    }
    return map;
  }, [samples]);

  // active only
  const activeLocations = useMemo(
    () => locations.filter((l) => l.status === 'active'),
    [locations]
  );

  // All active locations have a sample → green "Review & Sync" CTA at top.
  const allSampled = useMemo(() => {
    if (activeLocations.length === 0) return false;
    return activeLocations.every((l) => sampleByLocation[l.id] != null);
  }, [activeLocations, sampleByLocation]);

  const initialLoading =
    (eventLoading && !event) ||
    (locationsLoading && locations.length === 0) ||
    (samplesLoading && samples.length === 0);

  async function handleSave(
    location: MonitoringLocation,
    payload: SampleSubmit
  ) {
    const created = await createSample({
      projectId,
      smartsEventId: eventId,
      monitoringLocationId: location.id,
      sampleDatetime: payload.sampleDatetime,
      qspName: payload.qspName,
      parameterResults: payload.parameterResults,
    });
    if (!created) {
      // Store sets error string; surface via thrown so the form catches it.
      const storeError = useSamplesStore.getState().error;
      throw new Error(storeError ?? 'Failed to save sample');
    }
    // Collapse the form on success.
    setExpandedId(null);
  }

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
                Field capture · Event {eventId.slice(0, 16)}…
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
          {!initialLoading && allSampled && (
            <Link
              href={`/projects/${projectId}/events/${eventId}/review`}
              className="block"
            >
              <Button className="min-h-[48px] w-full bg-emerald-600 text-emerald-50 hover:bg-emerald-700">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Review &amp; Sync — all {activeLocations.length} locations
                sampled
              </Button>
            </Link>
          )}
          {initialLoading ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading capture…
            </div>
          ) : !event ? (
            <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center text-sm text-muted-foreground">
              <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-amber-400" />
              Event not found, or you don&apos;t have access to it.
              <div className="mt-2">
                <Link href="/dashboard" className="text-amber-400 hover:underline">
                  Back to dashboard
                </Link>
              </div>
            </div>
          ) : activeLocations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center text-sm text-muted-foreground">
              <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-amber-400" />
              No active monitoring locations for this project.
              <div className="mt-1 text-xs text-muted-foreground/70">
                Add at least one before sampling.
              </div>
            </div>
          ) : (
            activeLocations.map((location) => {
              const sample = sampleByLocation[location.id];
              const expanded = expandedId === location.id;
              const sampled = sample != null;
              const nal = isNalExceedance(sample?.parameterResults);

              return (
                <div
                  key={location.id}
                  className={cn(
                    'rounded-lg border bg-slate-900/60',
                    nal
                      ? 'border-red-700'
                      : sampled
                        ? 'border-emerald-700'
                        : 'border-slate-800'
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(expanded ? null : location.id)
                    }
                    className="flex w-full items-start justify-between gap-3 p-4 text-left min-h-[48px]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-100">
                          {location.name}
                        </span>
                        <Badge className="border border-slate-700 bg-slate-800/40 text-[9px] uppercase text-slate-300">
                          {location.dischargePointType}
                        </Badge>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {location.drainageArea}
                      </div>
                      {sample && (
                        <div className="mt-1 text-xs text-slate-300">
                          {sampleSummaryLine(sample)}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {nal && (
                        <Badge className="border border-red-700 bg-red-900/40 text-[9px] uppercase text-red-200">
                          NAL exceeded
                        </Badge>
                      )}
                      {sampled && !nal && (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      )}
                      {!sampled && (
                        <Badge className="border border-amber-700 bg-amber-900/40 text-[9px] uppercase text-amber-200">
                          Pending
                        </Badge>
                      )}
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-slate-800 px-4 pb-4">
                      <SampleForm
                        location={location}
                        existing={sample}
                        onSave={(payload) => handleSave(location, payload)}
                        onCancel={() => setExpandedId(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </PageTransition>
  );
}
