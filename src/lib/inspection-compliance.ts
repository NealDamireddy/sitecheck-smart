/**
 * Block 5 — Single source of truth for inspection compliance percentages.
 *
 * Used by:
 *   * /api/inspections                  (POST: initial values)
 *   * /api/inspections/[id]             (PATCH: re-compute on update)
 *   * /api/inspections/[id]/missions    (POST/DELETE: re-compute on link change)
 *   * /api/reports/generate             (Block 5 path: AI Findings section)
 *   * /api/inspections/[id]/pdf         (PDF render)
 *
 * The detail page and the PDF must always show the same numbers, so they
 * both go through this one helper.
 *
 * Definitions:
 *   * AI compliance         — % of AI-analyzed waypoints whose Claude
 *                              verdict is `compliant`
 *   * QSP compliance        — same denominator, but the QSP override wins
 *                              over the AI verdict; falls back to the AI
 *                              verdict for waypoints with no QSP review
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ComplianceComputation {
  /** 0-100, integer; null when there are no analyzed waypoints */
  aiOverallCompliance: number | null;
  /** 0-100, integer; falls back to AI when no QSP review exists */
  qspOverallCompliance: number | null;
  totalAnalyzed: number;
  aiCompliantCount: number;
  aiDeficientCount: number;
  aiNeedsReviewCount: number;
  qspCompliantCount: number;
  qspDeficientCount: number;
  qspNeedsReviewCount: number;
}

const EMPTY_COMPUTATION: ComplianceComputation = {
  aiOverallCompliance: null,
  qspOverallCompliance: null,
  totalAnalyzed: 0,
  aiCompliantCount: 0,
  aiDeficientCount: 0,
  aiNeedsReviewCount: 0,
  qspCompliantCount: 0,
  qspDeficientCount: 0,
  qspNeedsReviewCount: 0,
};

type AnalysisRow = {
  id: string;
  mission_id: string;
  waypoint_number: number;
  status: string;
};

type ReviewRow = {
  mission_id: string;
  waypoint_number: number;
  decision: string;
  override_status: string | null;
};

function pct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100);
}

/**
 * Compute compliance for one inspection by reading every linked mission's
 * AI analyses and QSP reviews.
 *
 * Returns a fully zeroed computation when nothing is linked yet, so the
 * caller can safely write the result back to the inspections row even
 * before any photos are analyzed.
 */
export async function computeInspectionCompliance(
  supabase: SupabaseClient,
  inspectionId: string
): Promise<ComplianceComputation> {
  // Step 1 — pull the linked mission ids
  const { data: linkRows, error: linkError } = await supabase
    .from('inspection_missions')
    .select('mission_id')
    .eq('inspection_id', inspectionId);

  if (linkError || !linkRows || linkRows.length === 0) {
    return EMPTY_COMPUTATION;
  }

  const missionIds = Array.from(
    new Set(linkRows.map((row) => row.mission_id as string))
  );

  return computeComplianceForMissions(supabase, missionIds);
}

/**
 * Convenience variant that takes mission ids directly. Used by the
 * `POST /api/inspections` route which already knows the missions before
 * the inspection_missions rows have been written.
 */
export async function computeComplianceForMissions(
  supabase: SupabaseClient,
  missionIds: readonly string[]
): Promise<ComplianceComputation> {
  if (missionIds.length === 0) {
    return EMPTY_COMPUTATION;
  }

  // Step 2 — pull every analysis for these missions
  const { data: analysisRows } = await supabase
    .from('mission_ai_analyses')
    .select('id, mission_id, waypoint_number, status')
    .in('mission_id', missionIds as string[]);

  const analyses: AnalysisRow[] = (analysisRows ?? []) as AnalysisRow[];
  if (analyses.length === 0) {
    return EMPTY_COMPUTATION;
  }

  // Step 3 — pull QSP reviews for these missions
  const { data: reviewRows } = await supabase
    .from('mission_qsp_reviews')
    .select('mission_id, waypoint_number, decision, override_status')
    .in('mission_id', missionIds as string[]);

  const reviews: ReviewRow[] = (reviewRows ?? []) as ReviewRow[];
  const reviewByKey = new Map<string, ReviewRow>();
  for (const review of reviews) {
    reviewByKey.set(`${review.mission_id}:${review.waypoint_number}`, review);
  }

  let aiCompliant = 0;
  let aiDeficient = 0;
  let aiNeedsReview = 0;
  let qspCompliant = 0;
  let qspDeficient = 0;
  let qspNeedsReview = 0;

  for (const analysis of analyses) {
    // AI side
    switch (analysis.status) {
      case 'compliant':
        aiCompliant += 1;
        break;
      case 'deficient':
        aiDeficient += 1;
        break;
      default:
        aiNeedsReview += 1;
        break;
    }

    // QSP side — override wins, then accept (= AI verdict), then default
    // back to the AI verdict for waypoints with no review row at all.
    const review = reviewByKey.get(
      `${analysis.mission_id}:${analysis.waypoint_number}`
    );
    let effectiveStatus: string = analysis.status;
    if (review) {
      if (review.decision === 'override' && review.override_status) {
        effectiveStatus = review.override_status;
      } else if (review.decision === 'accept') {
        effectiveStatus = analysis.status;
      } else {
        // 'pending' — treat as the AI verdict so the percentage doesn't
        // collapse to 0% just because the QSP hasn't clicked yet
        effectiveStatus = analysis.status;
      }
    }
    switch (effectiveStatus) {
      case 'compliant':
        qspCompliant += 1;
        break;
      case 'deficient':
        qspDeficient += 1;
        break;
      default:
        qspNeedsReview += 1;
        break;
    }
  }

  const totalAnalyzed = analyses.length;
  return {
    totalAnalyzed,
    aiCompliantCount: aiCompliant,
    aiDeficientCount: aiDeficient,
    aiNeedsReviewCount: aiNeedsReview,
    qspCompliantCount: qspCompliant,
    qspDeficientCount: qspDeficient,
    qspNeedsReviewCount: qspNeedsReview,
    aiOverallCompliance: pct(aiCompliant, totalAnalyzed),
    qspOverallCompliance: pct(qspCompliant, totalAnalyzed),
  };
}

/**
 * Persist the computed compliance numbers back onto the inspections row.
 * Caller is responsible for invoking this after any link change.
 */
export async function writeComplianceToInspection(
  supabase: SupabaseClient,
  inspectionId: string,
  computation: ComplianceComputation
): Promise<void> {
  await supabase
    .from('inspections')
    .update({
      ai_overall_compliance: computation.aiOverallCompliance,
      qsp_overall_compliance: computation.qspOverallCompliance,
    })
    .eq('id', inspectionId);
}
