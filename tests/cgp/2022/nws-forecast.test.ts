import { describe, expect, it } from 'vitest';
import {
  buildQpeForecastSequences,
  evaluateQpeForecast,
  normalizeNwsGridForecast,
  type NormalizedNwsSixHourInterval,
  type NwsGridSeries,
} from '@/lib/cgp/2022';
import { hashForecastPayload } from '@/lib/cgp/2022/nws-capture';

function gridSeries(
  uom: string,
  values: Array<{ start: string; hours: number; value: number | null }>
): NwsGridSeries {
  return {
    uom,
    values: values.map((item) => ({
      validTime: `${item.start}/PT${item.hours}H`,
      value: item.value,
    })),
  };
}

function sixHourIntervals(
  pop: Array<number | null>,
  qpf: Array<number | null>
): NormalizedNwsSixHourInterval[] {
  return qpf.map((qpfInches, index) => {
    const start = new Date(Date.UTC(2026, 2, 18, 12 + index * 6));
    return {
      id: `six-${index}`,
      sourceSnapshotId: 'snapshot-1',
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 6 * 60 * 60 * 1000).toISOString(),
      probabilityPercent: pop[index] ?? null,
      qpfInches,
      qualityStatus:
        pop[index] == null && qpfInches == null
          ? 'missing-both'
          : pop[index] == null
            ? 'missing-pop'
            : qpfInches == null
              ? 'missing-qpf'
              : 'complete',
    };
  });
}

describe('normalizeNwsGridForecast', () => {
  it('hashes equivalent JSON payloads identically regardless of object key order', () => {
    expect(hashForecastPayload({ b: 2, a: { y: 1, x: [3, 4] } })).toBe(
      hashForecastPayload({ a: { x: [3, 4], y: 1 }, b: 2 })
    );
  });

  it('converts six-hour NWS QPF millimeters to inches and expands 12-hour PoP', () => {
    const result = normalizeNwsGridForecast({
      snapshotId: 'snapshot-1',
      probabilityOfPrecipitation: gridSeries('wmoUnit:percent', [
        { start: '2026-03-18T12:00:00Z', hours: 12, value: 60 },
        { start: '2026-03-19T00:00:00Z', hours: 12, value: 40 },
      ]),
      quantitativePrecipitation: gridSeries('wmoUnit:mm', [
        { start: '2026-03-18T12:00:00Z', hours: 6, value: 12.7 },
        { start: '2026-03-18T18:00:00Z', hours: 6, value: 6.35 },
        { start: '2026-03-19T00:00:00Z', hours: 6, value: 0 },
        { start: '2026-03-19T06:00:00Z', hours: 6, value: 6.35 },
      ]),
    });

    expect(result.status).toBe('normalized');
    expect(result.intervals.map((item) => item.probabilityPercent)).toEqual([
      60, 60, 40, 40,
    ]);
    expect(result.intervals.map((item) => item.qpfInches)).toEqual([
      0.5, 0.25, 0, 0.25,
    ]);
    expect(result.intervals.every((item) => item.qualityStatus === 'complete')).toBe(true);
  });

  it('retains missing six-hour QPF as missing evidence instead of zero', () => {
    const result = normalizeNwsGridForecast({
      snapshotId: 'snapshot-1',
      probabilityOfPrecipitation: gridSeries('wmoUnit:percent', [
        { start: '2026-03-18T12:00:00Z', hours: 12, value: 70 },
      ]),
      quantitativePrecipitation: gridSeries('wmoUnit:mm', [
        { start: '2026-03-18T12:00:00Z', hours: 6, value: 1 },
        { start: '2026-03-19T00:00:00Z', hours: 6, value: 1 },
      ]),
    });
    expect(result.status).toBe('normalized');
    expect(result.intervals).toHaveLength(3);
    expect(result.intervals[1]).toMatchObject({
      qpfInches: null,
      qualityStatus: 'missing-qpf',
    });
  });

  it.each([
    { qpfUom: 'wmoUnit:in', popUom: 'wmoUnit:percent', reason: 'QPF_UNIT_UNSUPPORTED' },
    { qpfUom: 'wmoUnit:mm', popUom: 'fraction', reason: 'POP_UNIT_UNSUPPORTED' },
  ])('fails closed on unsupported units: %o', ({ qpfUom, popUom, reason }) => {
    const result = normalizeNwsGridForecast({
      snapshotId: 'snapshot-1',
      probabilityOfPrecipitation: gridSeries(popUom, []),
      quantitativePrecipitation: gridSeries(qpfUom, [
        { start: '2026-03-18T12:00:00Z', hours: 6, value: 1 },
      ]),
    });
    expect(result).toMatchObject({ status: 'unknown', reasonCodes: [reason] });
  });

  it('fails closed instead of redistributing a non-six-hour QPF value', () => {
    const result = normalizeNwsGridForecast({
      snapshotId: 'snapshot-1',
      probabilityOfPrecipitation: gridSeries('wmoUnit:percent', []),
      quantitativePrecipitation: gridSeries('wmoUnit:mm', [
        { start: '2026-03-18T12:00:00Z', hours: 12, value: 12.7 },
      ]),
    });
    expect(result).toMatchObject({
      status: 'unknown',
      reasonCodes: ['QPF_INTERVAL_NOT_SIX_HOURS'],
    });
  });

  it('discards an expired shortened boundary period before validating active QPF', () => {
    const result = normalizeNwsGridForecast({
      snapshotId: 'snapshot-1',
      notBefore: '2026-03-18T16:00:00Z',
      probabilityOfPrecipitation: gridSeries('wmoUnit:percent', [
        { start: '2026-03-18T09:00:00Z', hours: 21, value: 60 },
      ]),
      quantitativePrecipitation: gridSeries('wmoUnit:mm', [
        { start: '2026-03-18T09:00:00Z', hours: 3, value: 1 },
        { start: '2026-03-18T12:00:00Z', hours: 6, value: 12.7 },
        { start: '2026-03-18T18:00:00Z', hours: 6, value: 6.35 },
      ]),
    });

    expect(result.status).toBe('normalized');
    expect(result.intervals).toHaveLength(2);
    expect(result.intervals[0]).toMatchObject({
      startsAt: '2026-03-18T12:00:00.000Z',
      qpfInches: 0.5,
    });
  });

  it('still fails closed for a shortened QPF period that has not ended', () => {
    const result = normalizeNwsGridForecast({
      snapshotId: 'snapshot-1',
      notBefore: '2026-03-18T10:00:00Z',
      probabilityOfPrecipitation: gridSeries('wmoUnit:percent', []),
      quantitativePrecipitation: gridSeries('wmoUnit:mm', [
        { start: '2026-03-18T09:00:00Z', hours: 3, value: 1 },
        { start: '2026-03-18T12:00:00Z', hours: 6, value: 12.7 },
      ]),
    });

    expect(result).toMatchObject({
      status: 'unknown',
      reasonCodes: ['QPF_INTERVAL_NOT_SIX_HOURS'],
    });
  });
});

