/**
 * NOAA weather forecast — SMARTS compliance-grade data source.
 *
 * Distinct from the OpenWeatherMap integration in src/lib/weather-api.ts
 * which powers the legacy dashboard widgets. NOAA is the official US gov
 * forecast service and the appropriate source for SMARTS Ad Hoc
 * Monitoring Report decisions.
 *
 * Public API: https://api.weather.gov/
 *   - GET /points/{lat},{lon}        → metadata, forecastHourly URL, forecastGridData URL
 *   - GET {forecastHourly}           → 7-day, hourly periods with PoP + shortForecast
 *   - GET {forecastGridData}         → fine-grained, includes QPF in mm
 *
 * Required header: User-Agent with contact info.
 *   Set NOAA_USER_AGENT in `.env.local` (e.g. 'SiteCheck (you@example.com)').
 *   NOAA blocks User-Agent values that look like browsers or default
 *   clients. The fallback below is a development placeholder only.
 *
 * Caching: 10-minute in-memory cache keyed by `lat,lon` rounded to 4
 * decimals (~11m precision) to defeat floating-point noise between
 * different callers. Per-process cache only — fine for a single Next.js
 * dev server; production scale-out would want Redis or similar.
 *
 * Graceful failure: returns `{ state: 'unknown', error: '...' }` on any
 * upstream failure. Never throws — the dashboard banner needs to render
 * even when NOAA is having a bad day.
 */

const BASE_URL = 'https://api.weather.gov';
const TTL_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_USER_AGENT = 'SiteCheck Dev (dev@example.com)';

export type NoaaState =
  | 'clear'
  | 'pre-storm'
  | 'during-storm'
  | 'post-storm'
  | 'unknown';

export interface NoaaHourlyPeriod {
  startTime: string;
  endTime: string;
  temperature: number;
  temperatureUnit: string;
  /** NOAA's probability of precipitation, 0–100. Null when absent. */
  probabilityOfPrecipitation: number | null;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
}

export interface NoaaSummary {
  /** Estimated total precipitation in inches over the next 24 hours. */
  precipitationNext24h: number;
  /** True when rain is actively falling right now per the current hour. */
  activeNow: boolean;
  /** Computed state — see `computeState` for rules. */
  state: NoaaState;
  /** Hourly periods for the next 24 hours. */
  hourlyForecast: NoaaHourlyPeriod[];
  /** When the summary was assembled, ISO 8601. */
  lastChecked: string;
  /** Set when NOAA fetch failed; caller can show a stale-data warning. */
  error?: string;
}

// ──────────────────────────────────────────────────────────────────────
// In-memory cache
// ──────────────────────────────────────────────────────────────────────

interface CacheEntry {
  data: NoaaSummary;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

function getCached(lat: number, lon: number): NoaaSummary | null {
  const key = cacheKey(lat, lon);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(lat: number, lon: number, data: NoaaSummary): void {
  cache.set(cacheKey(lat, lon), { data, cachedAt: Date.now() });
}

// ──────────────────────────────────────────────────────────────────────
// NOAA HTTP
// ──────────────────────────────────────────────────────────────────────

function userAgent(): string {
  return process.env.NOAA_USER_AGENT || DEFAULT_USER_AGENT;
}

async function noaaFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': userAgent(),
      Accept: 'application/geo+json',
    },
    // The 10-minute in-memory cache above is the source of truth.
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `NOAA ${url} → ${res.status} ${res.statusText}: ${body.slice(0, 200)}`
    );
  }
  return res.json();
}

interface NoaaPointsResponse {
  properties: {
    forecastHourly: string;
    forecastGridData: string;
  };
}

interface NoaaHourlyForecastResponse {
  properties: {
    periods: Array<{
      startTime: string;
      endTime: string;
      temperature: number;
      temperatureUnit: string;
      probabilityOfPrecipitation: { value: number | null };
      windSpeed: string;
      windDirection: string;
      shortForecast: string;
    }>;
  };
}

interface NoaaGridDataResponse {
  properties: {
    quantitativePrecipitation?: {
      uom: string;
      values: Array<{ validTime: string; value: number | null }>;
    };
  };
}

// ──────────────────────────────────────────────────────────────────────
// Pure helpers
// ──────────────────────────────────────────────────────────────────────

function isRainKeyword(s: string): boolean {
  return /\b(rain|shower|drizzle|thunderstorm|storm)\b/i.test(s);
}

function mmToInches(mm: number): number {
  return mm / 25.4;
}

/**
 * Sum precipitation values over the next 24 hours, accounting for
 * partial overlap with multi-hour NOAA grid intervals (e.g. PT6H).
 *
 * `validTime` is ISO 8601 interval format: "<startISO>/PT{n}H".
 * Values are apportioned linearly across the interval — a 6h interval
 * value of 12mm centered around now+22h contributes 2/6 * 12 = 4mm.
 */
function sumPrecipMmNext24h(
  values: Array<{ validTime: string; value: number | null }>
): number {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 24 * 3600 * 1000);
  let totalMm = 0;
  for (const { validTime, value } of values) {
    if (value == null || value <= 0) continue;
    const [startStr, durStr] = validTime.split('/');
    const start = new Date(startStr);
    const match = /PT(\d+)H/.exec(durStr ?? '');
    const durationHours = match ? parseInt(match[1], 10) : 1;
    const end = new Date(start.getTime() + durationHours * 3600 * 1000);
    if (start >= cutoff || end <= now) continue;
    const overlapStart = start > now ? start : now;
    const overlapEnd = end < cutoff ? end : cutoff;
    const overlapHours =
      (overlapEnd.getTime() - overlapStart.getTime()) / 3600 / 1000;
    const fraction = overlapHours / durationHours;
    totalMm += value * fraction;
  }
  return totalMm;
}

