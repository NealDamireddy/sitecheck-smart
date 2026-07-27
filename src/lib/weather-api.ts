/**
 * Site weather — NOAA api.weather.gov implementation (CMP-01/CMP-02).
 *
 * Rewritten in the Stage 3 hardening pass. The previous implementation
 * used OpenWeatherMap and had three defects:
 *   * wind double-conversion — OWM was queried with units=imperial (mph)
 *     and the value was then multiplied by 2.237 (the m/s→mph factor),
 *     inflating every wind reading ~2.2×;
 *   * UTC day bucketing — daily totals were grouped on UTC dates, so a
 *     California evening storm split across two "days" and could dodge
 *     the 0.5″ QPE flag;
 *   * silent Fresno fallback — with no coordinates it served Fresno's
 *     weather as if it were the site's.
 *
 * This implementation keeps the same exported names and result shapes
 * (`fetchCurrentWeather`, `fetchForecast` → WeatherSnapshot/WeatherDay)
 * so the routes and the pre-storm detector work unchanged, but:
 *   * one weather source for the whole app: NOAA, the official US
 *     forecast service (User-Agent from NOAA_USER_AGENT, as in
 *     src/lib/smarts/noaa.ts);
 *   * daily aggregation on America/Los_Angeles calendar days — every
 *     CGP site this product serves is in California;
 *   * precipitation from NOAA's quantitative precipitation forecast
 *     (QPF, millimeters), apportioned hour-by-hour into local days;
 *   * missing coordinates are an explicit error, never another site's
 *     weather.
 *
 * Forecast `isQPE` is anticipation only — the compliance QPE
 * determination is made from OBSERVED gauge data in src/lib/qpe/.
 */

import { WeatherSnapshot, WeatherDay, WeatherCondition } from '@/types/weather';
import { QPE_THRESHOLD_INCHES } from '@/lib/cgp/constants';

const BASE_URL = 'https://api.weather.gov';
const DEFAULT_USER_AGENT = 'SiteCheck Dev (dev@example.com)';
const CACHE_TTL_MS = 10 * 60 * 1000;
/** All CGP 2022 sites are California construction sites. */
const SITE_TZ = 'America/Los_Angeles';

// ──────────────────────────────────────────────────────────────────────
// NOAA HTTP + cache
// ──────────────────────────────────────────────────────────────────────

function userAgent(): string {
  return process.env.NOAA_USER_AGENT || DEFAULT_USER_AGENT;
}

async function noaaFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent(), Accept: 'application/geo+json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`NOAA ${url} → ${res.status}: ${body.slice(0, 160)}`);
  }
  return res.json();
}

interface PointsResponse {
  properties: { forecastHourly: string; forecastGridData: string };
}

interface HourlyPeriod {
  startTime: string;
  temperature: number;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  probabilityOfPrecipitation?: { value: number | null };
  relativeHumidity?: { value: number | null };
}

interface HourlyResponse {
  properties: { periods: HourlyPeriod[] };
}

interface GridDataResponse {
  properties: {
    quantitativePrecipitation?: {
      uom: string;
      values: Array<{ validTime: string; value: number | null }>;
    };
  };
}

interface SiteForecastBundle {
  hourly: HourlyPeriod[];
  qpf: Array<{ validTime: string; value: number | null }>;
}

const bundleCache = new Map<string, { data: SiteForecastBundle; at: number }>();

async function fetchBundle(lat: number, lng: number): Promise<SiteForecastBundle> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = bundleCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const points = (await noaaFetch(
    `${BASE_URL}/points/${lat.toFixed(4)},${lng.toFixed(4)}`
  )) as PointsResponse;

  const [hourlyRes, gridRes] = await Promise.all([
    noaaFetch(points.properties.forecastHourly) as Promise<HourlyResponse>,
    (noaaFetch(points.properties.forecastGridData) as Promise<GridDataResponse>).catch(
      (err): GridDataResponse | null => {
        console.warn('NOAA gridData fetch failed (forecast continues without QPF):', err);
        return null;
      }
    ),
  ]);

  const data: SiteForecastBundle = {
    hourly: hourlyRes.properties.periods,
    qpf: gridRes?.properties?.quantitativePrecipitation?.values ?? [],
  };
  bundleCache.set(key, { data, at: Date.now() });
  return data;
}

