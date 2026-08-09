/**
 * Phase 3 — consulting every source, and saying why a QSP is being asked.
 *
 * The messages are load-bearing. A QSP reading one has to decide whether to
 * walk a site, so a test that only checks `needsCorroboration === true` misses
 * the point: the reason has to carry the stake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchObservedPrecip = vi.fn();
const fetchOpenMeteoObserved = vi.fn();

vi.mock('@/lib/qpe/observed', () => ({
  fetchObservedPrecip: (...a: unknown[]) => fetchObservedPrecip(...a),
}));
vi.mock('@/lib/qpe/open-meteo-observed', () => ({
  OPEN_METEO_PARSER_VERSION: 'open-meteo-hourly-precip-v1',
  fetchOpenMeteoObserved: (...a: unknown[]) => fetchOpenMeteoObserved(...a),
}));

const { resolvePrecipitation, persistSnapshots } = await import('@/lib/qpe/determine');

/** Hours summing to `total`, spread one per hour. */
function hours(total: number, count = 4) {
  const each = total / count;
  return Array.from({ length: count }, (_, i) => ({
    time: new Date(Date.UTC(2026, 7, 1, i)).toISOString(),
    inches: each,
  }));
}

function noaa(total: number, quality: 'good' | 'sparse' | 'none', coverage = 0.95) {
  return {
    hours: hours(total),
    stationId: 'KLVK',
    stationName: 'Livermore',
    coverage,
    quality,
    lastChecked: new Date().toISOString(),
  };
}
function openMeteo(total: number) {
  return {
    hours: hours(total),
    model: 'gfs_seamless',
    lastChecked: new Date().toISOString(),
    sourceUrl: 'https://api.open-meteo.com/v1/forecast?x=1',
    raw: { hourly: {} },
  };
}

