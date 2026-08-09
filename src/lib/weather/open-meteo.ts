/**
 * Current conditions from Open-Meteo.
 *
 * Preferred over both alternatives for the dashboard:
 *
 *   * no API key — nothing to provision, rotate, or leak. Tomorrow.io passes
 *     its key as a query parameter, which is a standing exposure risk;
 *   * native imperial units (°F, mph, inch), so there is no conversion step.
 *     The provider this app replaced was queried in imperial and then
 *     multiplied by the m/s→mph factor anyway, inflating every wind reading
 *     ~2.2×. Not converting is the most reliable way not to convert twice;
 *   * answers at the exact coordinates rather than the nearest NOAA gridpoint;
 *   * can be pinned to NOAA models (`gfs_seamless`, `ncep_hrrr_conus`) rather
 *     than an opaque vendor blend.
 *
 * Scope is **display only**, same as every non-NOAA source here.
 *
 * Open-Meteo re-serves NOAA *model* output. That is not the same thing as a
 * NOAA *gauge observation*, and the QPE determination is a statement about
 * rain that fell. `src/lib/qpe/observed.ts` sources it from station
 * observations because those are the official public record if a regulator
 * challenges a "no qualifying event" call. Routing that through a third party
 * would add a hop between the determination and the record without improving
 * it.
 *
 * Where this module will earn a bigger role is Phase 1/3: its hourly
 * precipitation series (with `past_days`) is the right shape to corroborate
 * NOAA when station gauge coverage is sparse — as a recorded tier, not a
 * replacement.
 *
 * Licensing note: free for non-commercial use; commercial use requires a paid
 * plan. Confirm before this ships to paying customers.
 *
 * Never throws — returns null so the caller falls back to NOAA.
 */
import type { WeatherCondition, WeatherSnapshot } from '@/types/weather';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 6000;

/**
 * WMO weather codes → the app's condition union.
 *
 * Rain intensity is kept distinct because it drives inspection behaviour;
 * everything with no bucket here collapses to the nearest sensible value.
 */
function toCondition(code: number): WeatherCondition {
  if (code === 0) return 'clear';
  if (code === 1) return 'clear';
  if (code === 2) return 'partly-cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 55) return 'light-rain'; // drizzle
  if (code === 56 || code === 57) return 'light-rain'; // freezing drizzle
  if (code === 61 || code === 80) return 'light-rain';
  if (code === 63 || code === 81) return 'rain';
  if (code === 65 || code === 82) return 'heavy-rain';
  if (code === 66 || code === 67) return 'rain'; // freezing rain
  if (code >= 95) return 'thunderstorm';
  // Snow (71–77, 85–86) has no bucket. It is vanishingly rare on California
  // CGP sites and calling it rain would be wrong, so it reads as cloudy.
  return 'cloudy';
}

interface OpenMeteoCurrent {
  temperature_2m?: number;
  relative_humidity_2m?: number;
  wind_speed_10m?: number;
  weather_code?: number;
}

export async function fetchOpenMeteoCurrent(
  coords?: { lat: number; lng: number }
): Promise<WeatherSnapshot | null> {
  // No coordinates is not this module's error to report. Returning null hands
  // the call to weather-api.ts, which refuses explicitly and says why.
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
    return null;
  }

  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', String(coords.lat));
  url.searchParams.set('longitude', String(coords.lng));
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code'
  );
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('wind_speed_unit', 'mph');
  url.searchParams.set('precipitation_unit', 'inch');
  url.searchParams.set('timezone', 'America/Los_Angeles');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const payload = (await res.json()) as { current?: OpenMeteoCurrent } | null;
    const current = payload?.current;
    if (!current || typeof current.temperature_2m !== 'number') return null;

    return {
      temperature: Math.round(current.temperature_2m),
      condition: toCondition(current.weather_code ?? 3),
      windSpeedMph: Math.round(current.wind_speed_10m ?? 0),
      humidity: Math.round(current.relative_humidity_2m ?? 0),
    };
  } catch {
    return null;
  }
}
