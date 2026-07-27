/**
 * GET /api/smarts/runs[?projectId=...&limit=...]
 *
 * The authenticated user's Sync-to-SMARTS run history from smarts_runs,
 * newest first. RLS restricts rows to the caller (user_id = auth.uid()),
 * so this is read-only and per-user by construction. The dashboard
 * run-status panel uses the latest row's job_id to poll the existing
 * GET /api/smarts/sync/[jobId] endpoint for live detail.
 *
 * csv_text is intentionally NOT selected here (it can be large); the run
 * list is metadata only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const projectId = request.nextUrl.searchParams.get('projectId');
    const limitParam = Number(request.nextUrl.searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 20;

    let query = auth.supabase
      .from('smarts_runs')
      .select(
        'id, job_id, project_id, wdid, status, last_step_reached, error_message, started_at, completed_at'
      )
      .order('started_at', { ascending: false })
      .limit(limit);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json(data ?? []);
  } catch (err: unknown) {
    console.error('SMARTS runs list error:', err);
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to read SMARTS runs' }, { status: 500 });
  }
}
