/**
 * POST /api/smarts/sync   { eventId: string, headed?: boolean }
 *
 * Launches the SMARTS bot for one rain event. The payload is rebuilt
 * server-side from the DB (never trusted from the client), re-checked
 * for blockers, and handed to the job runner, which spawns the bot as a
 * detached process. Responds 202 with a jobId to poll.
 *
 * The bot fills the Ad Hoc Monitoring Report and STOPS before the
 * Certification step — it never certifies, never checks the
 * attestation, never submits. The human certifies in SMARTS afterwards.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { fetchSmartsExportInput } from '@/lib/smarts/fetch-export-input';
import { buildSyncPayload, SMARTS_EVENT_TYPE } from '@/lib/smarts/bot-bridge';
import { resolveSmartsCredentials } from '@/lib/smarts/credentials';
import { startSyncJob } from '@/lib/smarts/sync-job';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = (await request.json().catch(() => null)) as {
      eventId?: string;
      headed?: boolean;
    } | null;
    if (!body?.eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    const fetched = await fetchSmartsExportInput(auth.supabase, body.eventId);
    if (!fetched.ok) {
      return NextResponse.json({ error: fetched.error }, { status: fetched.status });
    }

    const payload = buildSyncPayload(fetched.input);
    if (payload.blockers.length > 0) {
      return NextResponse.json(
        {
          error: 'This event is not ready to sync.',
          blockers: payload.blockers,
        },
        { status: 422 }
      );
    }

    // Per-inspector saved credentials (decrypted server-side), falling
    // back to the server-env pair. Never accepted from the request body.
    const credentials = await resolveSmartsCredentials(
      auth.supabase,
      auth.user.id
    );
    if (!credentials) {
      return NextResponse.json(
        {
          error:
            'No SMARTS credentials on file. Save your SMARTS username and password on the My Account page first.',
        },
        { status: 400 }
      );
    }

    const started = startSyncJob({
      eventId: payload.eventId,
      projectId: payload.projectId,
      wdid: payload.wdid!,
      siteName: payload.siteName,
      eventType: SMARTS_EVENT_TYPE,
      csv: payload.csv,
      headed: body.headed ?? true,
      username: credentials.username,
      password: credentials.password,
    });
    if (!started.ok) {
      return NextResponse.json({ error: started.error }, { status: started.status });
    }

    return NextResponse.json({ jobId: started.jobId }, { status: 202 });
  } catch (err: unknown) {
    console.error('SMARTS sync launch error:', err);
    const message =
      err instanceof Error ? err.message : 'Failed to launch SMARTS sync';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
