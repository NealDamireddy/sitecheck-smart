/**
 * SEC-03 — the client-settable `sitecheck_demo` cookie must not bypass
 * the login wall in production.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The middleware constructs a Supabase SSR client on every request; stub
// it to an unauthenticated session so the demo-cookie branch decides.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  }),
}));

import { middleware } from '@/middleware';

function dashboardRequestWithDemoCookie() {
  const request = new NextRequest('http://localhost/dashboard');
  request.cookies.set('sitecheck_demo', '1');
  return request;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('middleware demo-cookie gate (SEC-03)', () => {
  it('lets the demo cookie through outside production (dev preview)', async () => {
    const res = await middleware(dashboardRequestWithDemoCookie());
    expect(res.status).toBe(200); // pass-through, no redirect
  });

  it('redirects to /login in production despite the demo cookie', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await middleware(dashboardRequestWithDemoCookie());
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('still redirects unauthenticated users with no cookie in any env', async () => {
    const res = await middleware(new NextRequest('http://localhost/dashboard'));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get('location')).toContain('/login');
  });
});
