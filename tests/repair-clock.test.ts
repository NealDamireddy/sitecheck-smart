/**
 * CGP 72-hour repair clock: created → due → overdue, including across a
 * DST boundary. Fixed instants throughout — never Date.now().
 */
import { describe, expect, it } from 'vitest';
import { REPAIR_START_HOURS } from '@/lib/cgp/constants';

/** The rule the deficiencies route applies server-side. */
function repairDeadline(detectedIso: string): string {
  return new Date(
    new Date(detectedIso).getTime() + REPAIR_START_HOURS * 3_600_000
  ).toISOString();
}

function isOverdue(deadlineIso: string, now: string): boolean {
  return new Date(now).getTime() > new Date(deadlineIso).getTime();
}

describe('repair deadline computation', () => {
  it('is exactly 72 hours after detection', () => {
    expect(repairDeadline('2026-02-10T08:00:00.000Z')).toBe(
      '2026-02-13T08:00:00.000Z'
    );
  });

  it('stays 72 real hours across the US spring-forward transition', () => {
    // PST→PDT happens 2026-03-08 02:00 local. A deficiency found the
    // evening before must still get 72 ELAPSED hours, not 71 — the
    // clock is instant-based, so the wall-clock hour shifts but the
    // duration does not.
    const detected = '2026-03-07T18:00:00.000Z';
    const deadline = repairDeadline(detected);
    expect(deadline).toBe('2026-03-10T18:00:00.000Z');
    const elapsedHours =
      (new Date(deadline).getTime() - new Date(detected).getTime()) / 3_600_000;
    expect(elapsedHours).toBe(72);
  });

  it('stays 72 real hours across the fall-back transition', () => {
    const detected = '2026-10-31T18:00:00.000Z';
    const deadline = repairDeadline(detected);
    const elapsedHours =
      (new Date(deadline).getTime() - new Date(detected).getTime()) / 3_600_000;
    expect(elapsedHours).toBe(72);
  });

  it('handles a detection at an exact UTC midnight', () => {
    expect(repairDeadline('2026-02-10T00:00:00.000Z')).toBe(
      '2026-02-13T00:00:00.000Z'
    );
  });
});

describe('overdue transitions', () => {
  const detected = '2026-02-10T08:00:00.000Z';
  const deadline = repairDeadline(detected);

  it('is not overdue immediately after detection', () => {
    expect(isOverdue(deadline, detected)).toBe(false);
  });

  it('is not overdue one minute before the deadline', () => {
    expect(isOverdue(deadline, '2026-02-13T07:59:00.000Z')).toBe(false);
  });

  it('is not overdue AT the deadline instant (boundary is inclusive)', () => {
    expect(isOverdue(deadline, '2026-02-13T08:00:00.000Z')).toBe(false);
  });

  it('is overdue one minute past the deadline', () => {
    expect(isOverdue(deadline, '2026-02-13T08:01:00.000Z')).toBe(true);
  });
});

describe('server-side clamping (CMP-06)', () => {
  /** Mirrors the deficiencies route: client may tighten, never extend. */
  function effectiveDeadline(
    detectedIso: string,
    clientDeadline?: string
  ): string {
    const regulatory = repairDeadline(detectedIso);
    return clientDeadline && clientDeadline < regulatory ? clientDeadline : regulatory;
  }

  const detected = '2026-02-10T08:00:00.000Z';

  it('accepts a tighter client deadline', () => {
    const tighter = '2026-02-11T08:00:00.000Z';
    expect(effectiveDeadline(detected, tighter)).toBe(tighter);
  });

  it('rejects a client deadline past the regulatory limit', () => {
    const tooLate = '2026-03-01T08:00:00.000Z';
    expect(effectiveDeadline(detected, tooLate)).toBe(repairDeadline(detected));
  });

  it('defaults to the regulatory deadline when the client sends none', () => {
    expect(effectiveDeadline(detected)).toBe(repairDeadline(detected));
  });
});
