'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCheck,
  ClipboardList,
  FileText,
  Loader2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useActiveInspectionStore } from '@/stores/active-inspection-store';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { useProjectStore } from '@/stores/project-store';
import { useReportStore } from '@/stores/report-store';
import { cn } from '@/lib/utils';

/**
 * Persistent banner shown on /checkpoints while an inspection is in
 * progress. Surfaces the visit type, time started, reviewed-count
 * progress, and the Generate Report CTA. The CTA unlocks once every
 * checkpoint has been touched OR the QSP explicitly accepts the
 * remaining BMPs in bulk via "Mark review complete".
 */
export function ActiveInspectionBanner() {
  const router = useRouter();
  const inspectionId = useActiveInspectionStore((s) => s.inspectionId);
  const visit = useActiveInspectionStore((s) => s.visit);
  const visitLabel = useActiveInspectionStore((s) => s.visitLabel)();
  const projectIdOnInspection = useActiveInspectionStore((s) => s.projectId);
  const reviewedIds = useActiveInspectionStore((s) => s.reviewedIds);
  const markedComplete = useActiveInspectionStore((s) => s.markedComplete);
  const markComplete = useActiveInspectionStore((s) => s.markComplete);
  const clear = useActiveInspectionStore((s) => s.clear);

  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const checkpoints = useCheckpointStore((s) => s.checkpoints);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCheckpoints = checkpoints.length;
  const reviewedCount = useMemo(
    () =>
      checkpoints.reduce(
        (acc, cp) => acc + (reviewedIds.has(cp.id) ? 1 : 0),
        0
      ),
    [checkpoints, reviewedIds]
  );

  // Hide when no active inspection — or when the active inspection
  // belongs to a different project (the QSP switched sites without
  // ending the in-progress visit).
  if (!inspectionId || !visit || visit === 'during-storm') return null;
  if (projectIdOnInspection && currentProjectId && projectIdOnInspection !== currentProjectId) {
    return null;
  }

  const allTouched = totalCheckpoints > 0 && reviewedCount >= totalCheckpoints;
  const canGenerate = allTouched || markedComplete;

  async function handleGenerate() {
    if (!currentProjectId || !inspectionId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProjectId,
          inspectionId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const report = await res.json();
      // Prefill the report store so /reports renders this just-generated
      // report instead of triggering its on-mount "no sections yet,
      // regenerate" effect (which would discard the inspectionId scope).
      useReportStore.setState({
        reportId: report.id ?? null,
        sections: report.sections ?? [],
        signed: !!report.signed,
        signedBy: report.signedBy ?? null,
        signedDate: report.signedDate ?? null,
        loading: false,
        error: null,
      });
      // Inspection has been written through to a report; clear the
      // banner so the QSP returns to a clean dashboard next time.
      clear();
      router.push('/reports');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-amber-100">
                {visitLabel} in progress
              </h2>
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-200">
                {reviewedCount} of {totalCheckpoints} reviewed
              </span>
              {markedComplete && !allTouched && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-200">
                  Marked complete
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-amber-200/80">
              Mark each BMP compliant, deficient, or needs-review. When you&apos;re done,
              generate the report.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!markedComplete && !allTouched && totalCheckpoints > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markComplete}
              className="border-amber-500/40 text-amber-100 hover:bg-amber-500/10"
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              Mark review complete
            </Button>
          )}
          <Button
            size="sm"
            disabled={!canGenerate || generating}
            onClick={handleGenerate}
            className={cn(
              'bg-amber-500 text-amber-950 hover:bg-amber-400',
              (!canGenerate || generating) && 'opacity-50'
            )}
          >
            {generating ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <FileText className="mr-1 h-3.5 w-3.5" />
                Generate Report
              </>
            )}
          </Button>
          <button
            type="button"
            onClick={clear}
            title="Cancel inspection"
            aria-label="Cancel inspection"
            className="rounded p-1.5 text-amber-200/70 transition-colors hover:bg-amber-500/10 hover:text-amber-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
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
