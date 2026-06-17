/**
 * PATCH /api/projects/[projectId]
 *
 * Additive, RLS-scoped partial update for a single project. Currently
 * supports correcting the WDID during SMARTS onboarding (Step 2 of the
 * setup wizard). The auth client enforces per-org row access, so a user
 * can only patch projects in an org they belong to.
 *
 * Scope is intentionally narrow — only `wdid` is accepted here. The full
 * project create path stays in POST /api/projects.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { projectId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      wdid?: string;
    } | null;

    const wdid = body?.wdid?.trim();
    if (!wdid) {
      return NextResponse.json({ error: 'wdid is required' }, { status: 400 });
    }

    const { data, error } = await auth.supabase
      .from('projects')
      .update({ wdid })
      .eq('id', projectId)
      .select('id, wdid')
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json(
        { error: 'Project not found or not accessible' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error('Project PATCH error:', err);
    const message =
      err instanceof Error ? err.message : 'Failed to update project';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
