/**
 * Block 4 — POST /api/missions/[id]/waypoints/[number]/analyze
 *
 * Loads the captured photo for one waypoint, hands it to Claude vision, and
 * upserts the result into `mission_ai_analyses` (UNIQUE on
 * `(mission_id, waypoint_number)`).
 *
 * Body: `{ photoIndex?: number, hint?: string }`. `photoIndex` defaults to the
 * last entry in `waypoints.photos`.
 *
 * Returns the persisted `MissionAIAnalysis`.
 *
 * Falls back to a deterministic seeded mock when ANTHROPIC_API_KEY is missing
 * (handled inside `analyzeBmpPhoto`), so the demo runs end-to-end without
 * consuming API credits.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { ZodError } from 'zod';
import { waypointAnalyze } from '@/lib/validations';
import { analyzeBmpPhoto, mockAnalyzeBmpPhoto, type AnalyzeBmpPhotoResult } from '@/lib/ai-vision';
import type { CheckpointStatus } from '@/types/checkpoint';

interface RouteContext {
  params: Promise<{ id: string; number: string }>;
}

interface AnalyzeBody {
  photoIndex?: number;
  hint?: string;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: missionId, number } = await context.params;
    const waypointNumber = Number(number);
    if (Number.isNaN(waypointNumber)) {
      return NextResponse.json({ error: 'Invalid waypoint number' }, { status: 400 });
    }

    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    let rawBody: unknown = undefined;
    try {
      rawBody = await request.json();
    } catch {
      // empty body is fine
    }
    const body: AnalyzeBody = waypointAnalyze.parse(rawBody) ?? {};

    // Look up the waypoint + its checkpoint metadata
    const { data: waypoint, error: wpErr } = await supabase
      .from('waypoints')
      .select('*')
      .eq('mission_id', missionId)
      .eq('number', waypointNumber)
      .single();

    if (wpErr || !waypoint) {
      return NextResponse.json({ error: 'Waypoint not found' }, { status: 404 });
    }

    const photos: string[] = Array.isArray(waypoint.photos) ? waypoint.photos : [];
    const photoIndex = body.photoIndex ?? photos.length - 1;
    const photoUrl = photos[photoIndex] ?? waypoint.photo;
    if (!photoUrl) {
      return NextResponse.json({ error: 'No photo to analyze' }, { status: 400 });
    }

    const { data: checkpoint, error: cpErr } = await supabase
      .from('checkpoints')
      .select('*')
      .eq('id', waypoint.checkpoint_id)
      .single();

    if (cpErr || !checkpoint) {
      return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 });
    }

    // Run Claude vision (or mock if key missing)
    let result: AnalyzeBmpPhotoResult;
    try {
      result = await analyzeBmpPhoto({
        photoUrl,
        checkpointId: checkpoint.id,
        checkpointName: checkpoint.name ?? 'Unknown checkpoint',
        bmpCategory: checkpoint.bmp_type ?? 'general',
        cgpSection: checkpoint.cgp_section ?? '',
        currentStatus: (checkpoint.status as CheckpointStatus) ?? 'needs-review',
        hint: body.hint,
      });
    } catch (err) {
      console.warn('Claude vision failed, falling back to mock:', err);
      result = mockAnalyzeBmpPhoto({
        photoUrl,
        checkpointId: checkpoint.id,
        checkpointName: checkpoint.name ?? 'Unknown checkpoint',
        bmpCategory: checkpoint.bmp_type ?? 'general',
        cgpSection: checkpoint.cgp_section ?? '',
        currentStatus: (checkpoint.status as CheckpointStatus) ?? 'needs-review',
        hint: body.hint,
      });
    }

    // Upsert into mission_ai_analyses
    const id = `aia-${missionId}-${waypointNumber}`;
    const row = {
      id,
      mission_id: missionId,
      waypoint_number: waypointNumber,
      checkpoint_id: checkpoint.id,
      photo_url: photoUrl,
      summary: result.summary,
      status: result.status,
      confidence: Math.max(0, Math.min(100, Math.round(result.confidence))),
      details: result.details,
      cgp_reference: result.cgpReference,
      recommendations: result.recommendations,
      model: result.model,
      raw_response: result.rawResponse as object | null,
      created_at: new Date().toISOString(),
    };

    const { data: persisted, error: upsertErr } = await supabase
      .from('mission_ai_analyses')
      .upsert(row, { onConflict: 'mission_id,waypoint_number' })
      .select()
      .single();

    if (upsertErr || !persisted) {
      // Persistence failed but we still have the analysis — return it
      console.error('mission_ai_analyses upsert failed:', upsertErr);
      return NextResponse.json({
        id,
        missionId,
        waypointNumber,
        checkpointId: checkpoint.id,
        photoUrl,
        summary: result.summary,
        status: result.status,
        confidence: result.confidence,
        details: result.details,
        cgpReference: result.cgpReference,
        recommendations: result.recommendations,
        model: result.model,
        createdAt: row.created_at,
      });
    }

    return NextResponse.json({
      id: persisted.id,
      missionId: persisted.mission_id,
      waypointNumber: persisted.waypoint_number,
      checkpointId: persisted.checkpoint_id,
      photoUrl: persisted.photo_url,
      summary: persisted.summary,
      status: persisted.status,
      confidence: persisted.confidence,
      details: persisted.details ?? [],
      cgpReference: persisted.cgp_reference,
      recommendations: persisted.recommendations ?? [],
      model: persisted.model,
      createdAt: persisted.created_at,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.issues }, { status: 400 });
    }
    console.error('analyze POST failed:', err);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
