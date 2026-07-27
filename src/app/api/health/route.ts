/**
 * GET /api/health — liveness + readiness for a container orchestrator.
 *
 * Every runtime this app can move to wants one of these: an ECS/Fargate
 * target-group health check, an Azure Container Apps probe, a Kubernetes
 * readinessProbe, or a Docker HEALTHCHECK.
 *
 *   200 — the process is up AND its database is reachable.
 *   503 — the process is up but a dependency is not; the orchestrator
 *         should pull it out of rotation rather than kill it.
 *
 * `?shallow=1` skips the dependency check for a pure liveness probe
 * (is the process wedged?), so a database blip doesn't cause a restart
 * loop of otherwise-healthy containers.
 *
 * Unauthenticated by design — a health endpoint that requires a session
 * is useless to a load balancer. It therefore returns NO configuration
 * detail: no connection strings, no env values, no dependency URLs.
 * Build metadata is safe and is what makes a deploy traceable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Fail fast: a health check that hangs is worse than one that fails. */
const DB_TIMEOUT_MS = 3_000;

interface DependencyStatus {
  status: 'ok' | 'error' | 'skipped';
  latencyMs?: number;
  /** Terse category only — never the upstream error text. */
  detail?: string;
}

async function checkDatabase(): Promise<DependencyStatus> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { status: 'error', detail: 'not-configured' };
  }

  const started = Date.now();
  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Cheapest possible round-trip that proves PostgREST answers and
    // RLS is in force: an anonymous count that policies reduce to zero.
    // A reachable database returns 0 rows, not an error.
    const query = supabase.from('projects').select('id', { count: 'exact', head: true });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS)
    );
    const { error } = (await Promise.race([query, timeout])) as { error: unknown };
    const latencyMs = Date.now() - started;
    if (error) return { status: 'error', latencyMs, detail: 'query-failed' };
    return { status: 'ok', latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const detail = err instanceof Error && err.message === 'timeout' ? 'timeout' : 'unreachable';
    return { status: 'error', latencyMs, detail };
  }
}

export async function GET(request: NextRequest) {
  const shallow = request.nextUrl.searchParams.get('shallow') === '1';
  const database: DependencyStatus = shallow
    ? { status: 'skipped' }
    : await checkDatabase();

  const healthy = database.status !== 'error';
  const body = {
    status: healthy ? 'ok' : 'degraded',
    time: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    version: {
      // Populated at build time by the Dockerfile / CI; "unknown" locally.
      commit: process.env.APP_COMMIT_SHA ?? 'unknown',
      builtAt: process.env.APP_BUILD_TIME ?? 'unknown',
      environment: process.env.NODE_ENV ?? 'unknown',
    },
    dependencies: { database },
  };

  if (!healthy) {
    log.warn('Health check degraded', {
      route: '/api/health',
      dependency: 'database',
      detail: database.detail,
    });
  }

  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
