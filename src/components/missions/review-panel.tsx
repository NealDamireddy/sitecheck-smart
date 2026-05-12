'use client';

/**
 * Block 4 — ReviewPanel
 *
 * Reads AI analyses from the persisted `mission_ai_analyses` table via
 * `useMissionAIAnalysesStore` (no longer the static `src/data/ai-analyses.ts`
 * fixture) and persists QSP decisions through the new `mission_qsp_reviews`
 * upsert API via `useMissionQSPReviewsStore`.
 *
 * Falls back to the legacy in-memory `useDroneStore.checkpointReviews` map
 * for any waypoint without a persisted row, so partially-migrated missions
 * continue to render their decisions.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { CheckpointReviewCard } from './checkpoint-review-card';
import { ReportReadinessGate } from './report-readiness-gate';
import { useDroneStore } from '@/stores/drone-store';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { useReportStore } from '@/stores/report-store';
import { useMissionAIAnalysesStore } from '@/stores/mission-ai-analyses-store';
import { useMissionQSPReviewsStore } from '@/stores/mission-qsp-reviews-store';
import { cn } from '@/lib/utils';
import type {
  AIAnalysis,
  DroneMission,
  QSPReviewDecision,
  QSPReviewEntry,
  Waypoint,
} from '@/types/drone';
import type { CheckpointStatus } from '@/types/checkpoint';

interface ReviewPanelProps {
  mission: DroneMission;
}

type FilterTab = 'all' | 'needs-review' | 'deficient' | 'reviewed';

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'needs-review', label: 'Needs Review' },
  { value: 'deficient', label: 'Deficient' },
  { value: 'reviewed', label: 'Reviewed' },
];

export function ReviewPanel({ mission }: ReviewPanelProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [reportLoading, setReportLoading] = useState(false);

  const { checkpointReviews, setReviewDecision } = useDroneStore();
  const { checkpoints, fetchCheckpoints } = useCheckpointStore();
  const { generateReport } = useReportStore();

  // Block 4 — persisted AI analyses + QSP reviews
  const persistedAnalyses = useMissionAIAnalysesStore((s) =>
    s.getForMission(mission.id)
  );
  const fetchAnalyses = useMissionAIAnalysesStore((s) => s.fetchForMission);
  const analyzeWaypoint = useMissionAIAnalysesStore((s) => s.analyzeWaypoint);
  const isAnalyzing = useMissionAIAnalysesStore((s) => s.isAnalyzing);

  const persistedReviews = useMissionQSPReviewsStore((s) =>
    s.getForMission(mission.id)
  );
  const fetchReviews = useMissionQSPReviewsStore((s) => s.fetchForMission);
  const setPersistedDecision = useMissionQSPReviewsStore((s) => s.setDecision);

  // Fetch checkpoints on mount if not loaded
  useEffect(() => {
    if (checkpoints.length === 0) {
      fetchCheckpoints();
    }
  }, [checkpoints.length, fetchCheckpoints]);

  // Block 4 — fetch persisted analyses + reviews on mount
  useEffect(() => {
    fetchAnalyses(mission.id);
    fetchReviews(mission.id);
  }, [mission.id, fetchAnalyses, fetchReviews]);

  // Build a lookup map for checkpoints
  const checkpointMap = useMemo(() => {
    const map: Record<string, (typeof checkpoints)[0]> = {};
    for (const cp of checkpoints) {
      map[cp.id] = cp;
    }
    return map;
  }, [checkpoints]);

  // Block 4 — analysis lookup keyed by waypoint number (NOT checkpoint id)
  // because two waypoints visiting the same checkpoint must hold distinct
  // analyses.
  const analysisByWaypoint = useMemo(() => {
    const map: Record<number, (typeof persistedAnalyses)[number]> = {};
    for (const a of persistedAnalyses) {
      map[a.waypointNumber] = a;
    }
    return map;
  }, [persistedAnalyses]);

  // Enabled waypoints only
  const enabledWaypoints = useMemo(
    () => mission.waypoints.filter((wp) => wp.enabled !== false),
    [mission.waypoints]
  );

  // Resolve the analysis for a given waypoint, preferring the persisted row
  // and falling back to the bundled `wp.aiAssessment` fixture.
  const getAnalysisFor = useMemo(
    () =>
      (wp: Waypoint): AIAnalysis | null => {
        const persisted = analysisByWaypoint[wp.number];
        if (persisted) return persisted;
        if (wp.aiAssessment) return wp.aiAssessment;
        return null;
      },
    [analysisByWaypoint]
  );

  // Resolve the review for a given waypoint, preferring the persisted row.
  const getReviewFor = useMemo(
    () =>
      (wp: Waypoint): QSPReviewEntry | undefined => {
        const persisted = persistedReviews[wp.number];
        if (persisted) {
          return {
            checkpointId: persisted.checkpointId,
            waypointNumber: persisted.waypointNumber,
            aiAnalysis:
              getAnalysisFor(wp) ?? {
                checkpointId: persisted.checkpointId,
                summary: '',
                status: 'needs-review',
                confidence: 0,
                details: [],
                cgpReference: '',
              },
            decision: persisted.decision,
            overrideStatus: persisted.overrideStatus,
            overrideNotes: persisted.overrideNotes,
            reviewedAt: persisted.reviewedAt,
          };
        }
        return checkpointReviews[wp.checkpointId];
      },
    [persistedReviews, checkpointReviews, getAnalysisFor]
  );

  // Filter waypoints by tab
  const filteredWaypoints = useMemo(() => {
    return enabledWaypoints.filter((wp) => {
      const review = getReviewFor(wp);
      const analysis = getAnalysisFor(wp);

      switch (activeTab) {
        case 'needs-review':
          return !review || review.decision === 'pending';
        case 'deficient':
          return analysis?.status === 'deficient';
        case 'reviewed':
          return review && review.decision !== 'pending';
        default:
          return true;
      }
    });
  }, [enabledWaypoints, activeTab, getReviewFor, getAnalysisFor]);

  async function handleGenerateReport() {
    setReportLoading(true);
    try {
      await generateReport();
      router.push('/reports');
    } catch {
      setReportLoading(false);
    }
  }

  return (
    <Card className="border-border bg-surface">
      <CardContent className="pt-4 space-y-4">
        <div>
          <p className="text-xs font-medium text-foreground mb-1">
            Checkpoint Review
          </p>
          <p className="text-[10px] text-muted-foreground">
            Review AI findings and approve or override before generating report.
          </p>
        </div>

        {/* Report readiness */}
        <ReportReadinessGate
          mission={mission}
          onGenerateReport={handleGenerateReport}
          loading={reportLoading}
        />

        {/* Filter tabs */}
        <div className="flex items-center gap-1 border-b border-border pb-2">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition-all',
                activeTab === tab.value
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-elevated'
              )}
            >
              {tab.label}
              {tab.value === 'needs-review' && (
                <span className="ml-1 text-[9px] opacity-60">
                  (
                  {
                    enabledWaypoints.filter((wp) => {
                      const r = getReviewFor(wp);
                      return !r || r.decision === 'pending';
                    }).length
                  }
                  )
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Checkpoint review cards */}
        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {filteredWaypoints.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              No checkpoints match this filter.
            </p>
          )}
          {filteredWaypoints.map((wp) => {
            const checkpoint = checkpointMap[wp.checkpointId] ?? null;
            const analysis = getAnalysisFor(wp);
            const review = getReviewFor(wp);
            const persistedAnalysisId = analysisByWaypoint[wp.number]?.id;

            return (
              <CheckpointReviewCard
                key={`${wp.number}-${wp.checkpointId}`}
                waypoint={wp}
                checkpoint={checkpoint}
                analysis={analysis}
                review={review}
                analyzing={isAnalyzing(mission.id, wp.number)}
                onReanalyze={async (hint?: string) => {
                  await analyzeWaypoint(mission.id, wp.number, { hint });
                }}
                onReviewChange={(
                  decision: QSPReviewDecision,
                  overrideStatus?: CheckpointStatus,
                  notes?: string
                ) => {
                  // Persist via the new store
                  setPersistedDecision(
                    mission.id,
                    wp.number,
                    wp.checkpointId,
                    decision,
                    overrideStatus,
                    notes,
                    persistedAnalysisId
                  );
                  // Mirror into the legacy in-memory map so any unmigrated
                  // consumers (ReportReadinessGate's drone-store-driven
                  // counter, in particular) stay in sync this render.
                  setReviewDecision(
                    wp.checkpointId,
                    wp.number,
                    analysis ?? {
                      checkpointId: wp.checkpointId,
                      summary: '',
                      status: 'needs-review' as CheckpointStatus,
                      confidence: 0,
                      details: [],
                      cgpReference: '',
                    },
                    decision,
                    overrideStatus,
                    notes
                  );
                }}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
