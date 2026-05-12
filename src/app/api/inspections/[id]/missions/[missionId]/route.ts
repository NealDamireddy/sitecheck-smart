/**
 * Block 5 — Unlink a mission from an inspection's roll-up.
 *
 * DELETE /api/inspections/[id]/missions/[missionId]
 *
 * Returns the new mission set + the re-computed compliance percentages.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  computeComplianceForMissions,
  writeComplianceToInspection,
} from '@/lib/inspection-compliance';

interface RouteContext {
  params: Promise<{ id: string; missionId: string }>;
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id: inspectionId, missionId } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const { error } = await supabase
      .from('inspection_missions')
      .delete()
      .eq('inspection_id', inspectionId)
      .eq('mission_id', missionId);

    if (error) {
      console.error('Failed to unlink mission:', error);
      return NextResponse.json({ error: 'Unlink failed' }, { status: 500 });
    }

    // Re-resolve and re-compute
    const { data: linkRows } = await supabase
      .from('inspection_missions')
      .select('mission_id')
      .eq('inspection_id', inspectionId);
    const missionIds: string[] = (linkRows ?? []).map((r) => r.mission_id as string);

    const computation = await computeComplianceForMissions(supabase, missionIds);
    await writeComplianceToInspection(supabase, inspectionId, computation);

    return NextResponse.json({
      ok: true,
      missionIds,
      aiOverallCompliance: computation.aiOverallCompliance,
      qspOverallCompliance: computation.qspOverallCompliance,
    });
  } catch (err) {
    console.error('inspection missions DELETE failed:', err);
    return NextResponse.json({ error: 'Unlink failed' }, { status: 500 });
  }
}
