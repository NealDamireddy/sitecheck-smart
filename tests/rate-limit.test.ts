/**
 * SEC-10 — fixed-window rate limiter, driven by an injected clock
 * (no Date.now() in assertions).
 */
import { describe, expect, it } from 'vitest';
import { FixedWindowLimiter, rateLimitOrNull } from '@/lib/rate-limit';

function limiterAt(limit: number, windowMs: number) {
  let t = 0;
  const limiter = new FixedWindowLimiter({ limit, windowMs }, () => t);
  return {
    limiter,
    advance(ms: number) {
      t += ms;
    },
  };
}

describe('FixedWindowLimiter', () => {
  it('allows up to the limit inside one window, then blocks', () => {
    const { limiter } = limiterAt(3, 60_000);
    expect(limiter.check('user-a').allowed).toBe(true);
    expect(limiter.check('user-a').allowed).toBe(true);
    expect(limiter.check('user-a').allowed).toBe(true);
    const fourth = limiter.check('user-a');
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSec).toBeGreaterThan(0);
  });

  it('tracks users independently', () => {
    const { limiter } = limiterAt(1, 60_000);
    expect(limiter.check('user-a').allowed).toBe(true);
    expect(limiter.check('user-b').allowed).toBe(true);
    expect(limiter.check('user-a').allowed).toBe(false);
  });

  it('resets when the window rolls over', () => {
    const { limiter, advance } = limiterAt(1, 60_000);
    expect(limiter.check('user-a').allowed).toBe(true);
    expect(limiter.check('user-a').allowed).toBe(false);
    advance(59_999);
    expect(limiter.check('user-a').allowed).toBe(false);
    advance(1);
    expect(limiter.check('user-a').allowed).toBe(true);
  });

  it('reports an accurate retry-after', () => {
    const { limiter, advance } = limiterAt(1, 60_000);
    limiter.check('user-a');
    advance(45_000);
    expect(limiter.check('user-a').retryAfterSec).toBe(15);
  });
});

describe('rateLimitOrNull', () => {
  it('returns null while allowed and a 429 with Retry-After once blocked', async () => {
    const { limiter } = limiterAt(1, 60_000);
    expect(rateLimitOrNull(limiter, 'user-a', 'AI analysis')).toBeNull();
    const blocked = rateLimitOrNull(limiter, 'user-a', 'AI analysis');
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
    expect(blocked!.headers.get('Retry-After')).toBe('60');
    const body = await blocked!.json();
    expect(body.error).toContain('AI analysis');
  });
});
