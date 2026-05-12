'use client';

/**
 * Block 4 — ReportReadinessGate
 *
 * Reads review counts from the persisted `mission_qsp_reviews` store, falling
 * back to the legacy in-memory `useDroneStore.checkpointReviews` map for any
 * waypoint without a persisted row. Also surfaces a one-click "Analyze all"
 * button when one or more captured waypoints don't yet have an AI analysis.
 */

import { useState } from 'react';
import { FileBarChart, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useDroneStore } from '@/stores/drone-store';
import { useMissionAIAnalysesStore } from '@/stores/mission-ai-analyses-store';
import { useMissionQSPReviewsStore } from '@/stores/mission-qsp-reviews-store';
import { REPORT_READINESS_LABELS, REPORT_READINESS_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { DroneMission } from '@/types/drone';

interface ReportReadinessGateProps {
  mission: DroneMission;
  onGenerateReport: () => void;
  loading?: boolean;
}

export function ReportReadinessGate({
  mission,
  onGenerateReport,
  loading,
}: ReportReadinessGateProps) {
  const { checkpointReviews, getReportReadiness } = useDroneStore();
  const persistedReviews = useMissionQSPReviewsStore((s) =>
    s.getForMission(mission.id)
  );
  const persistedAnalyses = useMissionAIAnalysesStore((s) =>
    s.getForMission(mission.id)
  );
  const analyzeWaypoint = useMissionAIAnalysesStore((s) => s.analyzeWaypoint);

  const [analyzeAllRunning, setAnalyzeAllRunning] = useState(false);

  const readiness = getReportReadiness(mission.id);
  const colors = REPORT_READINESS_COLORS[readiness];

  const enabledWaypoints = mission.waypoints.filter((wp) => wp.enabled !== false);
  const reviewedCount = enabledWaypoints.filter((wp) => {
    const persisted = persistedReviews[wp.number];
    if (persisted && persisted.decision !== 'pending') return true;
    const legacy = checkpointReviews[wp.checkpointId];
    return !!(legacy && legacy.decision !== 'pending');
  }).length;
  const totalCount = enabledWaypoints.length;
  const progressPct = totalCount > 0 ? (reviewedCount / totalCount) * 100 : 0;

  // Block 4 — captured waypoints without an AI analysis row.
  const analyzedNumbers = new Set(persistedAnalyses.map((a) => a.waypointNumber));
  const capturedWithoutAnalysis = enabledWaypoints.filter(
    (wp) =>
      wp.captureStatus === 'captured' &&
      !analyzedNumbers.has(wp.number) &&
      ((wp.photos && wp.photos.length > 0) || !!wp.photo)
  );

  async function handleAnalyzeAll() {
    if (capturedWithoutAnalysis.length === 0) return;
    setAnalyzeAllRunning(true);
    try {
      // Run sequentially to avoid spamming the LLM API.
      for (const wp of capturedWithoutAnalysis) {
        await analyzeWaypoint(mission.id, wp.number);
      }
    } finally {
      setAnalyzeAllRunning(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Progress */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Review Progress
          </span>
          <span className={cn('text-xs font-semibold', colors.text)}>
            {reviewedCount} / {totalCount}
          </span>
        </div>
        <Progress
          value={progressPct}
          className={cn(
            'w-full h-1.5',
            readiness === 'ready'
              ? '[&_[data-slot=progress-indicator]]:bg-green-500'
              : readiness === 'partially-reviewed'
                ? '[&_[data-slot=progress-indicator]]:bg-amber-500'
                : '[&_[data-slot=progress-indicator]]:bg-gray-500'
          )}
        />
      </div>

      {/* Block 4 — Analyze-all helper. Surfaces only when at least one
          captured waypoint is missing its AI analysis row. */}
      {capturedWithoutAnalysis.length > 0 && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 flex items-center justify-between gap-2">
          <p className="text-[10px] text-amber-200/90 leading-tight">
            {capturedWithoutAnalysis.length} captured waypoint
            {capturedWithoutAnalysis.length === 1 ? '' : 's'} not yet analyzed
            by Claude.
          </p>
          <Button
            size="xs"
            variant="outline"
            disabled={analyzeAllRunning}
            onClick={handleAnalyzeAll}
            className="gap-1 text-[10px] h-6 border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
          >
            {analyzeAllRunning ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Analyze all
          </Button>
        </div>
      )}

      {/* Status + Action */}
      <div className="flex items-center justify-between">
        <span className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold',
          colors.bg, colors.text, colors.border,
        )}>
          {REPORT_READINESS_LABELS[readiness]}
        </span>

        <Button
          size="sm"
          className="gap-1.5"
          disabled={readiness !== 'ready' || loading || capturedWithoutAnalysis.length > 0}
          onClick={onGenerateReport}
          title={
            capturedWithoutAnalysis.length > 0
              ? 'Analyze all captured waypoints with Claude before generating the report'
              : undefined
          }
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileBarChart className="h-3.5 w-3.5" />
          )}
          Generate Report
        </Button>
      </div>
    </div>
  );
}