beforeEach(() => {
  fetchObservedPrecip.mockReset();
  fetchOpenMeteoObserved.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('resolvePrecipitation', () => {
  it('consults both sources and records what each said', async () => {
    fetchObservedPrecip.mockResolvedValue(noaa(0.62, 'good'));
    fetchOpenMeteoObserved.mockResolvedValue(openMeteo(0.66));

    const r = await resolvePrecipitation(37.66, -121.91);

    expect(r.snapshots.map((s) => s.provider).sort()).toEqual([
      'noaa_station',
      'open_meteo',
    ]);
    expect(r.determination?.decidedBy.provider).toBe('noaa_station');
    expect(r.determination?.qualifies).toBe(true);
    // A good gauge that nothing contradicts needs no confirming.
    expect(r.corroborationReason).toBeNull();
  });

  it('catches the event a dead gauge would have hidden', async () => {
    // The failure this whole phase exists for.
    fetchObservedPrecip.mockResolvedValue(noaa(0, 'none', 0));
    fetchOpenMeteoObserved.mockResolvedValue(openMeteo(0.81));

    const r = await resolvePrecipitation(37.66, -121.91);

    expect(r.determination?.qualifies).toBe(true);
    expect(r.determination?.decidedBy.provider).toBe('open_meteo');
    expect(r.corroborationReason).toContain('model estimate');
    expect(r.corroborationReason).toContain('no working rain gauge');
  });

  it('explains a disagreement in terms of the actual numbers', async () => {
    fetchObservedPrecip.mockResolvedValue(noaa(0.0, 'good'));
    fetchOpenMeteoObserved.mockResolvedValue(openMeteo(0.61));

    const r = await resolvePrecipitation(37.66, -121.91);

    expect(r.corroborationReason).toContain('0.61');
    expect(r.corroborationReason).toContain('disagree');
    expect(r.determination?.needsCorroboration).toBe(true);
  });

  it('says how little of the window a sparse gauge covered', async () => {
    fetchObservedPrecip.mockResolvedValue(noaa(0.2, 'sparse', 0.3));
    fetchOpenMeteoObserved.mockResolvedValue({
      ...openMeteo(0),
      error: 'Open-Meteo did not respond',
    });

    const r = await resolvePrecipitation(37.66, -121.91);

    expect(r.determination?.decidedBy.quality).toBe('sparse');
    expect(r.corroborationReason).toContain('30%');
    expect(r.corroborationReason).toContain('under-report');
  });

  it('never reports "no rain" when nothing could answer', async () => {
    fetchObservedPrecip.mockResolvedValue(noaa(0, 'none', 0));
    fetchOpenMeteoObserved.mockResolvedValue({
      ...openMeteo(0),
      error: 'Open-Meteo did not respond',
    });

    const r = await resolvePrecipitation(37.66, -121.91);

    expect(r.determination).toBeNull();
    expect(r.corroborationReason).toContain('unverified');
    // Crucially not 0.00 and not "no event".
    expect(r.corroborationReason).not.toContain('0.00');
  });

  it('survives one source throwing', async () => {
    fetchObservedPrecip.mockRejectedValue(new Error('NOAA down'));
    fetchOpenMeteoObserved.mockResolvedValue(openMeteo(0.7));

    const r = await resolvePrecipitation(37.66, -121.91);

    expect(r.determination?.decidedBy.provider).toBe('open_meteo');
    expect(r.snapshots).toHaveLength(1);
  });
});

describe('persistSnapshots', () => {
  it('derives ids from content so re-running does not duplicate evidence', async () => {
    fetchObservedPrecip.mockResolvedValue(noaa(0.62, 'good'));
    fetchOpenMeteoObserved.mockResolvedValue(openMeteo(0.66));
    const fixedNow = new Date('2026-08-08T18:00:00Z');

    const a = await resolvePrecipitation(37.66, -121.91, 3, fixedNow);
    const b = await resolvePrecipitation(37.66, -121.91, 3, fixedNow);

    const captured: Array<Array<Record<string, unknown>>> = [];
    const supabase = {
      from: () => ({
        upsert: (rows: Array<Record<string, unknown>>) => {
          captured.push(rows);
          return Promise.resolve({ error: null });
        },
      }),
    } as never;

    await persistSnapshots(supabase, 'proj-1', 37.66, -121.91, a);
    await persistSnapshots(supabase, 'proj-1', 37.66, -121.91, b);

    expect(captured[0].map((r) => r.id)).toEqual(captured[1].map((r) => r.id));
  });

  it('stores a payload hash alongside every reading', async () => {
    fetchObservedPrecip.mockResolvedValue(noaa(0.62, 'good'));
    fetchOpenMeteoObserved.mockResolvedValue(openMeteo(0.66));
    const resolved = await resolvePrecipitation(37.66, -121.91);

    let rows: Array<Record<string, unknown>> = [];
    const supabase = {
      from: () => ({
        upsert: (r: Array<Record<string, unknown>>) => {
          rows = r;
          return Promise.resolve({ error: null });
        },
      }),
    } as never;

    await persistSnapshots(supabase, 'proj-1', 37.66, -121.91, resolved);

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(String(row.payload_sha256)).toMatch(/^[0-9a-f]{64}$/);
      // Only a person's reading may claim attribution.
      expect(row.recorded_by).toBeNull();
    }
  });

  it('reports a write failure instead of throwing', async () => {
    fetchObservedPrecip.mockResolvedValue(noaa(0.62, 'good'));
    fetchOpenMeteoObserved.mockResolvedValue(openMeteo(0.66));
    const resolved = await resolvePrecipitation(37.66, -121.91);

    const supabase = {
      from: () => ({
        upsert: () => Promise.resolve({ error: { message: 'permission denied' } }),
      }),
    } as never;

    const result = await persistSnapshots(supabase, 'proj-1', 37.66, -121.91, resolved);
    expect(result.error).toBe('permission denied');
    expect(result.written).toBe(0);
  });
});
