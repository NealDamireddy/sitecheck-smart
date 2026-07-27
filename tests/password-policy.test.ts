/**
 * ACC-01 — shared password rules and the recovery redirect.
 *
 * The page-level flow (email → link → new password) is covered by the
 * Stage 5 E2E suite; these lock the logic the three entry points share.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  buildPasswordResetRedirect,
  validateNewPassword,
} from '@/lib/auth/password-policy';

describe('validateNewPassword', () => {
  it('accepts a long enough matching pair', () => {
    expect(validateNewPassword('correct-horse', 'correct-horse')).toEqual({
      ok: true,
    });
  });

  it('rejects a password shorter than the minimum', () => {
    const result = validateNewPassword('short', 'short');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it('accepts exactly the minimum length (boundary)', () => {
    const exact = 'x'.repeat(MIN_PASSWORD_LENGTH);
    expect(validateNewPassword(exact, exact).ok).toBe(true);
    const oneShort = 'x'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateNewPassword(oneShort, oneShort).ok).toBe(false);
  });

  it('rejects a mismatched confirmation', () => {
    const result = validateNewPassword('correct-horse', 'correct-house');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/do not match/i);
  });

  it('reports length before mismatch when both are wrong', () => {
    const result = validateNewPassword('a', 'b');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(String(MIN_PASSWORD_LENGTH));
  });
});

describe('buildPasswordResetRedirect', () => {
  it('routes through the auth callback to the reset screen', () => {
    expect(buildPasswordResetRedirect('https://app.sitecheck.com')).toBe(
      'https://app.sitecheck.com/auth/callback?redirect=%2Fauth%2Freset-password'
    );
  });

  it('normalizes a trailing slash', () => {
    expect(buildPasswordResetRedirect('http://localhost:3000/')).toBe(
      'http://localhost:3000/auth/callback?redirect=%2Fauth%2Freset-password'
    );
  });

  it('never leaves the caller origin', () => {
    for (const origin of [
      'https://app.sitecheck.com',
      'http://localhost:3000',
      'https://sitecheck.vercel.app',
    ]) {
      expect(buildPasswordResetRedirect(origin).startsWith(origin)).toBe(true);
    }
  });
});