describe('buildQpeForecastSequences', () => {
  it('starts at the first six-hour interval with PoP >= 50 and sums four rows', () => {
    const intervals = sixHourIntervals(
      [20, 50, 60, 60, 30, 10],
      [0.01, 0.1, 0.15, 0.15, 0.1, 0.01]
    );
    const result = buildQpeForecastSequences(intervals);
    expect(result.status).toBe('partial');
    expect(result.reasonCodes).toContain('SIX_HOUR_FORECAST_HORIZON_INCOMPLETE');
    expect(result.sequences).toHaveLength(1);
    expect(result.sequences[0].initialSixHourIntervalId).toBe('six-1');
    expect(result.sequences[0].windows[0]).toMatchObject({
      startsAt: intervals[1].startsAt,
      endsAt: intervals[4].endsAt,
      probabilityPercent: 50,
      qpfInches: 0.5,
    });
  });

  it('does not qualify when QPF reaches 0.5 but no interval reaches 50% PoP', () => {
    const intervals = sixHourIntervals(
      [40, 40, 40, 40, 40],
      [0.2, 0.2, 0.2, 0.2, 0]
    );
    expect(buildQpeForecastSequences(intervals)).toMatchObject({
      status: 'complete',
      sequences: [],
    });
  });

  it('creates consecutive 24-hour extension and ending windows', () => {
    const intervals = sixHourIntervals(
      Array(12).fill(60),
      [
        0.2, 0.1, 0.1, 0.1,
        0.1, 0.05, 0.05, 0.05,
        0.05, 0.05, 0.05, 0.05,
      ]
    );
    const built = buildQpeForecastSequences(intervals);
    expect(built.sequences).toHaveLength(1);
    expect(built.sequences[0].windows.map((item) => item.qpfInches)).toEqual([
      0.5, 0.25, 0.2,
    ]);

    const decision = evaluateQpeForecast(built.sequences[0].windows);
    expect(decision).toMatchObject({
      status: 'qualifies',
      predictedEndsAt: built.sequences[0].windows[1].endsAt,
      eventWindowIds: [
        built.sequences[0].windows[0].id,
        built.sequences[0].windows[1].id,
      ],
    });
  });

  it('marks the build partial when a possible initial window has missing QPF', () => {
    const intervals = sixHourIntervals(
      [50, 60, 60, 60],
      [0.2, null, 0.2, 0.2]
    );
    const result = buildQpeForecastSequences(intervals);
    expect(result).toMatchObject({ status: 'partial', sequences: [] });
    expect(result.reasonCodes).toContain('SIX_HOUR_FORECAST_DATA_MISSING');
  });

  it('does not conclude no QPE when a qualifying PoP appears too near the forecast horizon', () => {
    const intervals = sixHourIntervals(
      [10, 10, 60],
      [0, 0, 0.2]
    );
    expect(buildQpeForecastSequences(intervals)).toMatchObject({
      status: 'partial',
      sequences: [],
      reasonCodes: ['SIX_HOUR_FORECAST_HORIZON_INCOMPLETE'],
    });
  });

  it('rejects gaps between normalized six-hour rows', () => {
    const intervals = sixHourIntervals(
      [50, 50, 50, 50],
      [0.2, 0.1, 0.1, 0.1]
    );
    intervals[2] = {
      ...intervals[2],
      startsAt: new Date(Date.parse(intervals[2].startsAt) + 60_000).toISOString(),
    };
    expect(buildQpeForecastSequences(intervals)).toMatchObject({
      status: 'unknown',
      reasonCodes: ['SIX_HOUR_INTERVALS_INVALID'],
    });
  });
});
