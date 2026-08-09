import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({ requireAuth: () => requireAuth() }));
vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let rpcResult: {
  data: unknown;
  error: { code?: string; message: string } | null;
};
let rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
let directoryResult: {
  data: Array<Record<string, unknown>> | null;
  error: { code?: string; message: string } | null;
};

function supabaseStub() {
  return {
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return rpcResult;
    },
    from(table: string) {
      expect(table).toBe('site_record_directory');
      return {
        select() {
          return {
            eq(column: string) {
              expect(column).toBe('project_id');
              return {
                async order(orderColumn: string) {
                  expect(orderColumn).toBe('created_at');
                  return directoryResult;
                },
              };
            },
          };
        },
      };
    },
  };
}

const validBody = {
  projectId: 'site-1',
  idempotencyKey: 'mobile:site-1:submission-1',
  recordType: 'smarts_ad_hoc',
  observedFrom: '2026-08-07T10:00:00-07:00',
  detail: {
    startedAt: '2026-08-07T10:00:00-07:00',
    precipitationInches: 0.75,
  },
  source: {
    sourceType: 'form',
    schemaVersion: 'smarts-inspector-v1',
    rawPayload: { precipitationInches: 0.75 },
  },
};

function request(body: unknown = validBody) {
  return new NextRequest('http://test/api/site-records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcCalls = [];
  rpcResult = {
    data: {
      siteRecordId: '22222222-2222-4222-8222-222222222222',
      detailId: 'smarts-evt-1',
      recordType: 'smarts_ad_hoc',
      workflowStatus: 'draft',
      reportingYearStart: 2026,
      created: true,
    },
    error: null,
  };
  directoryResult = { data: [], error: null };
  requireAuth.mockResolvedValue({
    user: { id: 'user-1' },
    supabase: supabaseStub(),
  });
});

describe('GET /api/site-records', () => {
  it('returns the discernible company-inspector-site-record hierarchy', async () => {
    directoryResult.data = [
      {
        site_record_id: '22222222-2222-4222-8222-222222222222',
        org_id: '33333333-3333-4333-8333-333333333333',
        company_name: 'SiteCheck Co',
        inspector_user_id: '11111111-1111-4111-8111-111111111111',
        inspector_name: 'Inspector One',
        inspector_title: 'QSP',
        assignment_role: 'lead',
        project_id: 'site-1',
        site_name: 'Site One',
        wdid: '5S00C000000',
        record_type: 'smarts_ad_hoc',
        workflow_status: 'draft',
        title: 'August event',
        observed_from: '2026-08-07T17:00:00Z',
        observed_to: null,
        inspection_id: null,
        smarts_event_id: 'smarts-evt-1',
        reporting_year_start: 2026,
        portal_report_id: null,
        portal_status: null,
        readback_status: 'pending',
        created_by: '11111111-1111-4111-8111-111111111111',
        created_at: '2026-08-07T17:00:00Z',
        updated_at: '2026-08-07T17:00:00Z',
      },
    ];

    const { GET } = await import('@/app/api/site-records/route');
    const response = await GET(
      new NextRequest('http://test/api/site-records?projectId=site-1')
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      records: [
        expect.objectContaining({
          company: expect.objectContaining({ name: 'SiteCheck Co' }),
          inspector: expect.objectContaining({ name: 'Inspector One' }),
          site: expect.objectContaining({ name: 'Site One' }),
          recordType: 'smarts_ad_hoc',
          detail: expect.objectContaining({ smartsEventId: 'smarts-evt-1' }),
        }),
      ],
    });
  });

  it('requires an explicit site filter', async () => {
    const { GET } = await import('@/app/api/site-records/route');
    const response = await GET(new NextRequest('http://test/api/site-records'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'projectId is required' });
  });

  it('reports an unapplied read-model migration safely', async () => {
    directoryResult = {
      data: null,
      error: { code: 'PGRST205', message: 'view was not found' },
    };
    const { GET } = await import('@/app/api/site-records/route');
    const response = await GET(
      new NextRequest('http://test/api/site-records?projectId=site-1')
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Site record storage is not available',
    });
  });
});

describe('POST /api/site-records', () => {
  it('creates the common record and detail through one RPC', async () => {
    const { POST } = await import('@/app/api/site-records/route');
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      recordType: 'smarts_ad_hoc',
      reportingYearStart: 2026,
      created: true,
    });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({
      name: 'create_site_record_with_detail',
      args: {
        p_project_id: 'site-1',
        p_record_type: 'smarts_ad_hoc',
      },
    });
  });

  it('returns 200 for a safe same-key retry', async () => {
    rpcResult.data = {
      ...(rpcResult.data as Record<string, unknown>),
      created: false,
    };
    const { POST } = await import('@/app/api/site-records/route');
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ created: false });
  });

  it('blocks a closed SMARTS year before touching the database', async () => {
    const { POST } = await import('@/app/api/site-records/route');
    const response = await POST(
      request({
        ...validBody,
        detail: { startedAt: '2026-05-01T10:00:00-07:00' },
      })
    );
    expect(response.status).toBe(400);
    expect(rpcCalls).toEqual([]);
  });

  it.each([
    ['PROJECT_NOT_FOUND', 404, 'Site not found'],
    ['NO_ACTIVE_SITE_ASSIGNMENT', 403, 'not assigned'],
    ['SITE_RECORD_IDEMPOTENCY_CONFLICT', 409, 'idempotency key'],
    ['CLOSED_SMARTS_REPORTING_YEAR', 422, 'reporting year is closed'],
  ] as const)('maps %s to a sanitized %s', async (message, status, publicText) => {
    rpcResult = { data: null, error: { message } };
    const { POST } = await import('@/app/api/site-records/route');
    const response = await POST(request());
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.error).toContain(publicText);
    expect(JSON.stringify(body)).not.toContain(message);
  });

  it('reports an unapplied migration without leaking Postgres details', async () => {
    rpcResult = {
      data: null,
      error: { code: 'PGRST202', message: 'function does not exist in schema cache' },
    };
    const { POST } = await import('@/app/api/site-records/route');
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      // `code` is our own stable identifier, not Postgres detail — the
      // client uses it to offer the right remedy.
      error: 'Site record storage is not available',
      code: 'migration_required',
    });
  });

  it('fails closed on an invalid database response', async () => {
    rpcResult = { data: { created: true }, error: null };
    const { POST } = await import('@/app/api/site-records/route');
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Failed to create site record',
      code: 'persistence_failed',
    });
  });
});
