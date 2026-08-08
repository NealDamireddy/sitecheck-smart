import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({ requireAuth: () => requireAuth() }));
vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let inspection: Record<string, unknown> | null;
let updateCalls: Array<Record<string, unknown>>;

function supabaseStub() {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: inspection, error: null };
        },
        update(values: Record<string, unknown>) {
          updateCalls.push(values);
          return this;
        },
        async single() {
          return { data: inspection, error: null };
        },
        async insert() {
          return { error: null };
        },
      };
    },
  };
}

function request() {
  return new NextRequest('http://test/api/inspections/insp-1/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

const context = () => ({ params: Promise.resolve({ id: 'insp-1' }) });

beforeEach(() => {
  vi.clearAllMocks();
  updateCalls = [];
  inspection = {
    id: 'insp-1',
    status: 'in-progress',
    submitted_at: null,
    report_id: null,
    checklist_template_id: null,
  };
  requireAuth.mockResolvedValue({
    user: { id: 'user-a' },
    supabase: supabaseStub(),
  });
});

describe('legacy inspection submit guard', () => {
  it('cannot submit an inspection before the required checklist', async () => {
    const { POST } = await import('@/app/api/inspections/[id]/submit/route');
    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Complete the CGP checklist before submitting this inspection.',
    });
    expect(updateCalls).toEqual([]);
  });

  it('is idempotent after the atomic checklist already submitted the record', async () => {
    inspection = {
      ...inspection,
      status: 'submitted',
      submitted_at: '2026-03-09T18:35:00.000Z',
      checklist_template_id:
        '2022-0057-DWQ/traditional/risk-2/part-2-v1',
    };

    const { POST } = await import('@/app/api/inspections/[id]/submit/route');
    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: 'insp-1',
      status: 'submitted',
      submittedAt: '2026-03-09T18:35:00.000Z',
    });
    expect(updateCalls).toEqual([]);
  });
});
