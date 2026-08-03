import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({ requireAuth: () => requireAuth() }));
vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let project: { id: string; center_lat: number; center_lng: number } | null;
let projectError: { message: string } | null;
let rpcResult: { data: string | null; error: { code?: string; message: string } | null };
let rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;

function supabaseStub() {
  return {
    from(table: string) {
      if (table !== 'projects') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: project, error: projectError }),
          }),
        }),
      };
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return rpcResult;
    },
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function successfulNwsFetch(qpfHours = 6) {
  return vi
    .fn()
    .mockResolvedValueOnce(
      response({
        properties: {
          forecastGridData: 'https://api.weather.gov/gridpoints/HNX/55,100',
        },
      })
    )
    .mockResolvedValueOnce(
      response({
        properties: {
          updateTime: '2026-08-03T18:00:00Z',
          probabilityOfPrecipitation: {
            uom: 'wmoUnit:percent',
            values: [
              { validTime: '2026-08-04T00:00:00Z/PT24H', value: 60 },
            ],
          },
          quantitativePrecipitation: {
            uom: 'wmoUnit:mm',
            values: [0, 1, 2, 3].map((index) => ({
              validTime: `2026-08-04T${String(index * 6).padStart(2, '0')}:00:00Z/PT${qpfHours}H`,
              value: 3.175,
            })),
          },
        },
      })
    );
}

const context = () => ({ params: Promise.resolve({ projectId: 'proj-1' }) });
const request = () =>
  new NextRequest('http://test/api/projects/proj-1/cgp-forecast/capture', {
    method: 'POST',
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NOAA_USER_AGENT', 'SiteCheck Test (test@example.com)');
  project = { id: 'proj-1', center_lat: 36.778, center_lng: -119.417 };
  projectError = null;
  rpcResult = { data: null, error: null };
  rpcCalls = [];
  requireAuth.mockResolvedValue({
    user: { id: 'user-a' },
    supabase: supabaseStub(),
  });
});

describe('POST .../cgp-forecast/capture', () => {
  it('fetches, hashes, normalizes, and atomically persists NWS evidence', async () => {
    vi.stubGlobal('fetch', successfulNwsFetch());
    const { POST } = await import(
      '@/app/api/projects/[projectId]/cgp-forecast/capture/route'
    );
    const res = await POST(request(), context());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.normalization).toEqual({
      status: 'normalized',
      reasonCodes: [],
      intervalCount: 4,
    });
    expect(body.payloadSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe('capture_cgp_forecast_evidence');

    const args = rpcCalls[0].args as {
      p_snapshot: Record<string, unknown>;
      p_intervals: unknown[];
    };
    expect(args.p_snapshot).toMatchObject({
      project_id: 'proj-1',
      provider: 'nws',
      parser_version: 'nws-grid-six-hour-v2',
      normalization_status: 'normalized',
    });
    expect(args.p_snapshot.raw_payload).toBeTruthy();
    expect(args.p_intervals).toHaveLength(4);
    expect(body).not.toHaveProperty('rawPayload');
  });

  it('404s without calling NWS for a project hidden by RLS', async () => {
    project = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import(
      '@/app/api/projects/[projectId]/cgp-forecast/capture/route'
    );
    expect((await POST(request(), context())).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpcCalls).toEqual([]);
  });

  it('rejects unconfirmed default coordinates before calling NWS', async () => {
    project = { id: 'proj-1', center_lat: 0, center_lng: 0 };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import(
      '@/app/api/projects/[projectId]/cgp-forecast/capture/route'
    );
    expect((await POST(request(), context())).status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails clearly when the NWS user agent is not configured', async () => {
    vi.stubEnv('NOAA_USER_AGENT', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import(
      '@/app/api/projects/[projectId]/cgp-forecast/capture/route'
    );
    expect((await POST(request(), context())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 502 and writes nothing when NWS fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 503)));
    const { POST } = await import(
      '@/app/api/projects/[projectId]/cgp-forecast/capture/route'
    );
    expect((await POST(request(), context())).status).toBe(502);
    expect(rpcCalls).toEqual([]);
  });

  it('retains an unnormalizable raw forecast without creating intervals', async () => {
    vi.stubGlobal('fetch', successfulNwsFetch(12));
    const { POST } = await import(
      '@/app/api/projects/[projectId]/cgp-forecast/capture/route'
    );
    const res = await POST(request(), context());
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.normalization).toMatchObject({
      status: 'unknown',
      reasonCodes: ['NWS_INTERVAL_OVERLAP'],
      intervalCount: 0,
    });
    expect(rpcCalls).toHaveLength(1);
  });

  it('reports a missing migration without exposing the database error', async () => {
    vi.stubGlobal('fetch', successfulNwsFetch());
    rpcResult = {
      data: null,
      error: { code: 'PGRST202', message: 'function does not exist' },
    };
    const { POST } = await import(
      '@/app/api/projects/[projectId]/cgp-forecast/capture/route'
    );
    const res = await POST(request(), context());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: 'Forecast evidence storage is not configured.',
    });
  });
});
