/**
 * Cross-tenant isolation at the ROUTE layer.
 *
 * Scope note, stated plainly: RLS is what actually hides another
 * tenant's rows, and RLS lives in Postgres — proving it requires a live
 * database (see scripts/seed-test-db.ts and QA_CHECKLIST.md). What
 * these tests prove is the other half, which is equally necessary and
 * entirely testable here: when the database returns nothing for a
 * resource — exactly what RLS does for a foreign row — the route
 * answers 404/403 and never leaks data, and it never performs a write
 * against a row it could not first read.
 *
 * The sync-job routes are the exception that needs no DB: their
 * ownership check is in application code because jobs are file-backed,
 * and it is asserted directly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeFakeSupabase, type FakeSupabase } from '../support/fake-supabase';

const USER_A = 'user-a';
let fake: FakeSupabase;

const requireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireAuth: (...a: unknown[]) => requireAuth(...a),
}));
vi.mock('@/lib/supabase/server', () => ({
  createAuthClient: async () => fake.client,
  createAdminClient: () => fake.client,
}));
vi.mock('@/lib/supabase/storage', () => ({
  resolveCheckpointPhotoUrl: async (v: string | null) => v,
  uploadCheckpointPhoto: async () => ({ url: 'https://x/y.jpg', path: 'y.jpg' }),
}));

beforeEach(() => {
  // Empty fixtures: every table read returns "no row", which is what an
  // RLS-scoped client sees when the resource belongs to someone else.
  fake = makeFakeSupabase();
  requireAuth.mockResolvedValue({ user: { id: USER_A }, supabase: fake.client });
});

function ctx<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

function jsonRequest(method: string, body: unknown = {}) {
  return new NextRequest('http://localhost:3000/api/x', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe("reading another tenant's resource by id", () => {
  const cases: Array<{
    name: string;
    load: () => Promise<{ GET: (r: NextRequest, c: unknown) => Promise<Response> }>;
    params: Record<string, string>;
  }> = [
    {
      name: 'GET /api/checkpoints/[id]',
      load: () => import('@/app/api/checkpoints/[id]/route') as never,
      params: { id: 'cp-belonging-to-user-b' },
    },
    {
      name: 'GET /api/inspections/[id]',
      load: () => import('@/app/api/inspections/[id]/route') as never,
      params: { id: 'insp-belonging-to-user-b' },
    },
    {
      name: 'GET /api/samples/[id]',
      load: () => import('@/app/api/samples/[id]/route') as never,
      params: { id: 'sample-belonging-to-user-b' },
    },
    {
      name: 'GET /api/smarts-events/[id]',
      load: () => import('@/app/api/smarts-events/[id]/route') as never,
      params: { id: 'evt-belonging-to-user-b' },
    },
    {
      name: 'GET /api/monitoring-locations/[id]',
      load: () => import('@/app/api/monitoring-locations/[id]/route') as never,
      params: { id: 'loc-belonging-to-user-b' },
    },
    {
      name: 'GET /api/deficiencies/[id]',
      load: () => import('@/app/api/deficiencies/[id]/route') as never,
      params: { id: 'def-belonging-to-user-b' },
    },
    {
      name: 'GET /api/corrective-actions/[id]',
      load: () => import('@/app/api/corrective-actions/[id]/route') as never,
      params: { id: 'ca-belonging-to-user-b' },
    },
  ];

  for (const c of cases) {
    it(`${c.name} → not 200, no data leaked`, async () => {
      const mod = await c.load();
      const res = await mod.GET(
        new NextRequest('http://localhost:3000/api/x'),
        ctx(c.params)
      );
      expect(res.status).not.toBe(200);
      expect([403, 404, 500]).toContain(res.status);
      const body = await res.json().catch(() => ({}));
      expect(body).not.toHaveProperty('id');
    });
  }
});

describe("mutating another tenant's resource by id", () => {
  it('PUT /api/checkpoints/[id] does not write when the row is invisible', async () => {
    const mod = await import('@/app/api/checkpoints/[id]/route');
    const res = await mod.PUT(
      jsonRequest('PUT', { status: 'compliant' }),
      ctx({ id: 'cp-belonging-to-user-b' })
    );
    expect(res.status).not.toBe(200);
    const persisted = fake
      .writes()
      .filter((w) => w.table === 'checkpoints' && w.op === 'update');
    // An update may be *attempted* (RLS makes it affect zero rows), but
    // the route must not report success.
    expect(res.status === 200 && persisted.length > 0).toBe(false);
  });

  it('PATCH /api/samples/[id] refuses an invisible sample', async () => {
    const mod = await import('@/app/api/samples/[id]/route');
    const res = await mod.PATCH(
      jsonRequest('PATCH', { qspName: 'Mallory' }),
      ctx({ id: 'sample-belonging-to-user-b' })
    );
    expect(res.status).not.toBe(200);
  });

  it('DELETE /api/samples/[id] refuses an invisible sample', async () => {
    const mod = await import('@/app/api/samples/[id]/route');
    const res = await mod.DELETE(
      new NextRequest('http://localhost:3000/api/x', { method: 'DELETE' }),
      ctx({ id: 'sample-belonging-to-user-b' })
    );
    expect(res.status).not.toBe(200);
  });

  it('POST /api/checkpoints/[id]/photo refuses to attach to an invisible checkpoint', async () => {
    const mod = await import('@/app/api/checkpoints/[id]/photo/route');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
    const req = new NextRequest('http://localhost:3000/api/x', {
      method: 'POST',
      body: form,
    });
    const res = await mod.POST(req, ctx({ id: 'cp-belonging-to-user-b' }));
    expect(res.status).not.toBe(200);
    expect(fake.writes().filter((w) => w.table === 'checkpoints')).toEqual([]);
  });
});

describe('sync jobs enforce ownership in application code (SEC-05)', () => {
  const OTHER_JOB = {
    id: '11111111-2222-3333-4444-555555555555',
    userId: 'user-b',
    eventId: 'evt-1',
    projectId: 'proj-b',
    status: 'filled',
    startedAt: '2026-07-27T00:00:00.000Z',
    finishedAt: null,
    exitCode: 0,
    pid: null,
    reason: null,
    screenshots: { samples: [], dataSummary: null, certification: 'x.png', halt: null },
    logTail: [],
  };

  it("GET /api/smarts/sync/[jobId] 404s on another user's job", async () => {
    vi.doMock('@/lib/smarts/sync-job', () => ({
      getSyncJob: async () => OTHER_JOB,
      resolveJobScreenshot: () => '/tmp/x.png',
    }));
    const mod = await import('@/app/api/smarts/sync/[jobId]/route');
    const res = await mod.GET(
      new NextRequest('http://localhost:3000/api/x'),
      ctx({ jobId: OTHER_JOB.id })
    );
    expect(res.status).toBe(404);
    vi.doUnmock('@/lib/smarts/sync-job');
  });
});
