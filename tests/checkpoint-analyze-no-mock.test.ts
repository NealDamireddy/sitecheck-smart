/**
 * AI-02 — a real Claude Vision failure must return 502 and persist
 * nothing; the route must never write a fabricated analysis.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
}));

const analyzeBmpPhoto = vi.fn();
vi.mock('@/lib/ai-vision', () => ({
  analyzeBmpPhoto: (...args: unknown[]) => analyzeBmpPhoto(...args),
}));

vi.mock('@/lib/supabase/storage', () => ({
  resolveCheckpointPhotoUrl: async (v: string | null) => v,
}));

import { POST } from '@/app/api/checkpoints/[id]/analyze/route';

const insertSpy = vi.fn();

function stubSupabase() {
  return {
    from: (table: string) => {
      if (table === 'checkpoints') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'cp-1',
                  name: 'Silt Fence',
                  bmp_type: 'sediment-control',
                  cgp_section: 'X.H.1',
                  status: 'needs-review',
                  qsp_photo_url: 'https://example.com/photo.jpg',
                  last_inspection_photo: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'ai_analyses') {
        return {
          insert: (...args: unknown[]) => {
            insertSpy(...args);
            return {
              select: () => ({
                single: async () => ({ data: null, error: { message: 'x' } }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function ctx() {
  return { params: Promise.resolve({ id: 'cp-1' }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ user: { id: 'user-a' }, supabase: stubSupabase() });
});

describe('POST /api/checkpoints/[id]/analyze (AI-02)', () => {
  it('returns 502 and persists nothing when vision fails', async () => {
    analyzeBmpPhoto.mockRejectedValue(new Error('Anthropic 500'));
    const res = await POST(new NextRequest('http://test/x', { method: 'POST' }), ctx());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain('nothing was saved');
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('persists a successful (validated) analysis', async () => {
    analyzeBmpPhoto.mockResolvedValue({
      summary: 'Fence intact.',
      status: 'compliant',
      confidence: 90,
      details: [],
      cgpReference: '',
      recommendations: [],
      model: 'claude-sonnet-4-20250514',
      rawResponse: '{}',
    });
    await POST(new NextRequest('http://test/x', { method: 'POST' }), ctx());
    expect(insertSpy).toHaveBeenCalledOnce();
    expect(insertSpy.mock.calls[0][0]).toMatchObject({
      checkpoint_id: 'cp-1',
      status: 'compliant',
    });
  });
});
