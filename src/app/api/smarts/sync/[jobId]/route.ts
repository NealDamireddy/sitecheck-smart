/**
 * GET /api/smarts/sync/[jobId]
 *
 * Status of one Sync-to-SMARTS job. Absolute artifact paths stay on the
 * server; the client gets stable screenshot keys it can fetch through
 * the screenshot route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getSyncJob } from '@/lib/smarts/sync-job';

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { jobId } = await context.params;
    const job = await getSyncJob(jobId);
    // Ownership check (SEC-05): jobs belong to the user who launched them.
    // 404 (not 403) so the response doesn't confirm a foreign job exists.
    if (!job || job.userId !== auth.user.id) {
      return NextResponse.json({ error: 'Sync job not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: job.id,
      eventId: job.eventId,
      projectId: job.projectId,
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      reason: job.reason,
      logTail: job.logTail,
      screenshots: {
        samples: job.screenshots.samples.map((_, i) => `sample-${i}`),
        dataSummary: job.screenshots.dataSummary ? 'dataSummary' : null,
        certification: job.screenshots.certification ? 'certification' : null,
        halt: job.screenshots.halt ? 'halt' : null,
      },
    });
  } catch (err: unknown) {
    console.error('SMARTS sync status error:', err);
    const message =
      err instanceof Error ? err.message : 'Failed to read sync job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
