/**
 * GET /api/projects must never fabricate projects.
 *
 * The route used to answer an empty result set — and any thrown error —
 * with the bundled demo projects (`riverside-phase2` + the linear demo).
 * Every brand-new account therefore opened onto a Fresno site it did not
 * own, and a genuine "no sites yet" state was indistinguishable from
 * seeded data. The client stores keep their static fallbacks behind
 * isDemoSession() for precisely this reason; this route has to match.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({ requireAuth: () => requireAuth() }));
vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** Minimal supabase double: .from(...).select(...).order(...) resolves. */
function supabaseReturning(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve(result),
      }),
    }),
  };
}

function supabaseThrowing() {
  return {
    from: () => ({
      select: () => ({
        order: () => Promise.reject(new Error('connection reset')),
      }),
    }),
  };
}

async function callGet() {
  const { GET } = await import('@/app/api/projects/route');
  return GET();
}

describe('GET /api/projects empty state', () => {
  beforeEach(() => {
    vi.resetModules();
    requireAuth.mockReset();
  });

  it('returns an empty array when the account owns no projects', async () => {
    requireAuth.mockResolvedValue({
      error: null,
      supabase: supabaseReturning({ data: [], error: null }),
      user: { id: 'u1' },
    });

    const res = await callGet();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it('does not leak the bundled demo projects to a new account', async () => {
    requireAuth.mockResolvedValue({
      error: null,
      supabase: supabaseReturning({ data: [], error: null }),
      user: { id: 'u1' },
    });

    const body = JSON.stringify(await (await callGet()).json());

    expect(body).not.toContain('riverside-phase2');
    expect(body).not.toContain('Riverside');
    expect(body).not.toContain('Sarah Chen');
    expect(body).not.toContain('Fresno');
  });

  it('fails loudly on a query error instead of returning fake projects', async () => {
    requireAuth.mockResolvedValue({
      error: null,
      supabase: supabaseThrowing(),
      user: { id: 'u1' },
    });

    const res = await callGet();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('riverside-phase2');
  });

  it('still returns the account\'s real projects when it has them', async () => {
    requireAuth.mockResolvedValue({
      error: null,
      supabase: supabaseReturning({
        data: [{ id: 'proj-real', name: 'Real Site', project_type: 'bounded-site' }],
        error: null,
      }),
      user: { id: 'u1' },
    });

    const body = await (await callGet()).json();

    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('proj-real');
  });
});
