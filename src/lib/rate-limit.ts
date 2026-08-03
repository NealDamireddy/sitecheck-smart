/**
 * Minimal per-user fixed-window rate limiter (SEC-10).
 *
 * In-memory and per server process — correct for the current
 * single-machine deployment where the Next.js server is one long-lived
 * node. If the app moves to multi-instance serverless, swap the store
 * for Redis behind the same interface (see docs/FOLLOW_UP.md).
 *
 * Applied to the routes that cost real money or spawn real processes:
 * Claude analysis, SWPPP extraction, and SMARTS bot launches.
 */

import { NextResponse } from 'next/server';

export interface RateLimitRule {
  /** Max requests per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

interface WindowState {
  windowStart: number;
  count: number;
}

const MAX_TRACKED_KEYS = 10_000;

export class FixedWindowLimiter {
  private hits = new Map<string, WindowState>();

  constructor(
    private rule: RateLimitRule,
    private now: () => number = Date.now
  ) {}

  /** Record an attempt for `key`; report whether it is allowed. */
  check(key: string): { allowed: boolean; retryAfterSec: number } {
    const t = this.now();
    const state = this.hits.get(key);

    if (!state || t - state.windowStart >= this.rule.windowMs) {
      if (this.hits.size >= MAX_TRACKED_KEYS) this.sweep(t);
      this.hits.set(key, { windowStart: t, count: 1 });
      return { allowed: true, retryAfterSec: 0 };
    }

    if (state.count < this.rule.limit) {
      state.count += 1;
      return { allowed: true, retryAfterSec: 0 };
    }

    const retryAfterMs = state.windowStart + this.rule.windowMs - t;
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  private sweep(t: number): void {
    for (const [key, state] of this.hits) {
      if (t - state.windowStart >= this.rule.windowMs) this.hits.delete(key);
    }
  }
}

/**
 * Route helper: returns a 429 NextResponse when the user is over the
 * limit, or null when the request may proceed.
 */
export function rateLimitOrNull(
  limiter: FixedWindowLimiter,
  userId: string,
  what: string
): NextResponse | null {
  const { allowed, retryAfterSec } = limiter.check(userId);
  if (allowed) return null;
  return NextResponse.json(
    {
      error: `Too many ${what} requests — try again in ${retryAfterSec}s.`,
    },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
  );
}

// Shared instances — module scope so all requests in the process share
// the same counters.
export const analyzeLimiter = new FixedWindowLimiter({ limit: 20, windowMs: 60_000 });
export const swpppScanLimiter = new FixedWindowLimiter({ limit: 5, windowMs: 10 * 60_000 });
export const smartsSyncLimiter = new FixedWindowLimiter({ limit: 3, windowMs: 5 * 60_000 });
export const forecastCaptureLimiter = new FixedWindowLimiter({ limit: 12, windowMs: 60_000 });
