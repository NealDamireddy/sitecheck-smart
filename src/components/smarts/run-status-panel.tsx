'use client';

/**
 * Dashboard panel for the latest Sync-to-SMARTS run.
 *
 * Reads run history from the new GET /api/smarts/runs (RLS-scoped to the
 * user) and, while the latest run is still running, polls the EXISTING
 * GET /api/smarts/sync/[jobId] for the live step + elapsed time. When the
 * run settled at 'stopped_before_cert' it shows the certify-in-SMARTS
 * call to action — the bot never certifies.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Settings2,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const SMARTS_PORTAL_URL = 'https://smarts.waterboards.ca.gov';

type RunStatus = 'running' | 'stopped_before_cert' | 'error';

interface SmartsRun {
  id: string;
  job_id: string;
  project_id: string;
  wdid: string | null;
  status: RunStatus;
  last_step_reached: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

interface SyncJobView {
  status: 'running' | 'filled' | 'halted' | 'error';
  startedAt: string;
  finishedAt: string | null;
  reason: string | null;
  logTail: string[];
}

function formatElapsed(fromIso: string, toMs: number): string {
  const ms = Math.max(0, toMs - new Date(fromIso).getTime());
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function SmartsRunStatusPanel({ projectId }: { projectId: string }) {
  const [run, setRun] = useState<SmartsRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<SyncJobView | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadLatestRun = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/smarts/runs?projectId=${encodeURIComponent(projectId)}&limit=1`
      );
      if (!res.ok) throw new Error(`runs ${res.status}`);
      const rows = (await res.json()) as SmartsRun[];
      setRun(rows[0] ?? null);
    } catch {
      setRun(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    void loadLatestRun();
  }, [loadLatestRun]);

  // While running: poll the live job endpoint and refresh the run row so
  // the panel settles once finalize() writes the terminal status.
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!run || run.status !== 'running') return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/smarts/sync/${run.job_id}`);
        if (res.ok) {
          const view = (await res.json()) as SyncJobView;
          if (!cancelled) setJob(view);
          if (view.status !== 'running') {
            await loadLatestRun();
          }
        }
      } catch {
        /* transient — keep polling */
      }
    };
    void tick();
    pollRef.current = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [run, loadLatestRun]);

  // 1s clock for the elapsed timer while running.
  useEffect(() => {
    if (!run || run.status !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [run]);

  const header = (
    <div className="flex items-center justify-between">
      <h2 className="font-heading text-sm font-semibold text-slate-100">
        Sync to SMARTS
      </h2>
      <Link href="/dashboard/smarts-setup">
        <Button variant="outline" size="sm">
          <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Setup
        </Button>
      </Link>
    </div>
  );

  if (loading) {
    return (
      <Panel>
        {header}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading run status…
        </div>
      </Panel>
    );
  }

  if (!run) {
    return (
      <Panel>
        {header}
        <p className="mt-3 text-xs text-muted-foreground">
          No SMARTS runs yet. Use{' '}
          <Link href="/dashboard/smarts-setup" className="text-amber-400 underline">
            SMARTS Setup
          </Link>{' '}
          to file an Ad Hoc Monitoring Report.
        </p>
      </Panel>
    );
  }

  const isRunning = run.status === 'running';
  const liveStep =
    isRunning && job?.logTail?.length
      ? job.logTail[job.logTail.length - 1]
      : run.last_step_reached;
  const endMs = run.completed_at ? new Date(run.completed_at).getTime() : now;

  return (
    <Panel>
      {header}

      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              <span className="text-sm font-medium text-amber-200">Running</span>
            </>
          ) : run.status === 'stopped_before_cert' ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-300">
                Data entered — ready to certify
              </span>
            </>
          ) : (
            <>
              <TriangleAlert className="h-4 w-4 text-red-400" />
              <span className="text-sm font-medium text-red-300">Stopped with an error</span>
            </>
          )}
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {formatElapsed(run.started_at, endMs)}
          </span>
        </div>

        {liveStep && (
          <div className="rounded border border-border bg-slate-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {isRunning ? 'Current step' : 'Last step reached'}
            </div>
            <div className="mt-0.5 break-words font-mono text-[11px] text-slate-300">
              {liveStep}
            </div>
          </div>
        )}

        {run.status === 'stopped_before_cert' && (
          <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            <p>Your data has been entered. Log into SMARTS to review and certify.</p>
            <a
              href={SMARTS_PORTAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded border border-emerald-600 bg-emerald-700/30 px-2.5 py-1.5 text-[11px] font-medium text-emerald-100 hover:bg-emerald-700/50"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open SMARTS to certify
            </a>
          </div>
        )}

        {run.status === 'error' && run.error_message && (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {run.error_message}
          </div>
        )}
      </div>
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">{children}</div>
  );
}
