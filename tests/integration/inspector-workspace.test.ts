import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({ requireAuth: () => requireAuth() }));
vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const ORG_ID = '33333333-3333-4333-8333-333333333333';

let membershipRole = 'qsp';
let upserts: Array<{ table: string; row: Record<string, unknown> }>;

function resultFor(table: string, mode: 'single' | 'many') {
  if (table === 'projects') {
    return { data: { id: 'site-1', name: 'Site One', org_id: ORG_ID }, error: null };
  }
  if (table === 'organizations') {
    return { data: { name: 'SiteCheck Co' }, error: null };
  }
  if (table === 'org_memberships') {
    return { data: { role: membershipRole }, error: null };
  }
  if (table === 'inspector_profiles') {
    if (mode === 'many') {
      return {
        data: [
          { user_id: USER_ID, display_name: 'QSP One', title: 'QSP', status: 'active' },
          { user_id: OTHER_USER_ID, display_name: 'Inspector Two', title: 'Inspector', status: 'active' },
        ],
        error: null,
      };
    }
    return {
      data: {
        user_id: USER_ID,
        display_name: 'QSP One',
        title: 'QSP',
        license_number: 'QSP-1',
        phone: null,
        status: 'active',
      },
      error: null,
    };
  }
  if (table === 'project_inspector_assignments') {
    if (mode === 'many') {
      return {
        data: [
          {
            id: 'assignment-1',
            inspector_user_id: USER_ID,
            assignment_role: 'lead',
            status: 'active',
            assigned_at: '2026-08-07T10:00:00Z',
            ended_at: null,
          },
        ],
        error: null,
      };
    }
    return {
      data: {
        id: 'assignment-1',
        assignment_role: 'lead',
        status: 'active',
        assigned_at: '2026-08-07T10:00:00Z',
        ended_at: null,
      },
      error: null,
    };
  }
  return { data: null, error: null };
}

function supabaseStub() {
  return {
    from(table: string) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        order() {
          return Promise.resolve(resultFor(table, 'many'));
        },
        maybeSingle() {
          return Promise.resolve(resultFor(table, 'single'));
        },
        upsert(row: Record<string, unknown>) {
          upserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
        then<TResult1 = unknown, TResult2 = never>(
          onFulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
          onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          return Promise.resolve(resultFor(table, 'many')).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  membershipRole = 'qsp';
  upserts = [];
  requireAuth.mockResolvedValue({
    user: { id: USER_ID },
    supabase: supabaseStub(),
  });
});

describe('/api/inspector-workspace', () => {
  it('returns current readiness plus a manager-safe inspector directory', async () => {
    const { GET } = await import('@/app/api/inspector-workspace/route');
    const response = await GET(
      new NextRequest('http://test/api/inspector-workspace?projectId=site-1')
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      project: { id: 'site-1', companyName: 'SiteCheck Co' },
      membershipRole: 'qsp',
      canManageAssignments: true,
      ready: true,
      profile: { displayName: 'QSP One' },
      team: [
        { displayName: 'QSP One', assignment: { assignmentRole: 'lead' } },
        { displayName: 'Inspector Two', assignment: null },
      ],
    });
  });

  it('lets a QSP assign an active inspector profile to the selected site', async () => {
    const { PATCH } = await import('@/app/api/inspector-workspace/route');
    const response = await PATCH(
      new NextRequest('http://test/api/inspector-workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'site-1',
          userId: OTHER_USER_ID,
          assignmentRole: 'inspector',
          status: 'active',
        }),
      })
    );
    expect(response.status).toBe(200);
    expect(upserts).toContainEqual({
      table: 'project_inspector_assignments',
      row: expect.objectContaining({
        project_id: 'site-1',
        inspector_user_id: OTHER_USER_ID,
        assignment_role: 'inspector',
        status: 'active',
      }),
    });
  });

  it('does not let ordinary inspectors manage another inspector assignment', async () => {
    membershipRole = 'inspector';
    const { PATCH } = await import('@/app/api/inspector-workspace/route');
    const response = await PATCH(
      new NextRequest('http://test/api/inspector-workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'site-1',
          userId: OTHER_USER_ID,
          assignmentRole: 'inspector',
          status: 'active',
        }),
      })
    );
    expect(response.status).toBe(403);
    expect(upserts).toEqual([]);
  });
});
