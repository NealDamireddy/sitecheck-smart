import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({ requireAuth: () => requireAuth() }));
vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let project: { id: string } | null;
let snapshot: Record<string, unknown> | null;
let snapshotError: { code?: string; message: string } | null;
let intervalCount: number;

function supabaseStub() {
  return {
    from(table: string) {
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: project, error: null }),
            }),
          }),
        };
      }
      if (table === 'cgp_forecast_snapshots') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: snapshot, error: snapshotError }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'cgp_forecast_intervals') {
        return {
          select: () => ({
            eq: async () => ({ count: intervalCount, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const context = () => ({ params: Promise.resolve({ projectId: 'proj-1' }) });
const request = () =>
  new NextRequest('http://test/api/projects/proj-1/cgp-forecast');

beforeEach(() => {
  vi.clearAllMocks();
  project = { id: 'proj-1' };
  snapshot = {
    id: 'snapshot-1',
    provider: 'nws',
    retrieved_at: '2026-08-03T22:48:41.737Z',
    issued_at: '2026-08-03T21:57:13.000Z',
    payload_sha256: 'a'.repeat(64),
    parser_version: 'nws-grid-six-hour-v2',
    normalization_status: 'normalized',
    normalization_reason_codes: [],
  };
  snapshotError = null;
  intervalCount = 30;
  requireAuth.mockResolvedValue({
    user: { id: 'user-a' },
    supabase: supabaseStub(),
  });
});

describe('GET .../cgp-forecast', () => {
  it('returns the newest visible snapshot without exposing its raw payload', async () => {
    const { GET } = await import(
      '@/app/api/projects/[projectId]/cgp-forecast/route'
    );
    const response = await GET(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.snapshot).toMatchObject({
      id: 'snapshot-1',
      provider: 'nws',
      parserVersion: 'nws-grid-six-hour-v2',
      normalization: { status: 'normalized', intervalCount: 30 },
    });
    expect(body.snapshot).not.toHaveProperty('rawPayload');
  });

  it('returns an empty state before the first capture', async () => {
    snapshot = null;
    const { GET } = await import(
      '@/app/api/projects/[projectId]/cgp-forecast/route'
    );
    const response = await GET(request(), context());
    expect(await response.json()).toEqual({ snapshot: null });
  });

  it('does not reveal whether a hidden project has evidence', async () => {
    project = null;
    const { GET } = await import(
      '@/app/api/projects/[projectId]/cgp-forecast/route'
    );
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Project not found' });
  });
});
