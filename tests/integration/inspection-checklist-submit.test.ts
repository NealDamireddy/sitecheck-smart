import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { TRADITIONAL_RISK_2_CHECKLIST_VERSION } from '@/lib/cgp/checklist-expansion';

const requireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({ requireAuth: () => requireAuth() }));
vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let inspection: Record<string, unknown> | null;
let project: Record<string, unknown> | null;
let rpcData: Record<string, unknown> | null;
let rpcError: { code?: string; message: string } | null;
let rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;

function supabaseStub() {
  return {
    from(table: string) {
      const row = table === 'inspections' ? inspection : table === 'projects' ? project : null;
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: row, error: null };
        },
      };
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return { data: rpcData, error: rpcError };
    },
  };
}

const validBody = {
  idempotencyKey: 'inspection-submit-key-0001',
  checklistVersion: TRADITIONAL_RISK_2_CHECKLIST_VERSION,
  observedAt: '2026-03-09T11:30:00-07:00',
  unflaggedItemsConfirmed: true,
  constructionStage: 'Earthwork/Grading',
  photosTaken: true,
  siteObservations: {
    precipitation: false,
    discolorations: false,
    odors: false,
    turbidity: false,
    sheen: false,
    floatingMaterial: false,
    suspendedMaterial: false,
    comments: '',
  },
  exceptions: [
    {
      itemId: 'gh-wm-6',
      description: 'Concrete washout is overflowing.',
      recommendation: 'Pump down and restore containment.',
      checkpointId: 'MM-4',
    },
  ],
};

function request(body: unknown = validBody) {
  return new NextRequest('http://test/api/inspections/insp-1/checklist/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = () => ({ params: Promise.resolve({ id: 'insp-1' }) });

beforeEach(() => {
  vi.clearAllMocks();
  inspection = {
    id: 'insp-1',
    project_id: 'proj-1',
    status: 'draft',
    inspector: 'QSP One',
  };
  project = { id: 'proj-1', project_type: 'bounded-site', risk_level: 2 };
  rpcData = {
    id: 'insp-1',
    status: 'submitted',
    created: true,
    submitted_at: '2026-03-09T18:35:00.000Z',
    result_count: 22,
    compliant_count: 21,
    deficient_count: 1,
  };
  rpcError = null;
  rpcCalls = [];
  requireAuth.mockResolvedValue({
    user: { id: 'user-a' },
    supabase: supabaseStub(),
  });
});

describe('POST /api/inspections/[id]/checklist/submit', () => {
  it('expands and persists the complete inspection through one atomic RPC', async () => {
    const { POST } = await import(
      '@/app/api/inspections/[id]/checklist/submit/route'
    );
    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      id: 'insp-1',
      status: 'submitted',
      resultCount: 22,
      compliantCount: 21,
      deficientCount: 1,
    });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe('submit_inspection_checklist');

    const args = rpcCalls[0].args as {
      p_submission: Record<string, unknown>;
      p_results: Array<Record<string, unknown>>;
    };
    expect(args.p_results).toHaveLength(22);
    expect(args.p_results.filter((item) => item.answer === 'no')).toEqual([
      expect.objectContaining({
        checklist_item_id: 'gh-wm-6',
        exception_description: 'Concrete washout is overflowing.',
        repair_start_due_at: '2026-03-12T18:30:00.000Z',
      }),
    ]);
    expect(args.p_submission).toMatchObject({
      checklist_template_id: TRADITIONAL_RISK_2_CHECKLIST_VERSION,
      unflagged_items_confirmed: true,
      obs_precipitation: false,
    });
    expect(args.p_submission.submission_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('requires explicit unflagged-item confirmation before any database read', async () => {
    const { POST } = await import(
      '@/app/api/inspections/[id]/checklist/submit/route'
    );
    const response = await POST(
      request({ ...validBody, unflaggedItemsConfirmed: false }),
      context()
    );
    expect(response.status).toBe(400);
    expect(rpcCalls).toEqual([]);
  });

  it('404s when RLS hides the inspection and never calls the RPC', async () => {
    inspection = null;
    const { POST } = await import(
      '@/app/api/inspections/[id]/checklist/submit/route'
    );
    expect((await POST(request(), context())).status).toBe(404);
    expect(rpcCalls).toEqual([]);
  });

  it('fails closed for an unsupported project profile', async () => {
    project = { id: 'proj-1', project_type: 'linear', risk_level: 2 };
    const { POST } = await import(
      '@/app/api/inspections/[id]/checklist/submit/route'
    );
    const response = await POST(request(), context());
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('UNSUPPORTED_PROFILE');
    expect(rpcCalls).toEqual([]);
  });

  it('returns an existing submission for a same-key retry without writing again', async () => {
    inspection = {
      ...inspection,
      status: 'submitted',
      checklist_submission_key: validBody.idempotencyKey,
      submitted_at: '2026-03-09T18:35:00.000Z',
      checklist_compliant_count: 21,
      checklist_deficient_count: 1,
    };
    const { POST } = await import(
      '@/app/api/inspections/[id]/checklist/submit/route'
    );
    const response = await POST(request(), context());
    expect(response.status).toBe(200);
    expect((await response.json()).created).toBe(false);
    expect(rpcCalls).toEqual([]);
  });

  it('rejects a different-key attempt to rewrite a submitted inspection', async () => {
    inspection = {
      ...inspection,
      status: 'submitted',
      checklist_submission_key: 'original-submission-key',
    };
    const { POST } = await import(
      '@/app/api/inspections/[id]/checklist/submit/route'
    );
    expect((await POST(request(), context())).status).toBe(409);
    expect(rpcCalls).toEqual([]);
  });

  it('maps database validation failures without exposing internal messages', async () => {
    rpcError = { code: 'P0001', message: 'CHECKLIST_RESULT_COUNT_MISMATCH details' };
    const { POST } = await import(
      '@/app/api/inspections/[id]/checklist/submit/route'
    );
    const response = await POST(request(), context());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'Checklist submission failed validation.',
    });
  });
});

