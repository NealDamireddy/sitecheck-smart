/**
 * GET /api/healthcheck
 *
 * Tiny endpoint used by the offline banner's heartbeat (see
 * src/lib/offline/use-online-status.ts). Intentionally unauthenticated
 * and side-effect free — it only confirms the client can reach our
 * origin over the network. The Workbox service worker explicitly
 * routes this with NetworkOnly so a stale cache entry can't fool the
 * online detector.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

export function GET() {
  return NextResponse.json(
    { ok: true, ts: Date.now() },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
