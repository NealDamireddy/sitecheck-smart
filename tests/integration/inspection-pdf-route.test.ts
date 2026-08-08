import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
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
const context = () => ({ params: Promise.resolve({ id: 'insp-1' }) });
const request = () => new NextRequest('http://test/api/inspections/insp-1/pdf');
let fake: FakeSupabase;

beforeEach(() => {
  renderMock.mockReset();
  renderMock.mockResolvedValue(Buffer.from('%PDF-1.7\ncontract-pdf'));
  fake = makeFakeSupabase({
    inspections: { single: inspectionReportSnapshot() },
    inspection_checklist_results: { rows: inspectionReportResults() },
  });
  requireAuth.mockResolvedValue({ user: { id: 'user-a' }, supabase: fake.client });
});

describe('GET /api/inspections/[id]/pdf', () => {
  it('renders only from the inspection and immutable checklist snapshots', async () => {
    const { GET } = await import('@/app/api/inspections/[id]/pdf/route');
    const response = await GET(request(), context());
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(body.toString()).toContain('%PDF-1.7');
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain(
      'sitecheck-inspection-4003-equus-ct-insp-1.pdf'
    );
    expect(response.headers.get('x-sitecheck-contract-version')).toBe(
      'sitecheck-cgp-inspection-report-v1'
    );
    expect(response.headers.get('x-sitecheck-submission-sha256')).toBe(
      'a'.repeat(64)
    );
    expect(renderMock).toHaveBeenCalledOnce();
    expect(new Set(fake.calls.map((call) => call.table))).toEqual(
      new Set(['inspections', 'inspection_checklist_results'])
    );
    expect(fake.calls).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'projects' }),
        expect.objectContaining({ table: 'checkpoints' }),
        expect.objectContaining({ table: 'deficiencies' }),
        expect.objectContaining({ table: 'weather_snapshots' }),
        expect.objectContaining({ table: 'qsp_profiles' }),
        expect.objectContaining({ table: 'reports' }),
      ])
    );
    expect(fake.writes()).toEqual([]);
  });

  it('returns 404 for an inspection hidden by RLS without rendering', async () => {
    fake = makeFakeSupabase({ inspections: { single: null } });
    requireAuth.mockResolvedValue({ user: { id: 'user-a' }, supabase: fake.client });
    const { GET } = await import('@/app/api/inspections/[id]/pdf/route');
    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    expect(renderMock).not.toHaveBeenCalled();
    expect(fake.calls.map((call) => call.table)).toEqual(['inspections']);
  });

  it('returns 409 for a draft inspection', async () => {
    fake = makeFakeSupabase({
      inspections: { single: inspectionReportSnapshot({ status: 'draft' }) },
      inspection_checklist_results: { rows: inspectionReportResults() },
    });
    requireAuth.mockResolvedValue({ user: { id: 'user-a' }, supabase: fake.client });
    const { GET } = await import('@/app/api/inspections/[id]/pdf/route');
    const response = await GET(request(), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'INSPECTION_NOT_SUBMITTED' });
    expect(renderMock).not.toHaveBeenCalled();
  });

  it('returns 422 for an incomplete compliance snapshot', async () => {
    fake = makeFakeSupabase({
      inspections: {
        single: inspectionReportSnapshot({ checklist_submission_sha256: null }),
      },
      inspection_checklist_results: { rows: inspectionReportResults() },
    });
    requireAuth.mockResolvedValue({ user: { id: 'user-a' }, supabase: fake.client });
    const { GET } = await import('@/app/api/inspections/[id]/pdf/route');
    const response = await GET(request(), context());

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: 'INCONSISTENT_REPORT_SNAPSHOT',
    });
    expect(renderMock).not.toHaveBeenCalled();
  });

  it('returns a generic 500 when PDF rendering fails', async () => {
    renderMock.mockRejectedValue(new Error('internal renderer detail'));
    const { GET } = await import('@/app/api/inspections/[id]/pdf/route');
    const response = await GET(request(), context());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Failed to render PDF' });
    expect(JSON.stringify(body)).not.toContain('internal renderer detail');
  });

  it('returns the authentication response without querying or rendering', async () => {
    requireAuth.mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const { GET } = await import('@/app/api/inspections/[id]/pdf/route');
    const response = await GET(request(), context());

    expect(response.status).toBe(401);
    expect(fake.calls).toEqual([]);
    expect(renderMock).not.toHaveBeenCalled();
  });
});
