/**
 * GET /api/smarts/sync/preview?eventId=...
 *
 * Returns the exact payload a Sync-to-SMARTS run would fill — event
 * info, one row per sampled location with every field value, blockers,
 * warnings, and the raw bot CSV — plus whether SMARTS credentials are
 * configured on the server. The review-and-confirm page renders this
 * verbatim; the launch route rebuilds the same payload server-side at
 * launch time, so what was reviewed is what gets filled.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { fetchSmartsExportInput } from '@/lib/smarts/fetch-export-input';
import { buildSyncPayload } from '@/lib/smarts/bot-bridge';
import { smartsCredentialsConfigured } from '@/lib/smarts/sync-job';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const eventId = request.nextUrl.searchParams.get('eventId');
    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    const fetched = await fetchSmartsExportInput(auth.supabase, eventId);
    if (!fetched.ok) {
      return NextResponse.json({ error: fetched.error }, { status: fetched.status });
    }

    const payload = buildSyncPayload(fetched.input);
    return NextResponse.json({
      ...payload,
      credentialsConfigured: smartsCredentialsConfigured(),
    });
  } catch (err: unknown) {
    console.error('SMARTS sync preview error:', err);
    const message =
      err instanceof Error ? err.message : 'Failed to build sync preview';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
