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
    missionIds,
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

    return NextResponse.json({
      ...transformInspection(inspection as DbInspectionRow, missionIds),
      findings: (findings ?? []).map(transformFinding),
      aiAnalyses: analyses,
      qspReviews: reviews,
      correctiveActions,
    });
  } catch (error: unknown) {
    console.error('Inspection GET error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch inspection';
    return NextResponse.json({ error: message }, { status: 500 });
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
      console.error('Inspection PATCH error:', error);
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
    console.error('Inspection PATCH error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update inspection';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
