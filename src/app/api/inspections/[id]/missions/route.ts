/**
 * Block 5 — Add a mission to an inspection's roll-up.
 *
 * POST /api/inspections/[id]/missions  body: { missionId }
 *
 * Idempotent on the (inspection_id, mission_id) unique constraint —
 * adding the same mission twice is a no-op.
 *
 * On success the inspection's compliance percentages are re-computed
 * from the new mission set.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { inspectionAddMission } from '@/lib/validations';
import {
  computeComplianceForMissions,
  writeComplianceToInspection,
} from '@/lib/inspection-compliance';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: inspectionId } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const raw = await request.json();
    const body = inspectionAddMission.parse(raw);
    const missionId = body.missionId as string | undefined;

    if (!missionId) {
      return NextResponse.json({ error: 'missionId is required' }, { status: 400 });
    }

    const linkRow = {
      id: `link-${inspectionId}-${missionId}`,
      inspection_id: inspectionId,
      mission_id: missionId,
    };

    // Use upsert against the unique constraint so re-add is a no-op
    const { error: linkError } = await supabase
      .from('inspection_missions')
      .upsert(linkRow, { onConflict: 'inspection_id,mission_id' });

    if (linkError) {
      console.error('Failed to link mission to inspection:', linkError);
      return NextResponse.json(
        { error: 'Failed to link mission' },
        { status: 500 }
      );
    }

    // Re-read the full mission set so compliance is honest
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
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error('inspection missions POST failed:', err);
    return NextResponse.json({ error: 'Link failed' }, { status: 500 });
  }
}