/**
 * Rough fallback used only when forecastGridData isn't available.
 * Each hour's PoP contributes a small expected-value to the 24h total.
 */
function estimatePrecipNext24hFromPop(hourly: NoaaHourlyPeriod[]): number {
  const next24 = hourly.slice(0, 24);
  const est = next24.reduce((acc, p) => {
    const pop = p.probabilityOfPrecipitation ?? 0;
    if (pop >= 90) return acc + 0.1;
    if (pop >= 70) return acc + 0.05;
    if (pop >= 50) return acc + 0.02;
    return acc;
  }, 0);
  return Number(est.toFixed(2));
}

function computeActiveNow(first: NoaaHourlyPeriod | undefined): boolean {
  if (!first) return false;
  if ((first.probabilityOfPrecipitation ?? 0) > 70) return true;
  if (isRainKeyword(first.shortForecast)) return true;
  return false;
}

/**
 * Rules per the SMARTS spec:
 *   - during-storm: activeNow OR any of next 2 hours has PoP > 70
 *   - pre-storm:    any of next 24 hours has PoP > 70 (and not during-storm)
 *   - clear:        otherwise
 *
 * 'post-storm' is workflow state set elsewhere (by the dashboard banner
 * when the linked smarts_event has status='ended'). NOAA forecast data
 * alone can't tell us about past precipitation, so this function never
 * returns 'post-storm'.
 */
function computeState(
  hourly: NoaaHourlyPeriod[],
  activeNow: boolean
): NoaaState {
  if (activeNow) return 'during-storm';
  const next2 = hourly.slice(0, 2);
  if (next2.some((p) => (p.probabilityOfPrecipitation ?? 0) > 70)) {
    return 'during-storm';
  }
  const next24 = hourly.slice(0, 24);
  if (next24.some((p) => (p.probabilityOfPrecipitation ?? 0) > 70)) {
    return 'pre-storm';
  }
  return 'clear';
}

// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────

/**
 * Fetch a NOAA forecast summary for a lat/lon. Returns a
 * `state: 'unknown'` result with an `error` message on any upstream
 * failure rather than throwing — caller is the dashboard banner and
 * must keep rendering.
 */
export async function fetchNoaaSummary(
  lat: number,
  lon: number
): Promise<NoaaSummary> {
  if (
    Number.isNaN(lat) ||
    Number.isNaN(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return {
      precipitationNext24h: 0,
      activeNow: false,
      state: 'unknown',
      hourlyForecast: [],
      lastChecked: new Date().toISOString(),
      error: `Invalid lat/lon: ${lat},${lon}`,
    };
  }

  const cached = getCached(lat, lon);
  if (cached) return cached;

  try {
    const pointsUrl = `${BASE_URL}/points/${lat.toFixed(4)},${lon.toFixed(4)}`;
    const points = (await noaaFetch(pointsUrl)) as NoaaPointsResponse;
    const { forecastHourly, forecastGridData } = points.properties;

    // Hourly is required; gridData is best-effort for QPF accuracy.
    const [hourly, gridData] = await Promise.all([
      noaaFetch(forecastHourly) as Promise<NoaaHourlyForecastResponse>,
      (noaaFetch(forecastGridData) as Promise<NoaaGridDataResponse>).catch(
        (err): NoaaGridDataResponse | null => {
          console.warn(
            'NOAA gridData fetch failed (continuing without QPF):',
            err
          );
          return null;
        }
      ),
    ]);

    const hourlyForecast: NoaaHourlyPeriod[] = hourly.properties.periods
      .slice(0, 48) // buffer past 24h for state lookahead
      .map((p) => ({
        startTime: p.startTime,
        endTime: p.endTime,
        temperature: p.temperature,
        temperatureUnit: p.temperatureUnit,
        probabilityOfPrecipitation: p.probabilityOfPrecipitation?.value ?? null,
        windSpeed: p.windSpeed,
        windDirection: p.windDirection,
        shortForecast: p.shortForecast,
      }));

    const activeNow = computeActiveNow(hourlyForecast[0]);

    let precipitationNext24h: number;
    if (gridData?.properties?.quantitativePrecipitation) {
      // NOAA QPF is in millimeters per WMO spec — convert to inches.
      const sumMm = sumPrecipMmNext24h(
        gridData.properties.quantitativePrecipitation.values
      );
      precipitationNext24h = Number(mmToInches(sumMm).toFixed(2));
    } else {
      precipitationNext24h = estimatePrecipNext24hFromPop(hourlyForecast);
    }

    const summary: NoaaSummary = {
      precipitationNext24h,
      activeNow,
      state: computeState(hourlyForecast, activeNow),
      hourlyForecast: hourlyForecast.slice(0, 24),
      lastChecked: new Date().toISOString(),
    };

    setCached(lat, lon, summary);
    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown NOAA error';
    console.warn('NOAA fetch failed:', message);
    return {
      precipitationNext24h: 0,
      activeNow: false,
      state: 'unknown',
      hourlyForecast: [],
      lastChecked: new Date().toISOString(),
      error: message,
    };
  }
}
