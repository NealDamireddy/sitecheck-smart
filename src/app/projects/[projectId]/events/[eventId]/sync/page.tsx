'use client';

/**
 * Sync-to-SMARTS review & confirm page.
 *
 * /projects/[projectId]/events/[eventId]/sync
 *
 * Shows EXACTLY what the bot will type into the SMARTS Ad Hoc
 * Monitoring Report — the Event Information values and every field of
 * every sample row — and requires an explicit confirmation before the
 * bot is launched. The preview comes from /api/smarts/sync/preview and
 * the launch route rebuilds the same payload server-side, so what is
 * reviewed here is what gets filled.
 *
 * Two different sign-offs, deliberately kept apart:
 *   1. The checkbox on this page = consent to auto-FILL the draft.
 *   2. The legal SMARTS certification happens in SMARTS, by the QSP,
 *      AFTER the bot stops. The bot never clicks Certify — ever.
 */

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  CloudRain,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

import { PageTransition } from '@/components/shared/page-transition';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SyncToSmartsDialog } from '@/components/smarts/sync-modal';
import {
  EMPTY_MONITORING_LOCATIONS,
  useMonitoringLocationsStore,
} from '@/stores/monitoring-locations-store';
import { EMPTY_SAMPLES, useSamplesStore } from '@/stores/samples-store';
import { useSmartsEventsStore } from '@/stores/smarts-events-store';
import { useProjectStore } from '@/stores/project-store';
import { cn } from '@/lib/utils';
import type { SyncPayload } from '@/lib/smarts/bot-bridge';

const SMARTS_PORTAL_URL = 'https://smarts.waterboards.ca.gov';
const POLL_MS = 2500;

type SyncPreview = SyncPayload & { credentialsConfigured: boolean };

interface JobStatus {
  id: string;
  status: 'running' | 'filled' | 'halted' | 'error';
  reason: string | null;
  logTail: string[];
  screenshots: {
    samples: string[];
    dataSummary: string | null;
    certification: string | null;
    halt: string | null;
  };
}

