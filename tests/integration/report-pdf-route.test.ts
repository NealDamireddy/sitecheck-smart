import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
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
vi.mock('@react-pdf/renderer', async () => {
  const actual = await vi.importActual<typeof import('@react-pdf/renderer')>(
    '@react-pdf/renderer'
  );
  return { ...actual, renderToBuffer: vi.fn() };
});

const renderMock = vi.mocked(renderToBuffer);
const context = () => ({ params: Promise.resolve({ id: 'report-1' }) });
const request = () => new NextRequest('http://test/api/reports/report-1/pdf');
let fake: FakeSupabase;

beforeEach(() => {
  renderMock.mockReset();
  renderMock.mockResolvedValue(Buffer.from('%PDF-1.7\ncontract-pdf'));
  fake = makeFakeSupabase({
    reports: { single: { id: 'report-1', inspection_id: 'insp-1' } },
    inspections: { single: inspectionReportSnapshot() },
    inspection_checklist_results: { rows: inspectionReportResults() },
  });
  requireAuth.mockResolvedValue({ user: { id: 'user-a' }, supabase: fake.client });
});

describe('GET /api/reports/[id]/pdf', () => {
  it('resolves the report to its immutable submitted inspection contract', async () => {
    const { GET } = await import('@/app/api/reports/[id]/pdf/route');
    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get('x-sitecheck-submission-sha256')).toBe(
      'a'.repeat(64)
    );
    expect(renderMock).toHaveBeenCalledOnce();
    expect(new Set(fake.calls.map((call) => call.table))).toEqual(
      new Set(['reports', 'inspections', 'inspection_checklist_results'])
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

  it('fails closed for a legacy report without an inspection', async () => {
    fake = makeFakeSupabase({
      reports: { single: { id: 'report-1', inspection_id: null } },
    });
    requireAuth.mockResolvedValue({ user: { id: 'user-a' }, supabase: fake.client });
    const { GET } = await import('@/app/api/reports/[id]/pdf/route');
    const response = await GET(request(), context());

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: 'REPORT_NOT_INSPECTION_BACKED',
    });
    expect(fake.calls.map((call) => call.table)).toEqual(['reports']);
    expect(renderMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a report hidden by RLS', async () => {
    fake = makeFakeSupabase({ reports: { single: null } });
    requireAuth.mockResolvedValue({ user: { id: 'user-a' }, supabase: fake.client });
    const { GET } = await import('@/app/api/reports/[id]/pdf/route');
    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    expect(renderMock).not.toHaveBeenCalled();
  });
});
