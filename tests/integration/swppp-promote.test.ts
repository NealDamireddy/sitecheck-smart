/**
 * Promoting extracted BMP drafts into checkpoints.
 *
 * This route is the human-in-the-loop gate for document ingestion: extraction
 * writes drafts and stops, and nothing the compliance product treats as real
 * exists until a QSP selects it here. These tests pin the parts of that gate
 * that would be easy to erode later.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({ requireAuth: () => requireAuth() }));
vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const PROJECT = { id: 'proj-1', center_lat: 36.778, center_lng: -119.417 };

const DRAFTS = [
  {
    id: 1,
    bmp_category: 'sediment-control',
    bmp_code: 'SE-1',
    title: 'Silt Fence',
    maintenance_threshold: 'Repair at 1/3 height',
    promoted_checkpoint_id: null,
  },
  {
    id: 2,
    bmp_category: 'erosion-control',
    bmp_code: 'EC-7',
    title: 'Geotextiles',
    maintenance_threshold: 'Replace when torn',
    promoted_checkpoint_id: null,
  },
];

let insertedRows: Record<string, unknown>[] = [];
let draftUpdates: Record<string, unknown>[] = [];
type DraftRow = {
  id: number;
  bmp_category: string;
  bmp_code: string;
  title: string;
  maintenance_threshold: string;
  promoted_checkpoint_id: string | null;
};

let draftRows: DraftRow[] = DRAFTS;
let projectRow: typeof PROJECT | null = PROJECT;

function stubSupabase() {
  return {
    from(table: string) {
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: projectRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'bmp_checkpoint_drafts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: async () => ({ data: draftRows, error: null }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              draftUpdates.push(payload);
              return { data: null, error: null };
            },
          }),
        };
      }
      if (table === 'checkpoints') {
        return {
          insert: (rows: Record<string, unknown>[]) => {
            insertedRows = rows;
            return {
              select: async () => ({
                data: rows.map((r) => ({ id: r.id })),
                error: null,
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function post(body: unknown) {
  return new NextRequest('http://test/promote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctx = () => ({
  params: Promise.resolve({ projectId: 'proj-1', documentId: 'doc-abcdef12' }),
});

beforeEach(() => {
  vi.clearAllMocks();
  insertedRows = [];
  draftUpdates = [];
  draftRows = DRAFTS;
  projectRow = PROJECT;
  requireAuth.mockResolvedValue({ user: { id: 'user-a' }, supabase: stubSupabase() });
});

describe('POST .../swppp/[documentId]/promote', () => {
  it('creates one checkpoint per selected draft', async () => {
    const { POST } = await import(
      '@/app/api/projects/[projectId]/swppp/[documentId]/promote/route'
    );
    const res = await POST(post({ draftIds: [1, 2] }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).created).toBe(2);
    expect(insertedRows).toHaveLength(2);
  });

  it('never lets the model set compliance status', async () => {
    // The product invariant: AI output is a draft. A promoted checkpoint
    // starts as needs-review, and only the QSP's Mark buttons change it.
    const { POST } = await import(
      '@/app/api/projects/[projectId]/swppp/[documentId]/promote/route'
    );
    await POST(post({ draftIds: [1, 2] }), ctx());
    for (const row of insertedRows) {
      expect(row.status).toBe('needs-review');
    }
  });

  it('places checkpoints around the project centre, never at a model guess', async () => {
    // AI-01: the extractor must not invent coordinates for a legal record.
    // Position comes from the project, and the QSP drags them into place.
    const { POST } = await import(
      '@/app/api/projects/[projectId]/swppp/[documentId]/promote/route'
    );
    await POST(post({ draftIds: [1, 2] }), ctx());
    for (const row of insertedRows) {
      expect(Math.abs(Number(row.lat) - PROJECT.center_lat)).toBeLessThan(0.01);
      expect(Math.abs(Number(row.lng) - PROJECT.center_lng)).toBeLessThan(0.01);
    }
    // Distinct positions, so they don't stack on one pin.
    expect(insertedRows[0].lat).not.toBe(insertedRows[1].lat);
  });

  it('carries the maintenance threshold onto the checkpoint', async () => {
    const { POST } = await import(
      '@/app/api/projects/[projectId]/swppp/[documentId]/promote/route'
    );
    await POST(post({ draftIds: [1] }), ctx());
    expect(insertedRows[0].description).toBe('Repair at 1/3 height');
  });

  it('links each draft back to the checkpoint it became', async () => {
    const { POST } = await import(
      '@/app/api/projects/[projectId]/swppp/[documentId]/promote/route'
    );
    await POST(post({ draftIds: [1, 2] }), ctx());
    expect(draftUpdates).toHaveLength(2);
    for (const update of draftUpdates) {
      expect(update.promoted_checkpoint_id).toBeTruthy();
      expect(update.reviewed_by).toBe('user-a');
    }
  });

  it('is idempotent — re-promoting creates nothing', async () => {
    draftRows = DRAFTS.map((d) => ({ ...d, promoted_checkpoint_id: 'cp-existing' }));
    const { POST } = await import(
      '@/app/api/projects/[projectId]/swppp/[documentId]/promote/route'
    );
    const res = await POST(post({ draftIds: [1, 2] }), ctx());
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.skipped).toBe(2);
    expect(insertedRows).toHaveLength(0);
  });

  it('rejects an empty selection — there is no promote-all shortcut', async () => {
    const { POST } = await import(
      '@/app/api/projects/[projectId]/swppp/[documentId]/promote/route'
    );
    expect((await POST(post({ draftIds: [] }), ctx())).status).toBe(400);
    expect((await POST(post({}), ctx())).status).toBe(400);
  });

  it('404s on a project the caller cannot see', async () => {
    // RLS returns nothing for another tenant's project; the route must not
    // confirm it exists.
    projectRow = null;
    const { POST } = await import(
      '@/app/api/projects/[projectId]/swppp/[documentId]/promote/route'
    );
    const res = await POST(post({ draftIds: [1] }), ctx());
    expect(res.status).toBe(404);
    expect(insertedRows).toHaveLength(0);
  });

  it('refuses a bmp_category the checkpoints CHECK would reject (DRF-01)', async () => {
    draftRows = [{ ...DRAFTS[0], bmp_category: 'trench-plug' }];
    const { POST } = await import(
      '@/app/api/projects/[projectId]/swppp/[documentId]/promote/route'
    );
    const res = await POST(post({ draftIds: [1] }), ctx());
    expect(res.status).toBe(422);
    expect(insertedRows).toHaveLength(0);
  });
});
