'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CloudRain, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ForecastSnapshotSummary {
  id: string;
  provider: string;
  retrievedAt: string;
  issuedAt: string | null;
  payloadSha256: string;
  parserVersion: string;
  normalization: {
    status: 'normalized' | 'unknown';
    reasonCodes: string[];
    intervalCount: number;
  };
}

export function OfficialForecastEvidence({ projectId }: { projectId: string }) {
  const [snapshot, setSnapshot] = useState<ForecastSnapshotSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLatest = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/cgp-forecast`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not load forecast evidence.');
      setSnapshot(body.snapshot ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load forecast evidence.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  async function capture() {
    setCapturing(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/cgp-forecast/capture`,
        { method: 'POST' }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not capture the NWS forecast.');
      setSnapshot(body as ForecastSnapshotSummary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not capture the NWS forecast.');
    } finally {
      setCapturing(false);
    }
  }

  const normalized = snapshot?.normalization.status === 'normalized';

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CloudRain className="h-4 w-4 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Official NWS forecast evidence
            </h2>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Save the exact NWS forecast used for a compliance decision. Capturing
            evidence does not create an inspection or submit anything to SMARTS.
          </p>
        </div>
        <Button size="sm" onClick={capture} disabled={capturing || loading}>
          {capturing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : snapshot ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <CloudRain className="h-3.5 w-3.5" />
          )}
          {capturing ? 'Capturing…' : snapshot ? 'Capture new forecast' : 'Capture forecast'}
        </Button>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading latest evidence…
        </div>
      ) : error ? (
        <div className="mt-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      ) : snapshot ? (
        <div className="mt-4 grid gap-3 rounded-md border border-slate-800 bg-slate-950/40 p-3 sm:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {normalized ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <TriangleAlert className="h-4 w-4 text-amber-400" />
              )}
              <span className="text-sm font-medium text-slate-100">
                {normalized ? 'Evidence ready for QPE evaluation' : 'Evidence needs QSP review'}
              </span>
              <Badge className={normalized
                ? 'border border-emerald-700 bg-emerald-900/30 text-emerald-200'
                : 'border border-amber-700 bg-amber-900/30 text-amber-200'}>
                {snapshot.normalization.status}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Captured {new Date(snapshot.retrievedAt).toLocaleString()} ·{' '}
              {snapshot.normalization.intervalCount} six-hour periods
            </p>
            {!normalized && snapshot.normalization.reasonCodes.length > 0 && (
              <p className="mt-2 font-mono text-[11px] text-amber-300">
                {snapshot.normalization.reasonCodes.join(', ')}
              </p>
            )}
          </div>
          <div className="text-left text-[11px] text-muted-foreground sm:text-right">
            <div className="uppercase tracking-wide">NWS · {snapshot.parserVersion}</div>
            <div className="mt-1 font-mono" title={snapshot.payloadSha256}>
              SHA-256 {snapshot.payloadSha256.slice(0, 12)}…
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          No official forecast evidence has been captured for this project.
        </p>
      )}
    </section>
  );
}
