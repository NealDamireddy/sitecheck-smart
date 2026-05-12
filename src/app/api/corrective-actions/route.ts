/**
 * Block 5 — Corrective actions collection endpoint.
 *
 * GET  /api/corrective-actions?projectId=...&status=...&inspectionId=...
 * POST /api/corrective-actions
 *
 * Closure loop: AI vision flags a finding → QSP creates a corrective
 * action → field worker uploads a proof photo → QSP marks resolved.
 * Each row is the audit trail for one finding-to-resolution event.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { correctiveActionCreate } from '@/lib/validations';
import { DEFAULT_PROJECT_ID } from '@/lib/project-context';

const VALID_SEVERITIES = new Set(['low', 'medium', 'high']);
const VALID_STATUSES = new Set(['open', 'in-progress', 'resolved', 'verified']);

interface DbCorrectiveActionRow {
  id: string;
  project_id: string;
  inspection_id: string | null;
  mission_id: string | null;
  waypoint_number: number | null;
  checkpoint_id: string | null;
  source_analysis_id: string | null;
  description: string;
  cgp_reference: string | null;
  severity: string;
  status: string;
  due_date: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_photo_url: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

function transformCorrectiveAction(row: DbCorrectiveActionRow) {
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

function generateId() {
  return `ca-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ─────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId') || DEFAULT_PROJECT_ID;
    const status = searchParams.get('status');
    const inspectionId = searchParams.get('inspectionId');
    const missionId = searchParams.get('missionId');

    let query = supabase
      .from('corrective_actions')
      .select('*')
      .eq('project_id', projectId)
      .order('due_date', { ascending: true });

    if (status && VALID_STATUSES.has(status)) {
      query = query.eq('status', status);
    }
    if (inspectionId) query = query.eq('inspection_id', inspectionId);
    if (missionId) query = query.eq('mission_id', missionId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as DbCorrectiveActionRow[];
    return NextResponse.json(rows.map(transformCorrectiveAction));
  } catch (err: unknown) {
    console.error('Corrective actions GET error:', err);
    const message = err instanceof Error ? err.message : 'Failed to fetch corrective actions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// POST
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = correctiveActionCreate.parse(await request.json());

    if (!body.description || !body.dueDate) {
      return NextResponse.json(
        { error: 'description and dueDate are required' },
        { status: 400 }
      );
    }

    const severity =
      body.severity && VALID_SEVERITIES.has(body.severity) ? body.severity : 'medium';
    const status =
      body.status && VALID_STATUSES.has(body.status) ? body.status : 'open';

    const insertRow = {
      id: body.id || generateId(),
      project_id: body.projectId || DEFAULT_PROJECT_ID,
      inspection_id: body.inspectionId ?? null,
      mission_id: body.missionId ?? null,
      waypoint_number: body.waypointNumber ?? null,
      checkpoint_id: body.checkpointId ?? null,
      source_analysis_id: body.sourceAnalysisId ?? null,
      description: body.description,
      cgp_reference: body.cgpReference ?? null,
      severity,
      status,
      due_date: body.dueDate,
      resolved_at: body.resolvedAt ?? null,
      resolved_by: body.resolvedBy ?? null,
      resolution_photo_url: body.resolutionPhotoUrl ?? null,
      resolution_notes: body.resolutionNotes ?? null,
    };

    const { data, error } = await supabase
      .from('corrective_actions')
      .insert(insertRow)
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Insert returned no row');
    }

    // Activity event
    await supabase.from('activity_events').insert({
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      project_id: insertRow.project_id,
      type: 'corrective-action',
      title: 'Corrective Action Created',
      description: `${severity.toUpperCase()} severity — ${body.description.slice(0, 80)}`,
      timestamp: new Date().toISOString(),
      severity: severity === 'high' ? 'warning' : 'info',
      linked_entity_id: insertRow.id,
      linked_entity_type: 'corrective-action',
    });

    return NextResponse.json(
      transformCorrectiveAction(data as DbCorrectiveActionRow),
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error('Corrective actions POST error:', err);
    const message = err instanceof Error ? err.message : 'Failed to create corrective action';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
