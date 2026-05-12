/**
 * Block 4 — GET /api/missions/[id]/ai-analyses
 *
 * Returns the persisted Claude vision analyses for a mission, used by
 * `useMissionAIAnalysesStore.fetchForMission` to populate the ReviewPanel
 * on mount. Mock fallback: empty array on Supabase failure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ id: string }>;
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
    details: Array.isArray(row.details) ? row.details : [],
    cgpReference: row.cgp_reference,
    recommendations: Array.isArray(row.recommendations) ? row.recommendations : [],
    model: row.model,
    createdAt: row.created_at,
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id: missionId } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { data, error } = await supabase
      .from('mission_ai_analyses')
      .select('*')
      .eq('mission_id', missionId)
      .order('waypoint_number', { ascending: true });
    if (error) {
      return NextResponse.json([]);
    }
    return NextResponse.json((data ?? []).map(transformAnalysis));
  } catch (err) {
    console.error('ai-analyses GET failed:', err);
    return NextResponse.json([]);
  }
}
