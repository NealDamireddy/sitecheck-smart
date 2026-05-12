/**
 * Block 4 — QSP review persistence for mission checkpoint cards.
 *
 * GET  /api/missions/[id]/reviews             — list all reviews for the mission
 * POST /api/missions/[id]/reviews             — upsert one review
 *
 * POST body shape:
 *   {
 *     waypointNumber: number,
 *     checkpointId: string,
 *     decision: 'accept' | 'override' | 'pending',
 *     overrideStatus?: string,
 *     overrideNotes?: string,
 *     aiAnalysisId?: string,
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { ZodError } from 'zod';
import { missionReviewCreate } from '@/lib/validations';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface UpsertBody {
  waypointNumber: number;
  checkpointId: string;
  decision: 'accept' | 'override' | 'pending';
  overrideStatus?: string;
  overrideNotes?: string;
  aiAnalysisId?: string;
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

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id: missionId } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { data, error } = await supabase
      .from('mission_qsp_reviews')
      .select('*')
      .eq('mission_id', missionId);
    if (error) {
      return NextResponse.json([]);
    }
    return NextResponse.json((data ?? []).map(transformReview));
  } catch (err) {
    console.error('reviews GET failed:', err);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: missionId } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const raw = await request.json();
    const body = missionReviewCreate.parse(raw);
    const id = `qsp-${missionId}-${body.waypointNumber}`;
    const row = {
      id,
      mission_id: missionId,
      waypoint_number: body.waypointNumber,
      checkpoint_id: body.checkpointId,
      decision: body.decision,
      override_status: body.overrideStatus ?? null,
      override_notes: body.overrideNotes ?? null,
      ai_analysis_id: body.aiAnalysisId ?? null,
      reviewed_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('mission_qsp_reviews')
      .upsert(row, { onConflict: 'mission_id,waypoint_number' })
      .select()
      .single();

    if (error || !data) {
      // Mock fallback — return the input so the UI keeps the local edit
      return NextResponse.json(transformReview(row));
    }

    return NextResponse.json(transformReview(data));
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.issues }, { status: 400 });
    }
    console.error('reviews POST failed:', err);
    return NextResponse.json({ error: 'Review save failed' }, { status: 500 });
  }
}
