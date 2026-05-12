/**
 * POST /api/admin/apply-migrations
 *
 * Applies all pending migrations from `supabase/migrations/` to the remote
 * Supabase Postgres database. Gated by a shared-secret `x-admin-token` header.
 *
 * Query params:
 *   ?dryRun=1  Report what would happen without executing or recording.
 *
 * Required env vars:
 *   SUPABASE_DB_URL         — Supavisor session pooler URL (port 5432)
 *   ADMIN_MIGRATION_TOKEN   — shared secret (generate: openssl rand -hex 32)
 *
 * Example:
 *   curl -X POST -H "x-admin-token: $ADMIN_MIGRATION_TOKEN" \
 *     http://localhost:3000/api/admin/apply-migrations
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runMigrations } from '@/lib/migrations/runner';

// `pg` uses Node's `net` module and is not edge-compatible.
export const runtime = 'nodejs';
// Never cache; always run fresh.
export const dynamic = 'force-dynamic';

function unauthorized(msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status: 401 });
}

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const expected = process.env.ADMIN_MIGRATION_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'ADMIN_MIGRATION_TOKEN is not configured on the server' },
      { status: 500 },
    );
  }

  const provided = req.headers.get('x-admin-token');
  if (!provided) return unauthorized('missing x-admin-token header');
  if (!tokensMatch(provided, expected)) return unauthorized('invalid x-admin-token');

  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';

  try {
    const result = await runMigrations({ dryRun });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error:
        'POST only. Usage: curl -X POST -H "x-admin-token: $ADMIN_MIGRATION_TOKEN" /api/admin/apply-migrations',
    },
    { status: 405 },
  );
}
