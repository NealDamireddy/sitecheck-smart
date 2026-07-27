/**
 * Exhaustive unauthenticated-access matrix: one case per
 * (route × verb) across every route classified auth:'user'.
 *
 * Each handler is invoked for real with `requireAuth()` mocked to the
 * unauthenticated result. Two assertions per case:
 *   1. the response is 401 (never 200, never a body with data);
 *   2. the handler touched no table — an unauthenticated request must
 *      not reach the database at all, even to read.
 *
 * Table-driven on tests/support/route-manifest.ts, so a new route is
 * covered the moment it is classified (and route-inventory.test.ts
 * fails until it is).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { USER_AUTH_ROUTES, type Verb } from '../support/route-manifest';
import { makeFakeSupabase, type FakeSupabase } from '../support/fake-supabase';

const UNAUTHORIZED = () =>
  NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

let fake: FakeSupabase;

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(async () => ({ error: UNAUTHORIZED() })),
}));

// Anything a route might reach around the auth guard is stubbed so a
// failure here means "auth was bypassed", never "a dependency blew up".
vi.mock('@/lib/supabase/server', () => ({
  createAuthClient: async () => fake.client,
  createAdminClient: () => fake.client,
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => {
        throw new Error('Anthropic must never be called by an unauthenticated request');
      },
    };
  },
}));

beforeEach(() => {
  fake = makeFakeSupabase();
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
});

/** Params generous enough for any dynamic segment in the manifest. */
function routeContext() {
  return {
    params: Promise.resolve({
      id: 'other-tenant-resource',
      projectId: 'other-tenant-project',
      jobId: '11111111-2222-3333-4444-555555555555',
      missionId: 'other-tenant-mission',
      number: '1',
    }),
  };
}

function requestFor(verb: Verb, path: string): NextRequest {
  const url = `http://localhost:3000${path.replace(/\[(\w+)\]/g, 'x')}?projectId=other-tenant-project`;
  if (verb === 'GET' || verb === 'DELETE') {
    return new NextRequest(url, { method: verb });
  }
  return new NextRequest(url, {
    method: verb,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'other-tenant-project' }),
  });
}

describe('unauthenticated access is refused on every user-facing route', () => {
  for (const route of USER_AUTH_ROUTES) {
    for (const verb of route.verbs) {
      it(`${verb} ${route.path} → 401, no DB access`, async () => {
        const mod = (await import(
          /* @vite-ignore */ `@/app/${route.file.replace(/\.ts$/, '')}`
        )) as Record<string, (req: NextRequest, ctx: unknown) => Promise<Response>>;

        const handler = mod[verb];
        expect(handler, `${route.file} exports no ${verb}`).toBeTypeOf('function');

        const res = await handler(requestFor(verb, route.path), routeContext());

        expect(res.status, `${verb} ${route.path} should be 401`).toBe(401);
        expect(
          fake.calls,
          `${verb} ${route.path} touched the database while unauthenticated: ` +
            JSON.stringify(fake.calls)
        ).toEqual([]);
      });
    }
  }
});
