/**
 * SEC-02 — the remote-migration endpoint must be dead in production
 * builds unless explicitly re-enabled, and must never run migrations
 * without the admin token.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const runMigrations = vi.fn();
vi.mock('@/lib/migrations/runner', () => ({
  runMigrations: (...args: unknown[]) => runMigrations(...args),
}));

import { POST } from '@/app/api/admin/apply-migrations/route';

function post(token?: string) {
  return POST(
    new NextRequest('http://test/api/admin/apply-migrations', {
      method: 'POST',
      headers: token ? { 'x-admin-token': token } : {},
    })
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/admin/apply-migrations guard (SEC-02)', () => {
  it('answers 404 in production even with a valid token', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_MIGRATION_TOKEN', 'secret-token');
    const res = await post('secret-token');
    expect(res.status).toBe(404);
    expect(runMigrations).not.toHaveBeenCalled();
  });

  it('can be explicitly re-enabled in production for a migration window', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_REMOTE_MIGRATIONS', '1');
    vi.stubEnv('ADMIN_MIGRATION_TOKEN', 'secret-token');
    runMigrations.mockResolvedValue({ ok: true, applied: [] });
    const res = await post('secret-token');
    expect(res.status).toBe(200);
    expect(runMigrations).toHaveBeenCalledOnce();
  });

  it('rejects a missing token outside production', async () => {
    vi.stubEnv('ADMIN_MIGRATION_TOKEN', 'secret-token');
    const res = await post(undefined);
    expect(res.status).toBe(401);
    expect(runMigrations).not.toHaveBeenCalled();
  });

  it('rejects a wrong token outside production', async () => {
    vi.stubEnv('ADMIN_MIGRATION_TOKEN', 'secret-token');
    const res = await post('wrong-token');
    expect(res.status).toBe(401);
    expect(runMigrations).not.toHaveBeenCalled();
  });
});
