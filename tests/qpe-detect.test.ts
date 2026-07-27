/**
 * CMP-01/CMP-02 — QPE detection engine boundary tests.
 * Fixed clock everywhere; no Date.now() in assertions.
 */
import { describe, expect, it } from 'vitest';
import {
  detectPrecipitationEvents,
  latestQualifyingEvent,
  type ObservedHour,
} from '@/lib/qpe/detect';

const NOW = new Date('2026-02-10T12:00:00Z');

/** n hours before NOW, as an ISO instant. */
function hoursAgo(n: number): string {
  return new Date(NOW.getTime() - n * 3_600_000).toISOString();
}

function rain(hoursBack: number, inches: number): ObservedHour {
  return { time: hoursAgo(hoursBack), inches };
}

describe('QPE threshold boundary (0.49 / 0.50 / 0.51)', () => {
  function eventWithTotal(total: number) {
    // Ended >48h ago so the event is closed and unambiguous.
    const events = detectPrecipitationEvents(
      [rain(60, total / 2), rain(59, total / 2)],
      NOW
    );
    expect(events).toHaveLength(1);
    return events[0];
  }

  it('0.49" does not qualify', () => {
    expect(eventWithTotal(0.49).qualifies).toBe(false);
  });
  it('0.50" exactly qualifies (≥, not >)', () => {
    expect(eventWithTotal(0.5).qualifies).toBe(true);
  });
  it('0.51" qualifies', () => {
    expect(eventWithTotal(0.51).qualifies).toBe(true);
  });
});

describe('48-hour separation boundary (47h / 48h / 49h gaps)', () => {
  function eventsWithGap(gapHours: number) {
    // First burst, dry gap, second burst; both bursts well in the past.
    const first = rain(120, 0.3);
    const second = rain(120 - gapHours, 0.3);
    return detectPrecipitationEvents([first, second], NOW);
  }

  it('a 47-hour gap does NOT split the event — same storm', () => {
    const events = eventsWithGap(47);
    expect(events).toHaveLength(1);
    expect(events[0].totalInches).toBeCloseTo(0.6, 5);
    expect(events[0].qualifies).toBe(true);
  });

  it('a 48-hour gap exactly splits into two distinct events', () => {
    const events = eventsWithGap(48);
    expect(events).toHaveLength(2);
    expect(events[0].qualifies).toBe(false); // 0.3" each — neither qualifies
    expect(events[1].qualifies).toBe(false);
  });

  it('a 49-hour gap splits into two distinct events', () => {
    expect(eventsWithGap(49)).toHaveLength(2);
  });
});

describe('event lifecycle', () => {
  it('an event is ongoing until 48 dry hours have elapsed', () => {
    const stillOpen = detectPrecipitationEvents([rain(10, 0.6)], NOW);
    expect(stillOpen[0].ongoing).toBe(true);

    const closed = detectPrecipitationEvents([rain(49, 0.6)], NOW);
    expect(closed[0].ongoing).toBe(false);
  });

  it('trace precipitation (≤0.005") neither starts nor extends an event', () => {
    expect(detectPrecipitationEvents([rain(10, 0.004)], NOW)).toHaveLength(0);
    // Trace between bursts: the 48h gap math must ignore the trace hour.
    const events = detectPrecipitationEvents(
      [rain(120, 0.3), rain(96, 0.004), rain(60, 0.3)],
      NOW
    );
    // 60h real gap ≥ 48h → two events despite the trace blip between.
    expect(events).toHaveLength(2);
  });

  it('future-dated observations are ignored', () => {
    const events = detectPrecipitationEvents(
      [{ time: new Date(NOW.getTime() + 3_600_000).toISOString(), inches: 5 }],
      NOW
    );
    expect(events).toHaveLength(0);
  });

  it('handles out-of-order and sparse series', () => {
    const events = detectPrecipitationEvents(
      [rain(50, 0.2), rain(55, 0.2), rain(52, 0.2)],
      NOW
    );
    expect(events).toHaveLength(1);
    expect(events[0].totalInches).toBeCloseTo(0.6, 5);
    expect(events[0].wetHours).toBe(3);
  });
});

describe('latestQualifyingEvent', () => {
  it('returns the most recent qualifying event within the lookback', () => {
    const hours = [
      rain(150, 0.7), // old qualifying event (ends >48h before next)
      rain(20, 0.6), // recent qualifying event
    ];
    const latest = latestQualifyingEvent(hours, NOW, 7);
    expect(latest).not.toBeNull();
    expect(latest!.startedAt).toBe(hoursAgo(20));
  });

  it('ignores qualifying events older than the lookback', () => {
    const latest = latestQualifyingEvent([rain(24 * 8, 0.9)], NOW, 7);
    expect(latest).toBeNull();
  });

  it('returns null when only sub-threshold rain fell', () => {
    expect(latestQualifyingEvent([rain(20, 0.3)], NOW, 7)).toBeNull();
  });
});
