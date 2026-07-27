/**
 * CMP-01 — pure helpers of the NOAA weather rewrite, focused on the
 * two defects that motivated it: the wind double-conversion and the
 * UTC-day bucketing that split California evening storms.
 */
import { describe, expect, it } from 'vitest';
import {
  localDayKey,
  mapNoaaCondition,
  parseWindMph,
  qpfInchesByLocalDay,
} from '@/lib/weather-api';

describe('parseWindMph', () => {
  it('parses simple and ranged NOAA wind strings without unit conversion', () => {
    expect(parseWindMph('10 mph')).toBe(10);
    expect(parseWindMph('10 to 20 mph')).toBe(20);
    expect(parseWindMph('')).toBe(0);
  });
});

describe('mapNoaaCondition', () => {
  const cases: Array<[string, string]> = [
    ['Sunny', 'clear'],
    ['Mostly Sunny', 'partly-cloudy'],
    ['Partly Cloudy', 'partly-cloudy'],
    ['Mostly Cloudy', 'cloudy'],
    ['Patchy Fog', 'fog'],
    ['Light Rain', 'light-rain'],
    ['Rain Showers Likely', 'rain'],
    ['Heavy Rain', 'heavy-rain'],
    ['Chance Showers And Thunderstorms', 'thunderstorm'],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}" → ${expected}`, () => {
      expect(mapNoaaCondition(input)).toBe(expected);
    });
  }
});

describe('localDayKey (America/Los_Angeles)', () => {
  it('keeps a California evening in its local day, not the UTC day', () => {
    // 9 PM PST on Feb 3 is 5 AM UTC on Feb 4 — the old code called
    // this "Feb 4" and split storms at 4 PM local.
    expect(localDayKey('2026-02-04T05:00:00Z')).toBe('2026-02-03');
    expect(localDayKey('2026-02-04T07:59:00Z')).toBe('2026-02-03');
    expect(localDayKey('2026-02-04T08:00:00Z')).toBe('2026-02-04');
  });
});

describe('qpfInchesByLocalDay', () => {
  it('converts mm to inches and buckets on local days', () => {
    // 12.7 mm = 0.5" falling entirely in one local afternoon.
    const byDay = qpfInchesByLocalDay([
      { validTime: '2026-02-03T20:00:00Z/PT1H', value: 12.7 },
    ]);
    expect(byDay.get('2026-02-03')).toBeCloseTo(0.5, 5);
  });

  it('keeps an evening PST storm on one local day (the old UTC split)', () => {
    // 4 PM–10 PM PST Feb 3 = 00:00–06:00 UTC Feb 4. One 6-hour interval
    // of 25.4 mm (1.0"). UTC bucketing put all of it on "Feb 4"; local
    // bucketing must put all of it on Feb 3.
    const byDay = qpfInchesByLocalDay([
      { validTime: '2026-02-04T00:00:00Z/PT6H', value: 25.4 },
    ]);
    expect(byDay.get('2026-02-03')).toBeCloseTo(1.0, 5);
    expect(byDay.get('2026-02-04')).toBeUndefined();
  });

  it('apportions an interval spanning local midnight across both days', () => {
    // 10 PM PST Feb 3 → 4 AM PST Feb 4 (06:00–12:00 UTC Feb 4), 6 mm.
    // 2 hours before local midnight, 4 after → 1/3 vs 2/3 split.
    const byDay = qpfInchesByLocalDay([
      { validTime: '2026-02-04T06:00:00Z/PT6H', value: 6 },
    ]);
    const feb3 = byDay.get('2026-02-03') ?? 0;
    const feb4 = byDay.get('2026-02-04') ?? 0;
    expect(feb3).toBeCloseTo((6 / 25.4) * (2 / 6), 5);
    expect(feb4).toBeCloseTo((6 / 25.4) * (4 / 6), 5);
  });

  it('ignores null and non-positive values', () => {
    const byDay = qpfInchesByLocalDay([
      { validTime: '2026-02-03T20:00:00Z/PT1H', value: null },
      { validTime: '2026-02-03T21:00:00Z/PT1H', value: 0 },
    ]);
    expect(byDay.size).toBe(0);
  });
});
