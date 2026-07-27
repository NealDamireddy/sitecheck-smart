/**
 * CLD-05 — /api/health is what a load balancer asks. It must answer
 * fast, answer honestly, and reveal nothing about configuration.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let dbBehavior: 'ok' | 'error' | 'hang' = 'ok';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: async () => {
        if (dbBehavior === 'hang') {
          await new Promise((resolve) => setTimeout(resolve, 10_000));
        }
        if (dbBehavior === 'error') return { error: { message: 'connection refused' } };
        return { error: null, count: 0 };
      },
    }),
  }),
}));

import { GET } from '@/app/api/health/route';

function req(path = 'http://localhost:3000/api/health') {
  return new NextRequest(path);
}

beforeEach(() => {
  dbBehavior = 'ok';
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/health', () => {
  it('reports 200 and ok when the database answers', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.dependencies.database.status).toBe('ok');
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('reports 503 and degraded when the database fails', async () => {
    dbBehavior = 'error';
    const res = await GET(req());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.dependencies.database.status).toBe('error');
  });

  it('never leaks configuration or upstream error text', async () => {
    dbBehavior = 'error';
    const raw = JSON.stringify(await (await GET(req())).json());
    expect(raw).not.toContain('test.supabase.co');
    expect(raw).not.toContain('anon-key');
    // Terse category only, not the driver's message.
    expect(raw).not.toContain('connection refused');
    expect(raw).toContain('query-failed');
  });

  it('reports 503 rather than 200 when Supabase is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const res = await GET(req());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.dependencies.database.detail).toBe('not-configured');
  });

  it('shallow=1 skips the dependency check for a liveness probe', async () => {
    dbBehavior = 'error'; // would fail a deep check
    const res = await GET(req('http://localhost:3000/api/health?shallow=1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dependencies.database.status).toBe('skipped');
  });

  it('times out rather than hanging the probe', async () => {
    dbBehavior = 'hang';
    const started = Date.now();
    const res = await GET(req());
    const elapsed = Date.now() - started;
    expect(res.status).toBe(503);
    expect(elapsed).toBeLessThan(6_000);
    const body = await res.json();
    expect(body.dependencies.database.detail).toBe('timeout');
  }, 15_000);

  it('carries build metadata so a container traces to a commit', async () => {
    vi.stubEnv('APP_COMMIT_SHA', 'abc1234');
    const body = await (await GET(req())).json();
    expect(body.version.commit).toBe('abc1234');
    expect(body.version).toHaveProperty('builtAt');
  });

  it('is never cached', async () => {
    const res = await GET(req());
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });
});
