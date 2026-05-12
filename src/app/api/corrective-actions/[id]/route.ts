/**
 * Block 5 — Corrective action mutate endpoints.
 *
 * GET    /api/corrective-actions/[id]
 * PATCH  /api/corrective-actions/[id]
 *
 * The PATCH handler accepts any subset of: status, severity,
 * resolutionNotes, resolutionPhotoUrl, resolvedBy, resolvedAt, dueDate,
 * description, cgpReference. When the new status is `resolved` or
 * `verified` and the caller didn't pass `resolvedAt`, we stamp it
 * server-side so the audit trail stays clean.
 *
 * No DELETE handler — corrective actions are part of the regulatory
 * audit trail and should never be hard-deleted. Use status='archived'
 * if a future block needs that.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { correctiveActionUpdate } from '@/lib/validations';

const VALID_SEVERITIES = new Set(['low', 'medium', 'high']);
const VALID_STATUSES = new Set(['open', 'in-progress', 'resolved', 'verified']);

interface RouteContext {
  params: Promise<{ id: string }>;
}

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

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const { data, error } = await supabase
      .from('corrective_actions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(
      transformCorrectiveAction(data as DbCorrectiveActionRow)
    );
  } catch (err: unknown) {
    console.error('Corrective action GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = correctiveActionUpdate.parse(await request.json());

    const updates: Record<string, unknown> = {};
    if (typeof body.description === 'string') updates.description = body.description;
    if (typeof body.cgpReference === 'string') updates.cgp_reference = body.cgpReference;
    if (typeof body.dueDate === 'string') updates.due_date = body.dueDate;
    if (typeof body.resolutionNotes === 'string') updates.resolution_notes = body.resolutionNotes;
    if (typeof body.resolutionPhotoUrl === 'string') updates.resolution_photo_url = body.resolutionPhotoUrl;
    if (typeof body.resolvedBy === 'string') updates.resolved_by = body.resolvedBy;
    if (typeof body.resolvedAt === 'string') updates.resolved_at = body.resolvedAt;

    if (typeof body.severity === 'string' && VALID_SEVERITIES.has(body.severity)) {
      updates.severity = body.severity;
    }

    if (typeof body.status === 'string' && VALID_STATUSES.has(body.status)) {
      updates.status = body.status;
      // Auto-stamp resolved_at on resolution if the caller didn't set it.
      if (
        (body.status === 'resolved' || body.status === 'verified') &&
        !body.resolvedAt
      ) {
        updates.resolved_at = new Date().toISOString();
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('corrective_actions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      console.error('Corrective action PATCH failed:', error);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    // Activity event for resolution events
    if (updates.status === 'resolved' || updates.status === 'verified') {
      await supabase.from('activity_events').insert({
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        project_id: data.project_id,
        type: 'corrective-action',
        title: `Corrective Action ${updates.status === 'verified' ? 'Verified' : 'Resolved'}`,
        description: `${data.description?.slice(0, 80) ?? ''}`,
        timestamp: new Date().toISOString(),
        severity: 'info',
        linked_entity_id: data.id,
        linked_entity_type: 'corrective-action',
      });
    }

    return NextResponse.json(
      transformCorrectiveAction(data as DbCorrectiveActionRow)
    );
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error('Corrective action PATCH error:', err);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