// ──────────────────────────────────────────────────────────────────────
// Pure mapping helpers
// ──────────────────────────────────────────────────────────────────────

function mmToInches(mm: number): number {
  return mm / 25.4;
}

/** NOAA windSpeed strings: "10 mph" or "10 to 20 mph" — take the max. */
export function parseWindMph(windSpeed: string): number {
  const numbers = windSpeed.match(/\d+/g);
  if (!numbers || numbers.length === 0) return 0;
  return Math.max(...numbers.map(Number));
}

/** Map a NOAA shortForecast phrase onto the app's condition enum. */
export function mapNoaaCondition(shortForecast: string): WeatherCondition {
  const s = shortForecast.toLowerCase();
  if (/thunder/.test(s)) return 'thunderstorm';
  if (/heavy rain|downpour/.test(s)) return 'heavy-rain';
  if (/light rain|drizzle|sprinkle/.test(s)) return 'light-rain';
  if (/rain|shower/.test(s)) return 'rain';
  if (/fog|mist|haze|smoke/.test(s)) return 'fog';
  if (/mostly cloudy|overcast|cloudy/.test(s) && !/partly/.test(s)) return 'cloudy';
  if (/partly|mostly sunny|mostly clear/.test(s)) return 'partly-cloudy';
  if (/sunny|clear/.test(s)) return 'clear';
  if (/snow|sleet|ice/.test(s)) return 'cloudy';
  return 'partly-cloudy';
}

const CONDITION_SEVERITY: WeatherCondition[] = [
  'clear',
  'partly-cloudy',
  'cloudy',
  'fog',
  'light-rain',
  'rain',
  'heavy-rain',
  'thunderstorm',
];

function worstCondition(conditions: WeatherCondition[]): WeatherCondition {
  let worst: WeatherCondition = 'clear';
  for (const c of conditions) {
    if (CONDITION_SEVERITY.indexOf(c) > CONDITION_SEVERITY.indexOf(worst)) {
      worst = c;
    }
  }
  return worst;
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SITE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD in the site's timezone for an instant. */
export function localDayKey(isoInstant: string | Date): string {
  return dayFormatter.format(
    typeof isoInstant === 'string' ? new Date(isoInstant) : isoInstant
  );
}

/**
 * Apportion NOAA QPF interval values ("<startISO>/PT6H", mm) into
 * per-local-day inch totals, splitting intervals hour by hour so a
 * period spanning midnight lands in the right days.
 */
export function qpfInchesByLocalDay(
  values: Array<{ validTime: string; value: number | null }>
): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const { validTime, value } of values) {
    if (value == null || value <= 0) continue;
    const [startStr, durStr] = validTime.split('/');
    const start = new Date(startStr);
    if (Number.isNaN(start.getTime())) continue;
    const match = /PT(\d+)H/.exec(durStr ?? '');
    const durationHours = Math.max(1, match ? parseInt(match[1], 10) : 1);
    const inchesPerHour = mmToInches(value) / durationHours;
    for (let h = 0; h < durationHours; h++) {
      const hourStart = new Date(start.getTime() + h * 3_600_000);
      const key = localDayKey(hourStart);
      byDay.set(key, (byDay.get(key) ?? 0) + inchesPerHour);
    }
  }
  return byDay;
}

// ──────────────────────────────────────────────────────────────────────
// Public API — same names and shapes the OWM version exported
// ──────────────────────────────────────────────────────────────────────

