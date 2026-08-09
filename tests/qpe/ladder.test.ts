/**
 * The precedence ladder — Phase 1 of the QPE provenance work.
 *
 * The determination decides whether a legally required inspection is
 * triggered, so these tests care less about arithmetic than about which
 * source is allowed to decide, and whether the losers are recorded.
 */
import { describe, expect, it } from 'vitest';
import {
  DISAGREEMENT_THRESHOLD_INCHES,
  determineQpe,
  type PrecipReading,
} from '@/lib/qpe/ladder';

const gauge = (inches: number, over: Partial<PrecipReading> = {}): PrecipReading => ({
  provider: 'site_gauge',
  totalInches: inches,
  quality: 'good',
  coverage: 1,
  ...over,
});
const station = (inches: number, quality: PrecipReading['quality'] = 'good'): PrecipReading => ({
  provider: 'noaa_station',
  totalInches: inches,
  quality,
  coverage: quality === 'good' ? 0.95 : 0.3,
  detail: 'KLVK',
});
const model = (inches: number): PrecipReading => ({
  provider: 'open_meteo',
  totalInches: inches,
  quality: 'good',
  coverage: 1,
  detail: 'gfs_seamless',
});

describe('precedence', () => {
  it("prefers the QSP's on-site gauge over everything", () => {
    const d = determineQpe([model(0.9), station(0.8), gauge(0.61)]);
    expect(d?.decidedBy.provider).toBe('site_gauge');
    expect(d?.totalInches).toBe(0.61);
  });

  it('prefers a good NOAA gauge over a model estimate', () => {
    const d = determineQpe([model(0.7), station(0.62)]);
    expect(d?.decidedBy.provider).toBe('noaa_station');
  });

  it('prefers a model estimate over a sparse gauge', () => {
    // A gauge that reported for 30% of a storm reports ~30% of the rain and
    // looks like a confident small number. Under-reporting is the direction
    // that turns a qualifying event into a missed inspection.
    const d = determineQpe([station(0.18, 'sparse'), model(0.71)]);
    expect(d?.decidedBy.provider).toBe('open_meteo');
    expect(d?.qualifies).toBe(true);
  });

  it('never lets a source that knows it has nothing decide', () => {
    // The confident zero: a dead gauge reporting 0.00 must not cancel an
    // inspection just by being the nearest source.
    const d = determineQpe([station(0, 'none'), model(0.8)]);
    expect(d?.decidedBy.provider).toBe('open_meteo');
    expect(d?.qualifies).toBe(true);
  });

  it('returns null when nothing usable is available', () => {
    // "No answer" is not "no rain". Callers must be forced to handle it.
    expect(determineQpe([])).toBeNull();
    expect(determineQpe([station(0, 'none')])).toBeNull();
  });

  it('ignores malformed readings rather than trusting them', () => {
    const d = determineQpe([
      { ...model(Number.NaN) },
      { ...station(-3) },
      gauge(0.55),
    ]);
    expect(d?.decidedBy.provider).toBe('site_gauge');
  });
});

describe('the CGP threshold', () => {
  it('qualifies at exactly 0.5 inches', () => {
    expect(determineQpe([gauge(0.5)])?.qualifies).toBe(true);
  });
  it('does not qualify just below', () => {
    expect(determineQpe([gauge(0.49)])?.qualifies).toBe(false);
  });
});

describe('disagreement', () => {
  it('flags a gauge reading zero while the model reads a real storm', () => {
    // The single most valuable signal in the system: either the gauge is
    // broken or the event was missed, and both need a human.
    const d = determineQpe([station(0.0), model(0.61)]);
    expect(d?.disagreement).toHaveLength(1);
    expect(d?.disagreement[0]).toMatchObject({
      provider: 'open_meteo',
      deltaInches: 0.61,
    });
    expect(d?.needsCorroboration).toBe(true);
  });

  it('stays quiet when sources broadly agree', () => {
    const d = determineQpe([station(0.62), model(0.66)]);
    expect(d?.disagreement).toEqual([]);
  });

  it('uses the documented threshold', () => {
    const under = determineQpe([station(0.5), model(0.5 + DISAGREEMENT_THRESHOLD_INCHES - 0.01)]);
    const over = determineQpe([station(0.5), model(0.5 + DISAGREEMENT_THRESHOLD_INCHES + 0.01)]);
    expect(under?.disagreement).toHaveLength(0);
    expect(over?.disagreement).toHaveLength(1);
  });

  it('records every losing reading, agreeing or not', () => {
    const d = determineQpe([gauge(0.6), station(0.58), model(0.9)]);
    expect(d?.otherReadings.map((r) => r.provider)).toEqual([
      'noaa_station',
      'open_meteo',
    ]);
  });
});

describe('needsCorroboration — the Phase 3 signal', () => {
  it('is false for a clean measurement that nothing contradicts', () => {
    expect(determineQpe([gauge(0.6), station(0.58)])?.needsCorroboration).toBe(false);
    expect(determineQpe([station(0.6)])?.needsCorroboration).toBe(false);
  });

  it('is true when only a model answered', () => {
    expect(determineQpe([model(0.6)])?.needsCorroboration).toBe(true);
  });

  it('is true when only a sparse gauge answered', () => {
    expect(determineQpe([station(0.6, 'sparse')])?.needsCorroboration).toBe(true);
  });
});
