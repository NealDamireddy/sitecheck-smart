/**
 * Tomorrow.io current conditions — display only.
 *
 * The important assertions here are the negative ones: this source must stay
 * out of the QPE path, must degrade to null rather than throwing (so NOAA
 * remains the fallback), and must never be reachable without a key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchTomorrowCurrent,
  isTomorrowConfigured,
} from '@/lib/weather/tomorrow';

const COORDS = { lat: 37.6677, lng: -121.9195 };

function realtime(values: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { time: '2026-08-08T18:00:00Z', values } }),
  } as unknown as Response;
}

describe('fetchTomorrowCurrent', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.TOMORROW_API_KEY = 'test-key';
  });
  afterEach(() => {
    delete process.env.TOMORROW_API_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps a realtime payload onto the dashboard snapshot', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      realtime({ temperature: 72.4, windSpeed: 5.2, humidity: 29.6, weatherCode: 1000 })
    );

    const snap = await fetchTomorrowCurrent(COORDS);
    expect(snap).toEqual({
      temperature: 72,
      condition: 'clear',
      windSpeedMph: 5,
      humidity: 30,
    });
  });

  it('requests imperial units so wind is never double-converted', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(realtime({ temperature: 70, weatherCode: 1000 }));
    await fetchTomorrowCurrent(COORDS);

    const url = new URL(String(f.mock.calls[0][0]));
    expect(url.searchParams.get('units')).toBe('imperial');
    expect(url.searchParams.get('location')).toBe('37.6677,-121.9195');
  });

  it('distinguishes rain intensities that drive inspection behaviour', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    const cases: Array<[number, string]> = [
      [4200, 'light-rain'],
      [4001, 'rain'],
      [4201, 'heavy-rain'],
      [8000, 'thunderstorm'],
      [2000, 'fog'],
      [1101, 'partly-cloudy'],
    ];
    for (const [code, expected] of cases) {
      f.mockResolvedValueOnce(realtime({ temperature: 60, weatherCode: code }));
      const snap = await fetchTomorrowCurrent(COORDS);
      expect(snap?.condition, `code ${code}`).toBe(expected);
    }
  });

  it('returns null without a key, and never calls out', async () => {
    delete process.env.TOMORROW_API_KEY;
    expect(isTomorrowConfigured()).toBe(false);
    expect(await fetchTomorrowCurrent(COORDS)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null on a failed request rather than throwing', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as unknown as Response);
    expect(await fetchTomorrowCurrent(COORDS)).toBeNull();
  });

  it('returns null when the network throws', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('ETIMEDOUT')
    );
    expect(await fetchTomorrowCurrent(COORDS)).toBeNull();
  });

  it('returns null on a malformed payload instead of inventing a temperature', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      realtime({ humidity: 40 }) // no temperature
    );
    expect(await fetchTomorrowCurrent(COORDS)).toBeNull();
  });

  it('defers to NOAA when there are no coordinates', async () => {
    expect(await fetchTomorrowCurrent(undefined)).toBeNull();
    expect(await fetchTomorrowCurrent({ lat: Number.NaN, lng: 0 })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Tomorrow.io stays out of the regulatory path', () => {
  it('the QPE modules do not import it', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['src/lib/qpe/observed.ts', 'src/lib/qpe/detect.ts']) {
      expect(readFileSync(f, 'utf8')).not.toContain('tomorrow');
    }
  });

  it('the key is never exposed to the browser', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/weather/tomorrow.ts', 'utf8');
    expect(src).not.toContain('NEXT_PUBLIC_TOMORROW');
    expect(src).toContain('process.env.TOMORROW_API_KEY');
  });
});
