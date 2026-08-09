/**
 * Open-Meteo current conditions — the default display source.
 *
 * As with Tomorrow.io, the load-bearing assertions are the negative ones: it
 * must stay out of the QPE determination, degrade to null rather than throw,
 * and never ask for units it would then have to convert.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchOpenMeteoCurrent } from '@/lib/weather/open-meteo';

const COORDS = { lat: 37.6677, lng: -121.9195 };

function omResponse(current: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ current: { time: '2026-08-08T18:00', ...current } }),
  } as unknown as Response;
}

describe('fetchOpenMeteoCurrent', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps a payload onto the dashboard snapshot', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      omResponse({
        temperature_2m: 77.7,
        relative_humidity_2m: 40,
        wind_speed_10m: 12.1,
        weather_code: 0,
      })
    );

    expect(await fetchOpenMeteoCurrent(COORDS)).toEqual({
      temperature: 78,
      condition: 'clear',
      windSpeedMph: 12,
      humidity: 40,
    });
  });

  it('asks for imperial units so nothing needs converting', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(omResponse({ temperature_2m: 70, weather_code: 0 }));
    await fetchOpenMeteoCurrent(COORDS);

    const url = new URL(String(f.mock.calls[0][0]));
    expect(url.searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(url.searchParams.get('wind_speed_unit')).toBe('mph');
    expect(url.searchParams.get('precipitation_unit')).toBe('inch');
    expect(url.searchParams.get('timezone')).toBe('America/Los_Angeles');
    // No key is sent because none exists — the reason this is the default.
    expect(url.searchParams.has('apikey')).toBe(false);
  });

  it('distinguishes the rain intensities that drive inspections', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    const cases: Array<[number, string]> = [
      [0, 'clear'],
      [2, 'partly-cloudy'],
      [3, 'cloudy'],
      [45, 'fog'],
      [53, 'light-rain'],
      [63, 'rain'],
      [65, 'heavy-rain'],
      [82, 'heavy-rain'],
      [95, 'thunderstorm'],
    ];
    for (const [code, expected] of cases) {
      f.mockResolvedValueOnce(omResponse({ temperature_2m: 60, weather_code: code }));
      const snap = await fetchOpenMeteoCurrent(COORDS);
      expect(snap?.condition, `WMO code ${code}`).toBe(expected);
    }
  });

  it('returns null on failure rather than throwing', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as unknown as Response);
    expect(await fetchOpenMeteoCurrent(COORDS)).toBeNull();

    f.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    expect(await fetchOpenMeteoCurrent(COORDS)).toBeNull();
  });

  it('returns null on a malformed payload instead of inventing a temperature', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      omResponse({ relative_humidity_2m: 40 })
    );
    expect(await fetchOpenMeteoCurrent(COORDS)).toBeNull();
  });

  it('defers to NOAA when there are no coordinates', async () => {
    expect(await fetchOpenMeteoCurrent(undefined)).toBeNull();
    expect(await fetchOpenMeteoCurrent({ lat: Number.NaN, lng: 0 })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('display sources stay out of the regulatory path', () => {
  it('the QPE modules import neither Open-Meteo nor Tomorrow.io', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['src/lib/qpe/observed.ts', 'src/lib/qpe/detect.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toContain('open-meteo');
      expect(src).not.toContain('tomorrow');
    }
  });
});
