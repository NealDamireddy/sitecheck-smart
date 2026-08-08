import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { makeFakeSupabase, type FakeSupabase } from '../support/fake-supabase';
import {
  inspectionReportResults,
  inspectionReportSnapshot,
} from '../support/inspection-report-fixture';

const requireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({ requireAuth: () => requireAuth() }));
vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const context = () => ({ params: Promise.resolve({ id: 'insp-1' }) });
const request = () => new NextRequest('http://test/api/inspections/insp-1/report-data');
let fake: FakeSupabase;

beforeEach(() => {
  fake = makeFakeSupabase({
    inspections: { single: inspectionReportSnapshot() },
    inspection_checklist_results: { rows: inspectionReportResults() },
  });
  requireAuth.mockResolvedValue({ user: { id: 'user-a' }, supabase: fake.client });
});

describe('GET /api/inspections/[id]/report-data', () => {
  it('returns a validated contract using only inspection-scoped immutable tables', async () => {
    const { GET } = await import('@/app/api/inspections/[id]/report-data/route');
    const response = await GET(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      inspectionId: 'insp-1',
      sourceSubmissionSha256: 'a'.repeat(64),
      part2: { compliantCount: 21, deficientCount: 1 },
    });
    expect(new Set(fake.calls.map((call) => call.table))).toEqual(
      new Set(['inspections', 'inspection_checklist_results'])
    );
    expect(fake.calls).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'projects' }),
        expect.objectContaining({ table: 'checkpoints' }),
        expect.objectContaining({ table: 'deficiencies' }),
      ])
    );
    expect(fake.writes()).toEqual([]);
  });

  it('returns 404 for an inspection hidden by RLS and does not query results', async () => {
    fake = makeFakeSupabase({ inspections: { single: null } });
    requireAuth.mockResolvedValue({ user: { id: 'user-a' }, supabase: fake.client });
    const { GET } = await import('@/app/api/inspections/[id]/report-data/route');
    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    expect(fake.calls.map((call) => call.table)).toEqual(['inspections']);
  });

  it('returns 409 when an inspection has not been submitted', async () => {
    fake = makeFakeSupabase({
      inspections: { single: inspectionReportSnapshot({ status: 'draft' }) },
      inspection_checklist_results: { rows: inspectionReportResults() },
    });
    requireAuth.mockResolvedValue({ user: { id: 'user-a' }, supabase: fake.client });
    const { GET } = await import('@/app/api/inspections/[id]/report-data/route');
    const response = await GET(request(), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'INSPECTION_NOT_SUBMITTED' });
  });

  it('returns 422 without leaking schema internals for incomplete snapshots', async () => {
    fake = makeFakeSupabase({
      inspections: {
        single: inspectionReportSnapshot({ qsp_license_number_snapshot: null }),
      },
      inspection_checklist_results: { rows: inspectionReportResults() },
    });
    requireAuth.mockResolvedValue({ user: { id: 'user-a' }, supabase: fake.client });
    const { GET } = await import('@/app/api/inspections/[id]/report-data/route');
    const response = await GET(request(), context());
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({
      error: 'The stored inspection snapshot is incomplete or inconsistent.',
      code: 'INCONSISTENT_REPORT_SNAPSHOT',
    });
    expect(JSON.stringify(body)).not.toContain('licenseNumber');
  });

  it('returns the authentication response without touching the database', async () => {
    requireAuth.mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const { GET } = await import('@/app/api/inspections/[id]/report-data/route');
    const response = await GET(request(), context());

    expect(response.status).toBe(401);
    expect(fake.calls).toEqual([]);
  });
});
