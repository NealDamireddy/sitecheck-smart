/**
 * GEO-01 — the wizard must never invent a site location.
 *
 * It used to fall back to { lat: 36.78, lng: -119.42 }, the bundled demo
 * project's centre in Fresno, whenever it had no coordinates. A Pleasanton
 * site created on 2026-08-08 was stored with Fresno's position, so NOAA was
 * asked about Fresno and the dashboard reported Fresno's weather as the
 * site's. Rain-event triggers key off this location, so it is a compliance
 * defect, not a display one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geocodeAddress, usableCoords } from '@/lib/geocode';

const FRESNO = { lat: 36.78, lng: -119.42 };

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function censusResponse(matches: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ result: { addressMatches: matches } }),
  } as unknown as Response;
}

describe('usableCoords', () => {
  it('accepts a real California coordinate', () => {
    expect(usableCoords(37.6624, -121.8747)).toEqual({
      lat: 37.6624,
      lng: -121.8747,
    });
  });

  it('rejects 0,0 — the classic silent default', () => {
    expect(usableCoords(0, 0)).toBeNull();
  });

  it('rejects out-of-range and non-finite values', () => {
    expect(usableCoords(91, 0)).toBeNull();
    expect(usableCoords(0, 181)).toBeNull();
    expect(usableCoords(Number.NaN, 10)).toBeNull();
    expect(usableCoords(undefined, undefined)).toBeNull();
    expect(usableCoords('37.6', '-121.8')).toBeNull();
  });
});

describe('geocodeAddress', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps Census x/y to lng/lat, not the other way round', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      censusResponse([
        {
          matchedAddress: '4002 EQUUS CT, PLEASANTON, CA, 94588',
          coordinates: { x: -121.8747, y: 37.6624 },
        },
      ])
    );

    const result = await geocodeAddress('4002 Equus Ct, Pleasanton, CA');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.lat).toBeCloseTo(37.6624, 4);
    expect(result.lng).toBeCloseTo(-121.8747, 4);
    expect(result.source).toBe('geocoded');
    expect(result.matchedAddress).toContain('PLEASANTON');

    // The whole point: a Pleasanton address must not land in Fresno.
    expect(result.lat).not.toBeCloseTo(FRESNO.lat, 2);
    expect(result.lng).not.toBeCloseTo(FRESNO.lng, 2);
  });

  it('reports no_match only after every provider has been asked', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(censusResponse([])) // census: nothing
      .mockResolvedValueOnce(jsonResponse([])); // osm: nothing
    const result = await geocodeAddress('not a real address at all');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no_match');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('falls back to OpenStreetMap when Census has no record of the street', async () => {
    // The real 2026-08-08 case: Census resolves Pleasanton but has no entry
    // for Equus Ct, while OSM does.
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(censusResponse([])).mockResolvedValueOnce(
      jsonResponse([
        {
          lat: '37.6676842',
          lon: '-121.9194980',
          display_name: 'Equus Court, Pleasanton, Alameda County, California, 94588',
          address: {},
        },
      ])
    );

    const result = await geocodeAddress('4002 Equus Ct, Pleasanton, CA 94588');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe('osm');
    // No house number in the OSM answer — report street precision honestly.
    expect(result.precision).toBe('street');
    expect(result.lat).toBeCloseTo(37.6677, 3);
    expect(result.lng).toBeCloseTo(-121.9195, 3);
    expect(result.lat).not.toBeCloseTo(FRESNO.lat, 2);
  });

  it('does not call the fallback when Census already answered', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(
      censusResponse([
        { matchedAddress: '4400 ROSEWOOD DR', coordinates: { x: -121.88, y: 37.7 } },
      ])
    );
    const result = await geocodeAddress('4400 Rosewood Dr, Pleasanton, CA');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe('census');
    expect(result.precision).toBe('address');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable only when every provider is down', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as unknown as Response);
    const result = await geocodeAddress('4002 Equus Ct');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unavailable');
  });

  it('never throws when the network fails', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('ECONNRESET')
    );
    const result = await geocodeAddress('4002 Equus Ct');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unavailable');
  });

  it('rejects an empty address without calling the network', async () => {
    const result = await geocodeAddress('   ');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('empty_input');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('treats a match with unusable coordinates as no match', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(
      censusResponse([{ matchedAddress: 'somewhere', coordinates: { x: 0, y: 0 } }])
    ).mockResolvedValueOnce(jsonResponse([]));
    const result = await geocodeAddress('4002 Equus Ct');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no_match');
  });
});

describe('GEO-01 regression — no Fresno fallback survives in the wizard', () => {
  it('the hardcoded demo coordinates are gone from the project wizard', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/app/projects/new/page.tsx', 'utf8');
    expect(src).not.toContain('36.78');
    expect(src).not.toContain('-119.42');
  });
});
