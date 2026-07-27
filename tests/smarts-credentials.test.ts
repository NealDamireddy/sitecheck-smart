/**
 * SEC-08 — the server-env SMARTS credential fallback must be opt-in,
 * plus roundtrip coverage of the AES-256-GCM helpers.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decryptPassword,
  encryptPassword,
  resolveSmartsCredentials,
  smartsCredentialStatus,
} from '@/lib/smarts/credentials';
import type { createAuthClient } from '@/lib/supabase/server';

type AuthedSupabase = Awaited<ReturnType<typeof createAuthClient>>;

const TEST_KEY = 'a'.repeat(64); // 32-byte hex key for AES-256-GCM

interface StubRow {
  username: string;
  password_ciphertext: string;
  updated_at: string;
}

// Minimal structural stub of the one query chain credentials.ts uses.
// Cast is confined to this test helper.
function stubSupabase(row: StubRow | null): AuthedSupabase {
  const chain = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    }),
  };
  return chain as unknown as AuthedSupabase;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('encryptPassword / decryptPassword', () => {
  it('roundtrips and never stores plaintext', () => {
    vi.stubEnv('SMARTS_CREDENTIALS_KEY', TEST_KEY);
    const ciphertext = encryptPassword('hunter2-portal-pass');
    expect(ciphertext).not.toContain('hunter2');
    expect(ciphertext.split(':')).toHaveLength(3);
    expect(decryptPassword(ciphertext)).toBe('hunter2-portal-pass');
  });

  it('refuses a missing or malformed key', () => {
    vi.stubEnv('SMARTS_CREDENTIALS_KEY', 'not-a-key');
    expect(() => encryptPassword('x')).toThrow(/SMARTS_CREDENTIALS_KEY/);
  });
});

describe('resolveSmartsCredentials fallback gating (SEC-08)', () => {
  it('uses saved per-user credentials when present', async () => {
    vi.stubEnv('SMARTS_CREDENTIALS_KEY', TEST_KEY);
    const resolved = await resolveSmartsCredentials(
      stubSupabase({
        username: 'inspector-a',
        password_ciphertext: encryptPassword('their-own-pass'),
        updated_at: '2026-07-27T00:00:00Z',
      }),
      'user-a'
    );
    expect(resolved).toMatchObject({
      username: 'inspector-a',
      password: 'their-own-pass',
      source: 'account',
    });
  });

  it('does NOT fall back to the shared env account by default', async () => {
    vi.stubEnv('SMARTS_USERNAME', 'shared-account');
    vi.stubEnv('SMARTS_PASSWORD', 'shared-pass');
    const resolved = await resolveSmartsCredentials(stubSupabase(null), 'user-a');
    expect(resolved).toBeNull();
  });

  it('falls back only when SMARTS_ALLOW_ENV_FALLBACK=1', async () => {
    vi.stubEnv('SMARTS_USERNAME', 'shared-account');
    vi.stubEnv('SMARTS_PASSWORD', 'shared-pass');
    vi.stubEnv('SMARTS_ALLOW_ENV_FALLBACK', '1');
    const resolved = await resolveSmartsCredentials(stubSupabase(null), 'user-a');
    expect(resolved).toMatchObject({
      username: 'shared-account',
      source: 'server-env',
    });
  });

  it('status reporting honors the same gate', async () => {
    vi.stubEnv('SMARTS_USERNAME', 'shared-account');
    vi.stubEnv('SMARTS_PASSWORD', 'shared-pass');
    const gated = await smartsCredentialStatus(stubSupabase(null), 'user-a');
    expect(gated).toMatchObject({ configured: false, source: null });

    vi.stubEnv('SMARTS_ALLOW_ENV_FALLBACK', '1');
    const open = await smartsCredentialStatus(stubSupabase(null), 'user-a');
    expect(open).toMatchObject({ configured: true, source: 'server-env' });
  });
});
