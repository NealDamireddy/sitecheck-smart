/**
 * Block 5 — Single inspection endpoint.
 *
 * GET   /api/inspections/[id]  — fetch one inspection with everything
 *                                 the detail page and the PDF need:
 *                                 weather, linked missions, AI analyses,
 *                                 QSP reviews, corrective actions, findings
 * PATCH /api/inspections/[id]  — partial update; re-computes compliance
 *                                 if anything changed that might affect it
 *
 * The legacy `findings` join from Block 1 is preserved.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { inspectionUpdate } from '@/lib/validations';
import {
  computeComplianceForMissions,
  writeComplianceToInspection,
} from '@/lib/inspection-compliance';
import { log } from '@/lib/logger';

interface DbInspectionRow {
  id: string;
  project_id: string;
  date: string;
  type: string;
  inspector: string;
  weather_temperature: number | null;
  weather_condition: string | null;
  weather_wind_speed_mph: number | null;
  weather_humidity: number | null;
  overall_compliance: number | null;
  mission_id: string | null;
  created_at: string;
  trigger?: string | null;
  trigger_event_id?: string | null;
  due_by?: string | null;
  status?: string | null;
  narrative?: string | null;
  ai_overall_compliance?: number | null;
  qsp_overall_compliance?: number | null;
  report_id?: string | null;
  submitted_at?: string | null;
  updated_at?: string | null;
  checklist_template_id?: string | null;
  checklist_observed_at?: string | null;
  unflagged_items_confirmed?: boolean | null;
  unflagged_items_confirmed_at?: string | null;
  checklist_attested_by_name?: string | null;
  checklist_compliant_count?: number | null;
  checklist_deficient_count?: number | null;
  site_name_snapshot?: string | null;
  wdid_snapshot?: string | null;
  risk_level_snapshot?: number | null;
  construction_stage_snapshot?: string | null;
  photos_taken?: boolean | null;
  checklist_submission_sha256?: string | null;
  inspector_title_snapshot?: string | null;
  qsp_license_number_snapshot?: string | null;
  qsp_company_snapshot?: string | null;
  qpe_start?: string | null;
  qpe_end?: string | null;
  qpe_duration_hours?: number | null;
  rain_gauge_inches?: number | null;
  obs_precipitation?: boolean | null;
  obs_discolorations?: boolean | null;
  obs_odors?: boolean | null;
  obs_turbidity?: boolean | null;
  obs_sheen?: boolean | null;
  obs_floating_material?: boolean | null;
  obs_suspended_material?: boolean | null;
  observation_comments?: string | null;
  exemption_documentation?: string | null;
}

const VALID_STATUSES = new Set(['draft', 'in-progress', 'submitted', 'archived']);

function transformInspection(row: DbInspectionRow, missionIds: string[] = []) {
  return {
    id: row.id,
    projectId: row.project_id,
    date: row.date,
    type: row.type,
    inspector: row.inspector,
    weather: {
      temperature: row.weather_temperature ?? 0,
      condition: row.weather_condition ?? 'clear',
      windSpeedMph: row.weather_wind_speed_mph ?? 0,
      humidity: row.weather_humidity ?? 0,
    },
    overallCompliance: row.overall_compliance ?? 0,
    missionId: row.mission_id ?? undefined,
    createdAt: row.created_at,
    trigger: row.trigger ?? 'manual',
    triggerEventId: row.trigger_event_id ?? undefined,
    dueBy: row.due_by ?? undefined,
    status: row.status ?? 'draft',
    narrative: row.narrative ?? undefined,
    aiOverallCompliance: row.ai_overall_compliance ?? undefined,
    qspOverallCompliance: row.qsp_overall_compliance ?? undefined,
    reportId: row.report_id ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    checklistVersion: row.checklist_template_id ?? undefined,
    checklistObservedAt: row.checklist_observed_at ?? undefined,
    unflaggedItemsConfirmed: row.unflagged_items_confirmed ?? false,
    unflaggedItemsConfirmedAt: row.unflagged_items_confirmed_at ?? undefined,
    checklistAttestedByName: row.checklist_attested_by_name ?? undefined,
    checklistCompliantCount: row.checklist_compliant_count ?? undefined,
    checklistDeficientCount: row.checklist_deficient_count ?? undefined,
    siteNameSnapshot: row.site_name_snapshot ?? undefined,
    wdidSnapshot: row.wdid_snapshot ?? undefined,
    riskLevelSnapshot: row.risk_level_snapshot ?? undefined,
    constructionStageSnapshot: row.construction_stage_snapshot ?? undefined,
    photosTaken: row.photos_taken ?? undefined,
    checklistSubmissionSha256: row.checklist_submission_sha256 ?? undefined,
    inspectorTitleSnapshot: row.inspector_title_snapshot ?? undefined,
    qspLicenseNumberSnapshot: row.qsp_license_number_snapshot ?? undefined,
    qspCompanySnapshot: row.qsp_company_snapshot ?? undefined,
    qpeStart: row.qpe_start ?? undefined,
    qpeEnd: row.qpe_end ?? undefined,
    qpeDurationHours: row.qpe_duration_hours ?? undefined,
    rainGaugeInches: row.rain_gauge_inches ?? undefined,
    observationPrecipitation: row.obs_precipitation ?? undefined,
    observationDiscolorations: row.obs_discolorations ?? undefined,
    observationOdors: row.obs_odors ?? undefined,
    observationTurbidity: row.obs_turbidity ?? undefined,
    observationSheen: row.obs_sheen ?? undefined,
    observationFloatingMaterial: row.obs_floating_material ?? undefined,
    observationSuspendedMaterial: row.obs_suspended_material ?? undefined,
    observationComments: row.observation_comments ?? undefined,
    exemptionDocumentation: row.exemption_documentation ?? undefined,
    missionIds,
  };
}

function transformChecklistResult(row: Record<string, unknown>) {
  return {
    id: row.id,
    inspectionId: row.inspection_id,
    checklistVersion: row.checklist_template_id,
    checklistItemId: row.checklist_item_id,
    categoryNumber: row.category_number,
    categoryTitle: row.category_title,
    itemNumber: row.item_number,
    prompt: row.prompt,
    answer: row.answer,
    answerSource: row.answer_source,
    exceptionDescription: row.exception_description ?? undefined,
    recommendation: row.recommendation ?? undefined,
    identifiedAt: row.identified_at ?? undefined,
    repairStartDueAt: row.repair_start_due_at ?? undefined,
    actionImplementedAt: row.action_implemented_at ?? undefined,
    checkpointIdSnapshot: row.checkpoint_id_snapshot ?? undefined,
    locationSnapshot: row.location_snapshot ?? undefined,
    photoUrls: row.photo_urls ?? [],
    recordedAt: row.recorded_at,
  };
}

function transformChecklistDeficiency(row: Record<string, unknown>) {
  return {
    id: row.id,
    inspectionId: row.inspection_id,
    checklistResultId: row.inspection_checklist_result_id ?? undefined,
    checkpointId: row.checkpoint_id ?? undefined,
    detectedAt: row.detected_date,
    description: row.description,
    recommendation: row.recommendation ?? row.corrective_action,
    repairStartDueAt: row.repair_start_due_at ?? row.deadline,
    repairStartedAt: row.repair_started_at ?? undefined,
    repairCompletedAt: row.repair_completed_at ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    actionImplementedAt: row.action_implemented_at ?? undefined,
    status: row.status,
  };
}

function transformFinding(row: Record<string, unknown>) {
  const checkpoint = row.checkpoints as Record<string, unknown> | null;
  return {
    id: row.id,
    inspectionId: row.inspection_id,
    checkpointId: row.checkpoint_id,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    checkpoint: checkpoint
      ? {
          id: checkpoint.id,
          name: checkpoint.name,
          bmpType: checkpoint.bmp_type,
          zone: checkpoint.zone,
          lat: checkpoint.lat,
          lng: checkpoint.lng,
        }
      : undefined,
  };
}

function transformAnalysis(row: Record<string, unknown>) {
  return {
    id: row.id,
    missionId: row.mission_id,
    waypointNumber: row.waypoint_number,
    checkpointId: row.checkpoint_id,
    photoUrl: row.photo_url,
    summary: row.summary,
    status: row.status,
    confidence: row.confidence,
    details: row.details ?? [],
    cgpReference: row.cgp_reference,
    recommendations: row.recommendations ?? [],
    model: row.model,
    createdAt: row.created_at,
  };
}

function transformReview(row: Record<string, unknown>) {
  return {
    id: row.id,
    missionId: row.mission_id,
    waypointNumber: row.waypoint_number,
    checkpointId: row.checkpoint_id,
    decision: row.decision,
    overrideStatus: row.override_status,
    overrideNotes: row.override_notes,
    aiAnalysisId: row.ai_analysis_id,
    reviewedAt: row.reviewed_at,
  };
}

function transformCorrectiveAction(row: Record<string, unknown>) {
  return {
    id: row.id,
    projectId: row.project_id,
    inspectionId: row.inspection_id ?? undefined,
    missionId: row.mission_id ?? undefined,
    waypointNumber: row.waypoint_number ?? undefined,
    checkpointId: row.checkpoint_id ?? undefined,
    sourceAnalysisId: row.source_analysis_id ?? undefined,
    description: row.description,
    cgpReference: row.cgp_reference ?? undefined,
    severity: row.severity,
    status: row.status,
    dueDate: row.due_date,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    resolutionPhotoUrl: row.resolution_photo_url ?? undefined,
    resolutionNotes: row.resolution_notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ─────────────────────────────────────────────
// GET /api/inspections/[id]
// ─────────────────────────────────────────────
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    // Inspection row
    const { data: inspection, error: inspectionError } = await supabase
      .from('inspections')
      .select('*')
      .eq('id', id)
      .single();

    if (inspectionError) {
      if (inspectionError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
      }
      throw new Error(`Failed to fetch inspection: ${inspectionError.message}`);
    }

    // Linked mission ids
    const { data: linkRows } = await supabase
      .from('inspection_missions')
      .select('mission_id')
      .eq('inspection_id', id);
    const missionIds: string[] = (linkRows ?? []).map((r) => r.mission_id as string);

    // Legacy findings (Block 1 contract)
    const { data: findings } = await supabase
      .from('inspection_findings')
      .select(
        `
        *,
        checkpoints (
          id,
          name,
          bmp_type,
          zone,
          lat,
          lng
        )
      `
      )
      .eq('inspection_id', id)
      .order('created_at', { ascending: true });

    // Block 4 AI analyses + QSP reviews for the linked missions
    let analyses: Array<ReturnType<typeof transformAnalysis>> = [];
    let reviews: Array<ReturnType<typeof transformReview>> = [];
    if (missionIds.length > 0) {
      const { data: analysisRows } = await supabase
        .from('mission_ai_analyses')
        .select('*')
        .in('mission_id', missionIds)
        .order('created_at', { ascending: true });
      analyses = (analysisRows ?? []).map(transformAnalysis);

      const { data: reviewRows } = await supabase
        .from('mission_qsp_reviews')
        .select('*')
        .in('mission_id', missionIds);
      reviews = (reviewRows ?? []).map(transformReview);
    }

    // Block 5 corrective actions tied to this inspection
    const { data: actionRows } = await supabase
      .from('corrective_actions')
      .select('*')
      .eq('inspection_id', id)
      .order('created_at', { ascending: false });
    const correctiveActions = (actionRows ?? []).map(transformCorrectiveAction);

    // Immutable Part 2/3 history. These rows are inspection-scoped and retain
    // copied prompts/details even when the current project or checklist changes.
    const { data: checklistRows, error: checklistError } = await supabase
      .from('inspection_checklist_results')
      .select('*')
      .eq('inspection_id', id)
      .order('category_number', { ascending: true })
      .order('item_number', { ascending: true });
    if (checklistError) {
      throw new Error('Failed to fetch checklist history');
    }

    const { data: deficiencyRows, error: deficiencyError } = await supabase
      .from('deficiencies')
      .select('*')
      .eq('inspection_id', id)
      .order('detected_date', { ascending: true });
    if (deficiencyError) {
      throw new Error('Failed to fetch inspection deficiencies');
    }

    return NextResponse.json({
      ...transformInspection(inspection as DbInspectionRow, missionIds),
      findings: (findings ?? []).map(transformFinding),
      aiAnalyses: analyses,
      qspReviews: reviews,
      correctiveActions,
      checklistResults: (checklistRows ?? []).map(transformChecklistResult),
      deficiencies: (deficiencyRows ?? []).map(transformChecklistDeficiency),
    });
  } catch (error: unknown) {
    log.error('Inspection GET error', { error });
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to fetch inspection' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// PATCH /api/inspections/[id]
// ─────────────────────────────────────────────
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const raw = await request.json();
    const body = inspectionUpdate.parse(raw);

    const updates: Record<string, unknown> = {};

    if (typeof body.narrative === 'string' || body.narrative === null) {
      updates.narrative = body.narrative;
    }
    if (typeof body.inspector === 'string') {
      updates.inspector = body.inspector;
    }
    if (typeof body.status === 'string' && VALID_STATUSES.has(body.status)) {
      updates.status = body.status;
    }
    if (typeof body.dueBy === 'string' || body.dueBy === null) {
      updates.due_by = body.dueBy;
    }
    if (typeof body.reportId === 'string' || body.reportId === null) {
      updates.report_id = body.reportId;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No supported fields in PATCH body' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('inspections')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      log.error('Inspection PATCH error', { error });
      return NextResponse.json(
        { error: 'Failed to update inspection' },
        { status: 500 }
      );
    }

    // Re-resolve mission ids and re-compute compliance — cheap and keeps
    // the numbers honest in case the linked missions changed in parallel
    const { data: linkRows } = await supabase
      .from('inspection_missions')
      .select('mission_id')
      .eq('inspection_id', id);
    const missionIds: string[] = (linkRows ?? []).map((r) => r.mission_id as string);

    const computation = await computeComplianceForMissions(supabase, missionIds);
    await writeComplianceToInspection(supabase, id, computation);

    // Re-read the row so the response reflects the freshly-written compliance
    const { data: refreshed } = await supabase
      .from('inspections')
      .select('*')
      .eq('id', id)
      .single();

    return NextResponse.json(
      transformInspection((refreshed ?? data) as DbInspectionRow, missionIds)
    );
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    log.error('Inspection PATCH error', { error });
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to update inspection' }, { status: 500 });
  }
}
