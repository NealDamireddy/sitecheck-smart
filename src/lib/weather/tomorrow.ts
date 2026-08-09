/**
 * Current conditions from Tomorrow.io.
 *
 * Why a second weather source: NOAA gives the nearest gridpoint / station
 * observation, which is the right basis for a regulatory determination but is
 * coarse for "what is it doing at this site right now". Tomorrow.io answers at
 * the exact coordinates, minute-resolution, and returns every field the
 * dashboard renders.
 *
 * Scope is deliberately narrow — **display only**.
 *
 * This module must never become the source of a QPE determination. That
 * determination is a statement about rain that FELL, and `src/lib/qpe/
 * observed.ts` sources it from NOAA station observations precisely because
 * they are the official public record and defensible if a regulator challenges
 * a "no qualifying event" call. Tomorrow.io's realtime endpoint also reports
 * `rainIntensity` — an instantaneous rate, not an accumulation — so it is the
 * wrong shape for the 0.5-inch threshold even setting the provenance argument
 * aside.
 *
 * Server-only. The API key travels as a query parameter, so any browser-side
 * call would leak it in the URL, in referrers and in logs. Read it from
 * TOMORROW_API_KEY and never expose it as NEXT_PUBLIC_*.
 *
 * Never throws: returns null when unconfigured or unavailable so the caller
 * falls back to NOAA rather than showing an error where a temperature belongs.
 */
import type { WeatherCondition, WeatherSnapshot } from '@/types/weather';

const REALTIME_URL = 'https://api.tomorrow.io/v4/weather/realtime';
const TIMEOUT_MS = 6000;

/** Is a Tomorrow.io key configured? Callers use this to pick a source. */
export function isTomorrowConfigured(): boolean {
  return Boolean(process.env.TOMORROW_API_KEY?.trim());
}

/**
 * Map Tomorrow.io weather codes onto the app's condition union.
 *
 * Only the codes that matter to a stormwater product are distinguished; the
 * rest collapse to the nearest sensible bucket. Rain intensity is separated
 * because heavy rain drives inspection behaviour.
 * Reference: Tomorrow.io weather data layers, `weatherCode`.
 */
function toCondition(code: number): WeatherCondition {
  switch (code) {
    case 1000: // Clear
    case 1100: // Mostly Clear
      return 'clear';
    case 1101: // Partly Cloudy
      return 'partly-cloudy';
    case 1102: // Mostly Cloudy
    case 1001: // Cloudy
      return 'cloudy';
    case 2000: // Fog
    case 2100: // Light Fog
      return 'fog';
    case 4000: // Drizzle
    case 4200: // Light Rain
      return 'light-rain';
    case 4001: // Rain
      return 'rain';
    case 4201: // Heavy Rain
      return 'heavy-rain';
    case 8000: // Thunderstorm
      return 'thunderstorm';
    // Snow, sleet and freezing rain have no bucket in this union. They are
    // vanishingly rare on California CGP sites and reporting them as 'rain'
    // would be wrong, so they fall through to cloudy.
    default:
      return 'cloudy';
  }
}

interface RealtimeValues {
  temperature?: number;
  windSpeed?: number;
  humidity?: number;
  weatherCode?: number;
}

/**
 * Fetch current conditions for a coordinate.
 *
 * Returns null — never throws, never guesses — when the key is missing, the
 * call fails, or the payload is not shaped as expected.
 */
export async function fetchTomorrowCurrent(
  coords?: { lat: number; lng: number }
): Promise<WeatherSnapshot | null> {
  const apiKey = process.env.TOMORROW_API_KEY?.trim();
  if (!apiKey) return null;

  // No coordinates is not this module's error to report. Returning null hands
  // the call to weather-api.ts, which refuses explicitly and says why — the
  // single place that decision belongs.
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
    return null;
  }

  const url = new URL(REALTIME_URL);
  url.searchParams.set('location', `${coords.lat},${coords.lng}`);
  // imperial → temperature in °F and wind in mph, matching what the dashboard
  // renders. Asking for metric here and converting later is how the previous
  // provider ended up multiplying wind speed by 2.237 twice.
  url.searchParams.set('units', 'imperial');
  url.searchParams.set('apikey', apiKey);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const payload = (await res.json()) as {
      data?: { values?: RealtimeValues };
    } | null;
    const values = payload?.data?.values;
    if (!values || typeof values.temperature !== 'number') return null;

    return {
      temperature: Math.round(values.temperature),
      condition: toCondition(values.weatherCode ?? 1001),
      windSpeedMph: Math.round(values.windSpeed ?? 0),
      humidity: Math.round(values.humidity ?? 0),
    };
  } catch {
    return null;
  }
}