export default function SyncPage({
  params,
}: {
  params: Promise<{ projectId: string; eventId: string }>;
}) {
  const { projectId, eventId } = use(params);
  const router = useRouter();

  // ── Preview state
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [showCsv, setShowCsv] = useState(false);

  // ── Confirmation + launch state
  const [confirmed, setConfirmed] = useState(false);
  const [headed, setHeaded] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // ── Job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Manual fallback dialog + mark-complete
  const [manualOpen, setManualOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  // Stores — needed for the manual-filing fallback dialog and the
  // mark-complete action; the preview itself is server-assembled.
  const event = useSmartsEventsStore((s) => s.byId[eventId] ?? null);
  const fetchEvent = useSmartsEventsStore((s) => s.fetchById);
  const updateEvent = useSmartsEventsStore((s) => s.update);
  const locations = useMonitoringLocationsStore(
    (s) => s.byProject[projectId] ?? EMPTY_MONITORING_LOCATIONS
  );
  const fetchLocations = useMonitoringLocationsStore((s) => s.fetchForProject);
  const samples = useSamplesStore((s) => s.byEvent[eventId] ?? EMPTY_SAMPLES);
  const fetchSamples = useSamplesStore((s) => s.fetchForEvent);
  const project = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId)
  );

  useEffect(() => {
    fetchEvent(eventId);
    fetchLocations(projectId);
    fetchSamples(eventId);
  }, [projectId, eventId, fetchEvent, fetchLocations, fetchSamples]);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(
        `/api/smarts/sync/preview?eventId=${encodeURIComponent(eventId)}`
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Preview failed (${res.status})`);
      setPreview(body as SyncPreview);
    } catch (err) {
      setPreviewError(
        err instanceof Error ? err.message : 'Failed to load sync preview'
      );
    } finally {
      setPreviewLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  // Poll job status while a job is running.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/smarts/sync/${jobId}`);
        if (!res.ok) return;
        const body = (await res.json()) as JobStatus;
        if (cancelled) return;
        setJob(body);
        if (body.status !== 'running' && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        /* transient poll failure — next tick retries */
      }
    }
    poll();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobId]);

  async function handleLaunch() {
    setLaunching(true);
    setLaunchError(null);
    try {
      const res = await fetch('/api/smarts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, headed }),
      });
      const body = await res.json();
      if (!res.ok) {
        const blockers: string[] | undefined = body.blockers;
        throw new Error(
          blockers?.length
            ? `${body.error} ${blockers.join(' ')}`
            : (body.error ?? `Launch failed (${res.status})`)
        );
      }
      setJob(null);
      setJobId(body.jobId as string);
    } catch (err) {
      setLaunchError(
        err instanceof Error ? err.message : 'Failed to launch sync'
      );
    } finally {
      setLaunching(false);
    }
  }

  function handleRetry() {
    setJobId(null);
    setJob(null);
    setConfirmed(false);
    loadPreview();
  }

  async function handleMarkComplete() {
    setMarking(true);
    setMarkError(null);
    try {
      await updateEvent(eventId, projectId, { status: 'completed' });
      const storeError = useSmartsEventsStore.getState().error;
      if (storeError) throw new Error(storeError);
      router.push('/dashboard');
    } catch (err) {
      setMarkError(
        err instanceof Error ? err.message : 'Failed to mark event complete'
      );
      setMarking(false);
    }
  }

  const blockers = preview?.blockers ?? [];
  const canLaunch =
    !!preview &&
    blockers.length === 0 &&
    preview.credentialsConfigured &&
    confirmed &&
    !launching;

  const phase: 'preview' | 'running' | 'filled' | 'failed' = !jobId
    ? 'preview'
    : !job || job.status === 'running'
      ? 'running'
      : job.status === 'filled'
        ? 'filled'
        : 'failed';

  const walkthroughInput = useMemo(
    () =>
      event
        ? {
            event,
            projectName: project?.name ?? projectId,
            wdid: project?.wdid ?? null,
            monitoringLocations: locations,
            samples,
          }
        : null,
    [event, project, projectId, locations, samples]
  );

  return (
    <PageTransition>
      <div className="flex min-h-screen flex-col">
        {/* Sticky header (matches capture/review pages) */}
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-background/95 backdrop-blur">
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <Link
                href={`/projects/${projectId}/events/${eventId}/review`}
                className="inline-flex items-center gap-1 text-xs text-amber-400 hover:underline"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to review
              </Link>
              <h1 className="mt-1 truncate font-heading text-base font-bold text-slate-100">
                Sync to SMARTS
              </h1>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {project?.name ?? projectId} · Event {eventId.slice(0, 16)}…
              </div>
            </div>
            <Badge className="border border-blue-700 bg-blue-900/40 text-[10px] uppercase text-blue-200">
              <Bot className="mr-1 h-3 w-3" />
              Auto-fill
            </Badge>
          </div>
        </div>

        <div className="flex-1 space-y-3 p-4">
          {/* ───────── Phase: preview / confirm ───────── */}
          {phase === 'preview' && (
            <>
              {previewLoading ? (
                <div className="flex items-center justify-center p-12 text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Building upload preview…
                </div>
              ) : previewError ? (
                <div className="rounded-lg border border-red-700 bg-red-900/40 p-4 text-sm text-red-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      {previewError}
                      <div className="mt-2">
                        <Button variant="outline" size="sm" onClick={loadPreview}>
                          Retry
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : preview ? (
                <>
                  {/* What this does */}
                  <div className="rounded-lg border border-blue-800 bg-blue-950/40 p-4 text-xs text-blue-100">
                    Review everything below — it is exactly what will be typed
                    into the SMARTS Construction Ad Hoc Monitoring Report for{' '}
                    <span className="font-semibold">{preview.siteName}</span>
                    {preview.wdid ? (
                      <>
                        {' '}
                        (WDID{' '}
                        <span className="font-mono">{preview.wdid}</span>)
                      </>
                    ) : null}
                    . The bot fills the draft and{' '}
                    <span className="font-semibold">
                      stops before certification
                    </span>{' '}
                    — you certify in SMARTS yourself afterwards.
                  </div>

                  {/* Blockers */}
                  {blockers.length > 0 && (
                    <div className="rounded-lg border border-red-700 bg-red-900/40 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-red-200">
                        <XCircle className="h-4 w-4" />
                        Cannot sync yet
                      </div>
                      <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-red-200">
                        {blockers.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Credentials notice */}
                  {!preview.credentialsConfigured && (
                    <div className="rounded-lg border border-amber-700 bg-amber-900/30 p-4 text-xs text-amber-200">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          SMARTS credentials are not configured on the server.
                          Add{' '}
                          <code className="rounded bg-slate-950/60 px-1 font-mono">
                            SMARTS_USERNAME
                          </code>{' '}
                          and{' '}
                          <code className="rounded bg-slate-950/60 px-1 font-mono">
                            SMARTS_PASSWORD
                          </code>{' '}
                          to <code className="font-mono">.env.local</code> and
                          restart the dev server. Credentials never leave the
                          server.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Warnings */}
                  {preview.warnings.length > 0 && (
                    <div className="rounded-lg border border-amber-700 bg-amber-900/30 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                        <AlertTriangle className="h-4 w-4" />
                        Check before confirming
                      </div>
                      <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-200">
                        {preview.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Event Information — exactly as filled */}
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <CloudRain className="h-3.5 w-3.5 text-blue-400" />
                      Event Information (SMARTS form values)
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                      <PreviewField label="Event Type" value={preview.eventInfo.eventType} />
                      <PreviewField
                        label="Start"
                        value={`${preview.eventInfo.startDate} ${preview.eventInfo.startTime}`.trim()}
                      />
                      <PreviewField
                        label="End"
                        value={`${preview.eventInfo.endDate} ${preview.eventInfo.endTime}`.trim()}
                      />
                      <PreviewField
                        label="Precipitation (in)"
                        value={preview.eventInfo.precipitationInches}
                      />
                      <PreviewField label="Site" value={preview.siteName} />
                      <PreviewField label="WDID" value={preview.wdid ?? ''} mono />
                    </dl>
                  </div>

                  {/* Sample rows — exactly as filled */}
                  {preview.rows.map((row) => (
                    <div
                      key={row.locationId}
                      className="rounded-lg border border-slate-800 bg-slate-900/60 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-100">
                          {row.locationName}
                        </span>
                        <Badge className="border border-slate-700 bg-slate-800/40 text-[9px] uppercase text-slate-300">
                          {row.dischargePointType}
                        </Badge>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                        <PreviewField
                          label="Sample Date & Time"
                          value={row.sampleDatetimeSmarts}
                          mono
                        />
                        <PreviewField label="QSP" value={row.qspName} />
                      </dl>
                      <div className="mt-3 space-y-1.5">
                        <ParameterPreviewRow name="pH" p={row.ph} />
                        <ParameterPreviewRow name="Turbidity" p={row.turbidity} />
                      </div>
                    </div>
                  ))}

                  {/* Raw CSV toggle */}
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <button
                      type="button"
                      onClick={() => setShowCsv((v) => !v)}
                      className="inline-flex items-center gap-2 text-xs text-amber-400 hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {showCsv ? 'Hide' : 'Show'} raw bot CSV
                    </button>
                    {showCsv && (
                      <pre className="mt-2 overflow-x-auto rounded bg-slate-950/60 p-2 font-mono text-[10px] leading-relaxed text-slate-300">
                        {preview.csv}
                      </pre>
                    )}
                    <a
                      href={`/api/smarts-events/${eventId}/export?format=csv`}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-300 hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download CSV
                    </a>
                  </div>

                  {/* Confirm + launch */}
                  <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-emerald-600"
                      />
                      <span className="text-xs text-slate-200">
                        I have reviewed the data above and confirm it is
                        accurate and complete. Fill it into the SMARTS draft
                        report.{' '}
                        <span className="text-muted-foreground">
                          (This does not certify the report — certification
                          happens in SMARTS, by you, after the fill.)
                        </span>
                      </span>
                    </label>
                    <label className="mt-3 flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={headed}
                        onChange={(e) => setHeaded(e.target.checked)}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      <span className="text-xs text-muted-foreground">
                        Show the browser window while filling (recommended —
                        you can watch the bot work)
                      </span>
                    </label>

                    {launchError && (
                      <div className="mt-3 rounded-md border border-red-700 bg-red-900/40 p-3 text-xs text-red-200">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="break-words">{launchError}</span>
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={handleLaunch}
                      disabled={!canLaunch}
                      className="mt-3 min-h-[48px] w-full bg-emerald-600 text-emerald-50 hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {launching ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Launching…
                        </>
                      ) : (
                        <>
                          <Bot className="mr-2 h-4 w-4" />
                          Confirm & fill SMARTS draft
                        </>
                      )}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setManualOpen(true)}
                      className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-slate-300 hover:underline"
                    >
                      Prefer to file manually? Use the step-by-step checklist
                    </button>
                  </div>
                </>
              ) : null}
            </>
          )}

          {/* ───────── Phase: running ───────── */}
          {phase === 'running' && (
            <div className="rounded-lg border border-blue-800 bg-blue-950/40 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-100">
                <Loader2 className="h-4 w-4 animate-spin" />
                Filling the SMARTS draft…
              </div>
              <p className="mt-1 text-xs text-blue-200/80">
                The bot is logging in, opening the Ad Hoc report, and entering
                the data you confirmed. It stops before certification. This
                usually takes a couple of minutes
                {headed ? ' — a Chromium window is open on this machine' : ''}.
              </p>
              <LogTail lines={job?.logTail ?? []} />
            </div>
          )}

          {/* ───────── Phase: filled ───────── */}
          {phase === 'filled' && job && (
            <>
              <div className="rounded-lg border border-emerald-700 bg-emerald-900/30 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" />
                  Draft filled — your certification is the last step
                </div>
                <p className="mt-1 text-xs text-emerald-100/80">
                  The bot entered all data and stopped at the Certification
                  screen without certifying. Log into SMARTS, review the draft,
                  and certify it yourself — that final legal step is always
                  yours.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <a
                    href={SMARTS_PORTAL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1"
                  >
                    <Button className="min-h-[44px] w-full bg-emerald-600 text-emerald-50 hover:bg-emerald-700">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open SMARTS to certify
                    </Button>
                  </a>
                  <Button
                    variant="outline"
                    onClick={handleMarkComplete}
                    disabled={marking}
                    className="min-h-[44px] flex-1"
                  >
                    {marking ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Recording…
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        I certified — mark event complete
                      </>
                    )}
                  </Button>
                </div>
                {markError && (
                  <div className="mt-2 rounded-md border border-red-700 bg-red-900/40 p-2 text-xs text-red-200">
                    {markError}
                  </div>
                )}
              </div>

              {(job.screenshots.certification || job.screenshots.dataSummary) && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    What the bot left behind
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {job.screenshots.dataSummary && (
                      <JobScreenshot
                        jobId={job.id}
                        screenshotKey="dataSummary"
                        caption="Data Summary"
                      />
                    )}
                    {job.screenshots.certification && (
                      <JobScreenshot
                        jobId={job.id}
                        screenshotKey="certification"
                        caption="Certification screen (NOT certified)"
                      />
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ───────── Phase: failed ───────── */}
          {phase === 'failed' && job && (
            <>
              <div className="rounded-lg border border-red-700 bg-red-900/40 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-200">
                  <AlertOctagon className="h-4 w-4" />
                  Sync stopped before completing
                </div>
                <p className="mt-1 break-words text-xs text-red-200/90">
                  {job.reason ?? 'The bot stopped without a recorded reason.'}
                </p>
                <p className="mt-1 text-xs text-red-200/70">
                  Nothing was certified or submitted. Any partially-filled
                  draft stays in SMARTS as &quot;Not Submitted&quot; — re-running
                  resumes it instead of creating a duplicate.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={handleRetry}
                    className="min-h-[44px] flex-1"
                  >
                    Back to review & retry
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setManualOpen(true)}
                    className="min-h-[44px] flex-1"
                  >
                    File manually instead
                  </Button>
                </div>
              </div>
              {job.screenshots.halt && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                  <JobScreenshot
                    jobId={job.id}
                    screenshotKey="halt"
                    caption="Where the bot stopped"
                  />
                </div>
              )}
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <LogTail lines={job.logTail} />
              </div>
            </>
          )}
        </div>

        {/* Manual-filing fallback — the structured checklist. */}
        {walkthroughInput && (
          <SyncToSmartsDialog
            eventId={eventId}
            projectId={projectId}
            open={manualOpen}
            onClose={() => setManualOpen(false)}
            onCompleted={() => {
              setManualOpen(false);
              router.push('/dashboard');
            }}
            walkthroughInput={walkthroughInput}
          />
        )}
      </div>
    </PageTransition>
  );
}

// ──────────────────────────────────────────────────────
// Bits
// ──────────────────────────────────────────────────────

function PreviewField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-0.5 text-slate-200',
          mono && 'font-mono',
          !value && 'text-slate-500'
        )}
      >
        {value || '—'}
      </dd>
    </div>
  );
}

function ParameterPreviewRow({
  name,
  p,
}: {
  name: string;
  p: {
    result: number;
    units: string;
    analyticalMethod: string;
    mdl?: number;
    rl?: number;
    analyzedBy: string;
    nalExceedance: boolean;
  } | null;
}) {
  if (!p) {
    return (
      <div className="flex items-center justify-between rounded-md border border-red-800 bg-red-950/40 p-2 text-xs">
        <span className="font-medium text-slate-200">{name}</span>
        <span className="text-red-300">missing</span>
      </div>
    );
  }
  return (
    <div
      className={cn(
        'rounded-md border p-2 text-xs',
        p.nalExceedance
          ? 'border-red-800 bg-red-950/40'
          : 'border-slate-800 bg-slate-950/40'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-200">{name}</span>
        <span
          className={cn('font-mono', p.nalExceedance && 'text-red-300')}
        >
          {p.result}
          <span className="ml-1 text-muted-foreground">{p.units}</span>
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        <span>
          Method: <span className="font-mono text-slate-300">{p.analyticalMethod}</span>
        </span>
        <span>
          MDL:{' '}
          <span className="font-mono text-slate-300">{p.mdl ?? '—'}</span>
        </span>
        <span>
          RL: <span className="font-mono text-slate-300">{p.rl ?? '—'}</span>
        </span>
        <span>
          Analyzed by:{' '}
          <span className="font-mono text-slate-300">{p.analyzedBy}</span>
        </span>
      </div>
    </div>
  );
}

function LogTail({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <pre className="mt-3 max-h-56 overflow-y-auto rounded bg-slate-950/70 p-2 font-mono text-[10px] leading-relaxed text-slate-400">
      {lines.join('\n')}
    </pre>
  );
}

function JobScreenshot({
  jobId,
  screenshotKey,
  caption,
}: {
  jobId: string;
  screenshotKey: string;
  caption: string;
}) {
  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element -- local API-served PNG, dimensions unknown */}
      <img
        src={`/api/smarts/sync/${jobId}/screenshot?key=${screenshotKey}`}
        alt={caption}
        className="w-full rounded border border-slate-800"
      />
      <figcaption className="mt-1 text-[10px] text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}
