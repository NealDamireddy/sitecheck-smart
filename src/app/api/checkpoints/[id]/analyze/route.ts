/**
 * POST /api/checkpoints/[id]/analyze
 *
 * Runs Claude vision on a checkpoint's most recent photo and persists the
 * result as a row in `ai_analyses`. Triggered automatically from the
 * checkpoint photo uploader after a successful upload, but also safe to
 * call manually to re-analyze.
 *
 * Photo source priority:
 *   1. `qsp_photo_url`  (the field photo the QSP just uploaded)
 *   2. `last_inspection_photo` (the existing drone view, fallback for
 *      demo / pre-QSP-upload sites)
 *
 * Demo deployments with no ANTHROPIC_API_KEY get the deterministic mock
 * (tagged model:'mock-deterministic' inside analyzeBmpPhoto). A REAL
 * vision failure returns 502 and persists nothing — fabricated analyses
 * must never enter ai_analyses (AI-02).
 *
 * Returns the AIAnalysis-shaped result so the checkpoint detail page can
 * patch it into its local state without a full refetch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { resolveCheckpointPhotoUrl } from '@/lib/supabase/storage';
import {
  analyzeBmpPhoto,
  type AnalyzeBmpPhotoResult,
} from '@/lib/ai-vision';
import type { CheckpointStatus } from '@/types/checkpoint';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id: checkpointId } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const { data: checkpoint, error: cpErr } = await supabase
      .from('checkpoints')
      .select('*')
      .eq('id', checkpointId)
      .single();
    if (cpErr || !checkpoint) {
      if (cpErr?.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Checkpoint not found' },
          { status: 404 },
        );
      }
      throw new Error(
        cpErr?.message ?? 'Checkpoint lookup returned no row',
      );
    }

    const photoUrl: string | null =
      await resolveCheckpointPhotoUrl(
        checkpoint.qsp_photo_url ?? checkpoint.last_inspection_photo ?? null
      );
    if (!photoUrl) {
      return NextResponse.json(
        { error: 'No photo on this checkpoint yet — upload one first.' },
        { status: 400 },
      );
    }

    let result: AnalyzeBmpPhotoResult;
    try {
      result = await analyzeBmpPhoto({
        photoUrl,
        checkpointId: checkpoint.id,
        checkpointName: checkpoint.name ?? 'Unknown checkpoint',
        bmpCategory: checkpoint.bmp_type ?? 'general',
        cgpSection: checkpoint.cgp_section ?? '',
        currentStatus:
          (checkpoint.status as CheckpointStatus) ?? 'needs-review',
      });
    } catch (err) {
      // AI-02: a real vision failure must fail loudly. The old path
      // silently persisted a fabricated mock analysis to ai_analyses with
      // nothing marking it as fake — a compliance record must never
      // contain an invented observation. (The deterministic mock still
      // serves demo deployments with no ANTHROPIC_API_KEY — that gate
      // lives inside analyzeBmpPhoto and tags results with model:'mock'.)
      console.error('Claude vision failed on checkpoint analyze:', err);
      return NextResponse.json(
        { error: 'AI photo analysis failed — nothing was saved. Try again in a moment.' },
        { status: 502 },
      );
    }

    // Insert a new ai_analyses row. The detail GET sorts by created_at DESC
    // and returns the latest, so we get "fresh analysis wins" behavior
    // without an upsert + matching constraint.
    const { data: persisted, error: insertErr } = await supabase
      .from('ai_analyses')
      .insert({
        checkpoint_id: checkpoint.id,
        summary: result.summary,
        status: result.status,
        confidence: Math.max(0, Math.min(100, Math.round(result.confidence))),
        details: result.details,
        cgp_reference: result.cgpReference,
        recommendations: result.recommendations,
      })
      .select()
      .single();
    if (insertErr || !persisted) {
      throw new Error(
        insertErr?.message ?? 'ai_analyses insert returned no row',
      );
    }

    return NextResponse.json({
      id: String(persisted.id),
      checkpointId: persisted.checkpoint_id,
      summary: persisted.summary,
      status: persisted.status,
      confidence: persisted.confidence,
      details: persisted.details ?? [],
      cgpReference: persisted.cgp_reference,
      recommendations: persisted.recommendations ?? [],
      createdAt: persisted.created_at,
      // AI-02: which engine produced this — 'mock-deterministic' only on
      // keyless demo deployments. (Not yet persisted: ai_analyses has no
      // model column; adding one is a gated migration — see CODE_REVIEW.)
      model: result.model,
    });
  } catch (err: unknown) {
    console.error('Checkpoint analyze error:', err);
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to analyze checkpoint' }, { status: 500 });
  }
}
