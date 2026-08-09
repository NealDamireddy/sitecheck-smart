/**
 * Observed hourly precipitation from Open-Meteo.
 *
 * This exists to cover NOAA's blind spot, not to replace it.
 *
 * `observed.ts` walks the three nearest NOAA stations and still frequently
 * lands on `quality: 'none'` — hourly precipitation is a known gap in the
 * station network. The consequence is the worst failure this product has: a
 * station with a dead gauge reports 0.00", which reads as "no qualifying
 * event", which means no post-storm inspection, which is a violation nobody
 * noticed incurring. Open-Meteo always answers, at the site's exact
 * coordinates, with hourly accumulation.
 *
 * What it is NOT: a measurement. Open-Meteo re-serves NOAA model output
 * (GFS/HRRR). A model estimate and a gauge reading are different kinds of
 * claim, and a QPE determination is legally consequential, so the ladder in
 * `ladder.ts` ranks this below both real gauges and every determination
 * records which tier answered.
 *
 * Emits the same `ObservedHour[]` shape as `observed.ts` so the existing
 * event-detection engine consumes it unchanged.
 *
 * Never throws — returns an error field so workflow surfaces keep rendering.
 */
import type { ObservedHour } from './detect';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 8000;
export const OPEN_METEO_PARSER_VERSION = 'open-meteo-hourly-precip-v1';

export interface OpenMeteoObservedResult {
  hours: ObservedHour[];
  /** Model Open-Meteo served, when it reports one. */
  model: string | null;
  lastChecked: string;
  /** The exact URL queried — stored as evidence provenance. */
  sourceUrl: string;
  /** Raw response, hashed and stored so a determination can be re-derived. */
  raw: unknown;
  error?: string;
}

function empty(sourceUrl: string, error: string): OpenMeteoObservedResult {
  return {
    hours: [],
    model: null,
    lastChecked: new Date().toISOString(),
    sourceUrl,
    raw: null,
    error,
  };
}

/**
 * Hourly precipitation for the trailing `lookbackDays`.
 *
 * `past_days` is what makes this usable for a determination at all — it
 * returns hours that have already happened, not just a forecast. Values come
 * back in inches so nothing needs converting; converting is how the previous
 * provider inflated every wind reading 2.2×.
 */
export async function fetchOpenMeteoObserved(
  lat: number,
  lng: number,
  lookbackDays: number,
  now: Date = new Date()
): Promise<OpenMeteoObservedResult> {
  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', lat.toFixed(4));
  url.searchParams.set('longitude', lng.toFixed(4));
  url.searchParams.set('hourly', 'precipitation');
  url.searchParams.set('precipitation_unit', 'inch');
  // UTC keeps this consistent with detect.ts, which works on UTC instants and
  // leaves calendar-day bucketing to callers that need it.
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('past_days', String(Math.min(Math.max(lookbackDays, 1), 92)));
  url.searchParams.set('forecast_days', '1');

  const sourceUrl = url.toString();

  let payload: unknown;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) return empty(sourceUrl, `Open-Meteo returned HTTP ${res.status}`);
    payload = await res.json();
  } catch {
    return empty(sourceUrl, 'Open-Meteo did not respond');
  }

  const body = payload as {
    hourly?: { time?: string[]; precipitation?: Array<number | null> };
    model?: string;
  } | null;

  const times = body?.hourly?.time;
  const values = body?.hourly?.precipitation;
  if (!Array.isArray(times) || !Array.isArray(values) || times.length === 0) {
    return empty(sourceUrl, 'Open-Meteo returned no hourly precipitation');
  }

  const cutoff = now.getTime();
  const hours: ObservedHour[] = [];

  for (let i = 0; i < times.length; i++) {
    const raw = values[i];
    // A null hour is a hole in the series, not zero rainfall. Dropping it
    // keeps a gap honest; coercing it to 0 would manufacture a dry hour.
    if (raw == null || !Number.isFinite(raw)) continue;

    // Open-Meteo returns naive timestamps in the requested timezone; we asked
    // for UTC, so mark them as such rather than letting the runtime apply the
    // server's local zone.
    const iso = times[i].endsWith('Z') ? times[i] : `${times[i]}:00Z`.replace('::', ':');
    const at = Date.parse(iso);
    if (Number.isNaN(at)) continue;

    // Forecast hours must never enter a determination about rain that fell.
    if (at > cutoff) continue;

    hours.push({ time: new Date(at).toISOString(), inches: Math.max(0, raw) });
  }

  if (hours.length === 0) {
    return empty(sourceUrl, 'Open-Meteo returned no usable past hours');
  }

  return {
    hours,
    model: typeof body?.model === 'string' ? body.model : null,
    lastChecked: new Date().toISOString(),
    sourceUrl,
    raw: payload,
  };
}
