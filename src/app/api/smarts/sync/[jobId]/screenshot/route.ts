/**
 * GET /api/smarts/sync/[jobId]/screenshot?key=certification
 *
 * Serves one screenshot captured by the bot during a sync job. Only
 * paths recorded on the job state, inside the bot's artifacts tree, are
 * servable (enforced by resolveJobScreenshot) — the key is an opaque
 * name, never a path.
 */

import { readFile } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getSyncJob, resolveJobScreenshot } from '@/lib/smarts/sync-job';

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { jobId } = await context.params;
    // Ownership check (SEC-05): only the user who launched the job may
    // view its screenshots. 404 so foreign job ids aren't confirmed.
    const job = await getSyncJob(jobId);
    if (!job || job.userId !== auth.user.id) {
      return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 });
    }

    const key = request.nextUrl.searchParams.get('key') ?? '';
    const path = resolveJobScreenshot(jobId, key);
    if (!path) {
      return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 });
    }

    const buffer = await readFile(path);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    console.error('SMARTS sync screenshot error:', err);
    return NextResponse.json(
      { error: 'Failed to read screenshot' },
      { status: 500 }
    );
  }
}