function requireCoords(coords?: { lat: number; lng: number }): {
  lat: number;
  lng: number;
} {
  if (
    !coords ||
    !Number.isFinite(coords.lat) ||
    !Number.isFinite(coords.lng)
  ) {
    throw new Error(
      'Site coordinates are required for weather — refusing to fall back to a default location.'
    );
  }
  return coords;
}

/** Current conditions at the site (first hourly forecast period). */
export async function fetchCurrentWeather(
  coords?: { lat: number; lng: number }
): Promise<WeatherSnapshot> {
  const { lat, lng } = requireCoords(coords);
  const bundle = await fetchBundle(lat, lng);
  const current = bundle.hourly[0];
  if (!current) throw new Error('NOAA returned an empty hourly forecast');

  return {
    temperature: Math.round(current.temperature),
    condition: mapNoaaCondition(current.shortForecast),
    windSpeedMph: parseWindMph(current.windSpeed),
    humidity: Math.round(current.relativeHumidity?.value ?? 50),
  };
}

/** 7-day daily forecast, aggregated on the site's local calendar days. */
export async function fetchForecast(
  coords?: { lat: number; lng: number }
): Promise<WeatherDay[]> {
  const { lat, lng } = requireCoords(coords);
  const bundle = await fetchBundle(lat, lng);
  const precipByDay = qpfInchesByLocalDay(bundle.qpf);

  interface DayAccumulator {
    high: number;
    low: number;
    maxPop: number;
    maxWindMph: number;
    windDirection: string;
    humiditySum: number;
    humidityCount: number;
    conditions: WeatherCondition[];
  }

  const days = new Map<string, DayAccumulator>();
  for (const period of bundle.hourly) {
    const key = localDayKey(period.startTime);
    let acc = days.get(key);
    if (!acc) {
      acc = {
        high: -Infinity,
        low: Infinity,
        maxPop: 0,
        maxWindMph: 0,
        windDirection: period.windDirection || 'N',
        humiditySum: 0,
        humidityCount: 0,
        conditions: [],
      };
      days.set(key, acc);
    }
    acc.high = Math.max(acc.high, period.temperature);
    acc.low = Math.min(acc.low, period.temperature);
    acc.maxPop = Math.max(
      acc.maxPop,
      period.probabilityOfPrecipitation?.value ?? 0
    );
    const wind = parseWindMph(period.windSpeed);
    if (wind >= acc.maxWindMph) {
      acc.maxWindMph = wind;
      acc.windDirection = period.windDirection || acc.windDirection;
    }
    if (period.relativeHumidity?.value != null) {
      acc.humiditySum += period.relativeHumidity.value;
      acc.humidityCount += 1;
    }
    acc.conditions.push(mapNoaaCondition(period.shortForecast));
  }

  const result: WeatherDay[] = [];
  for (const [date, acc] of [...days.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    if (result.length >= 7) break;
    const precip = Math.round((precipByDay.get(date) ?? 0) * 100) / 100;
    result.push({
      date,
      high: Math.round(acc.high),
      low: Math.round(acc.low),
      precipitationInches: precip,
      precipitationChance: Math.round(acc.maxPop),
      windSpeedMph: acc.maxWindMph,
      windDirection: acc.windDirection,
      condition: worstCondition(acc.conditions),
      humidity:
        acc.humidityCount > 0
          ? Math.round(acc.humiditySum / acc.humidityCount)
          : 50,
      // Anticipation flag only — the compliance QPE determination comes
      // from observed gauge data (src/lib/qpe/), never from forecast.
      isQPE: precip >= QPE_THRESHOLD_INCHES,
    });
  }
  return result;
}

/** Fetch both current weather and forecast for a site. */
export async function fetchWeatherData(coords?: {
  lat: number;
  lng: number;
}): Promise<{ current: WeatherSnapshot; forecast: WeatherDay[] }> {
  const [current, forecast] = await Promise.all([
    fetchCurrentWeather(coords),
    fetchForecast(coords),
  ]);
  return { current, forecast };
}
