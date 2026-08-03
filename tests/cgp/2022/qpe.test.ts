import { describe, expect, it } from 'vitest';
import {
  CGP_2022_DRAFT_RULE_VERSION,
  evaluateQpeForecast,
  type ForecastWindow24h,
} from '@/lib/cgp/2022';

function window(
  id: string,
  day: number,
  probabilityPercent: number | null,
  qpfInches: number | null
): ForecastWindow24h {
  const startsAt = new Date(Date.UTC(2026, 0, day, 16));
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
  return {
    id,
    sourceSnapshotId: 'forecast-snapshot-1',
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    probabilityPercent,
    qpfInches,
  };
}

describe('evaluateQpeForecast', () => {
  it('returns unknown when no forecast periods are available', () => {
    expect(evaluateQpeForecast([])).toMatchObject({
      status: 'unknown',
      ruleVersion: CGP_2022_DRAFT_RULE_VERSION,
      reasonCodes: ['FORECAST_WINDOWS_EMPTY'],
    });
  });

  it('qualifies at the exact initial PoP and QPF thresholds', () => {
    const decision = evaluateQpeForecast([window('initial', 1, 50, 0.5)]);
    expect(decision).toMatchObject({
      status: 'qualifies',
      initialWindowId: 'initial',
      reasonCodes: [
        'INITIAL_THRESHOLD_MET',
        'EXTENSION_FORECAST_HORIZON_EXHAUSTED',
      ],
    });
  });

  it.each([
    { pop: 49, qpf: 0.5 },
    { pop: 50, qpf: 0.49 },
  ])('does not qualify below either initial threshold: %o', ({ pop, qpf }) => {
    expect(evaluateQpeForecast([window('initial', 1, pop, qpf)])).toMatchObject({
      status: 'does-not-qualify',
      reasonCodes: ['INITIAL_THRESHOLDS_NOT_MET'],
    });
  });

  it('returns unknown when a required initial input is missing', () => {
    expect(evaluateQpeForecast([window('initial', 1, 70, null)])).toMatchObject({
      status: 'unknown',
      reasonCodes: ['FORECAST_DATA_MISSING'],
    });
  });

  it('lets a known qualifying period win when a different period is incomplete', () => {
    const decision = evaluateQpeForecast([
      window('incomplete', 1, 70, null),
      window('initial', 2, 60, 0.6),
    ]);
    expect(decision.status).toBe('qualifies');
    expect(decision.initialWindowId).toBe('initial');
  });

  it('extends at exactly 0.25 inches without using extension PoP', () => {
    const decision = evaluateQpeForecast([
      window('initial', 1, 50, 0.5),
      window('extension', 2, 0, 0.25),
      window('end', 3, 100, 0.24),
    ]);

    expect(decision.status).toBe('qualifies');
    expect(decision.predictedEndsAt).toBe(window('extension', 2, 0, 0.25).endsAt);
    expect(decision.eventWindowIds).toEqual(['initial', 'extension']);
    expect(decision.evidenceWindowIds).toEqual(['initial', 'extension', 'end']);
    expect(decision.reasonCodes).toEqual([
      'INITIAL_THRESHOLD_MET',
      'EVENT_EXTENDED_QPF_THRESHOLD_MET',
      'EVENT_END_QPF_BELOW_THRESHOLD',
    ]);
  });

  it('keeps the event qualified but its end unknown when extension QPF is missing', () => {
    const decision = evaluateQpeForecast([
      window('initial', 1, 70, 0.8),
      window('unknown-extension', 2, 80, null),
    ]);
    expect(decision).toMatchObject({
      status: 'qualifies',
      predictedEndsAt: null,
    });
    expect(decision.reasonCodes).toContain('EXTENSION_QPF_MISSING');
  });

  it('does not infer an end across a gap in the forecast sequence', () => {
    const decision = evaluateQpeForecast([
      window('initial', 1, 70, 0.8),
      window('after-gap', 3, 80, 0.1),
    ]);
    expect(decision).toMatchObject({
      status: 'qualifies',
      predictedEndsAt: null,
    });
    expect(decision.reasonCodes).toContain('EXTENSION_SEQUENCE_INCOMPLETE');
  });

  it('rejects overlapping or malformed forecast periods', () => {
    const first = window('first', 1, 50, 0.5);
    const overlapping = {
      ...window('overlapping', 2, 40, 0.1),
      startsAt: new Date(Date.parse(first.endsAt) - 60_000).toISOString(),
    };
    expect(evaluateQpeForecast([first, overlapping])).toMatchObject({
      status: 'unknown',
      reasonCodes: ['FORECAST_WINDOW_INVALID'],
    });
  });

  it('does not mutate caller-owned forecast arrays', () => {
    const later = window('later', 2, 20, 0.1);
    const earlier = window('earlier', 1, 50, 0.5);
    const input = [later, earlier];
    evaluateQpeForecast(input);
    expect(input).toEqual([later, earlier]);
  });
});
