/**
 * Observed rainfall from NOAA weather stations (api.weather.gov).
 *
 * The QPE determination is a statement about rain that FELL, so it must
 * come from observations, not forecasts. NOAA station observations are
 * the official public record and the defensible source for a
 * regulator-facing determination.
 *
 * Flow: /points/{lat,lon} → observationStations → walk the nearest
 * stations in order, fetching hourly observations for the lookback
 * window, and use the first station whose `precipitationLastHour`
 * coverage is good enough. Many stations don't report hourly precip
 * (a known NOAA data-quality gap), hence the walk + the coverage field
 * on the result so callers can surface "sparse gauge data" honestly
 * instead of silently reporting 0.00″.
 *
 * Same conventions as src/lib/smarts/noaa.ts: User-Agent from
 * NOAA_USER_AGENT, short in-memory cache, never throws — returns an
 * error field instead so workflow surfaces keep rendering.
 */

import type { ObservedHour } from './detect';

const BASE_URL = 'https://api.weather.gov';
const CACHE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_USER_AGENT = 'SiteCheck Dev (dev@example.com)';
/** Stations to try, nearest first, before settling for sparse data. */
const MAX_STATIONS = 3;
/** Fraction of lookback hours that must have gauge readings. */
const GOOD_COVERAGE = 0.5;

export interface ObservedPrecipResult {
  hours: ObservedHour[];
  /** NOAA station the series came from, e.g. "KFAT". */
  stationId: string | null;
  stationName: string | null;
  /** Fraction (0–1) of lookback hours with a real gauge reading. */
  coverage: number;
  /** 'good' | 'sparse' | 'none' — how much to trust a 0.00 total. */
  quality: 'good' | 'sparse' | 'none';
  lastChecked: string;
  error?: string;
}

interface CacheEntry {
  data: ObservedPrecipResult;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

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
  properties: { observationStations: string };
}

interface StationsResponse {
  features: Array<{
    properties: { stationIdentifier: string; name: string };
  }>;
}

interface ObservationsResponse {
  features: Array<{
    properties: {
      timestamp: string;
      precipitationLastHour?: {
        unitCode: string;
        value: number | null;
      } | null;
    };
  }>;
}

function mmToInches(mm: number): number {
  return mm / 25.4;
}

/**
 * One station's observations → hourly series + coverage. Readings are
 * bucketed to the top of their hour; duplicate readings in an hour keep
 * the max (stations sometimes publish minutely specials).
 */
function seriesFromObservations(
  obs: ObservationsResponse,
  sinceMs: number,
  nowMs: number
): { hours: ObservedHour[]; coverage: number } {
  const byHour = new Map<number, number>();
  let reported = 0;

  for (const f of obs.features) {
    const t = new Date(f.properties.timestamp).getTime();
    if (!Number.isFinite(t) || t < sinceMs || t > nowMs) continue;
    const p = f.properties.precipitationLastHour;
    if (p == null || p.value == null) continue;
    reported += 1;
    const hourStart = Math.floor(t / 3_600_000) * 3_600_000;
    const inches = p.unitCode.includes('mm') ? mmToInches(p.value) : p.value;
    const prev = byHour.get(hourStart) ?? 0;
    byHour.set(hourStart, Math.max(prev, inches));
  }

  const expectedHours = Math.max(1, Math.floor((nowMs - sinceMs) / 3_600_000));
  const coverage = Math.min(1, reported / expectedHours);
  const hours: ObservedHour[] = [...byHour.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hourStart, inches]) => ({
      time: new Date(hourStart).toISOString(),
      inches: Math.max(0, inches),
    }));
  return { hours, coverage };
}

/**
 * Fetch observed hourly rainfall near a point for the trailing
 * `lookbackDays`. Never throws.
 */
export async function fetchObservedPrecip(
  lat: number,
  lng: number,
  lookbackDays: number,
  now: Date = new Date()
): Promise<ObservedPrecipResult> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${lookbackDays}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const fail = (error: string): ObservedPrecipResult => ({
    hours: [],
    stationId: null,
    stationName: null,
    coverage: 0,
    quality: 'none',
    lastChecked: now.toISOString(),
    error,
  });

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return fail(`Invalid coordinates: ${lat},${lng}`);
  }

  const sinceMs = now.getTime() - lookbackDays * 24 * 3_600_000;
  const sinceIso = new Date(sinceMs).toISOString();

  try {
    const points = (await noaaFetch(
      `${BASE_URL}/points/${lat.toFixed(4)},${lng.toFixed(4)}`
    )) as PointsResponse;
    const stations = (await noaaFetch(
      points.properties.observationStations
    )) as StationsResponse;

    let best: ObservedPrecipResult | null = null;

    for (const feature of stations.features.slice(0, MAX_STATIONS)) {
      const { stationIdentifier, name } = feature.properties;
      let obs: ObservationsResponse;
      try {
        obs = (await noaaFetch(
          `${BASE_URL}/stations/${stationIdentifier}/observations?start=${encodeURIComponent(
            sinceIso
          )}&limit=500`
        )) as ObservationsResponse;
      } catch {
        continue; // station down — try the next one
      }

      const { hours, coverage } = seriesFromObservations(
        obs,
        sinceMs,
        now.getTime()
      );
      const candidate: ObservedPrecipResult = {
        hours,
        stationId: stationIdentifier,
        stationName: name,
        coverage,
        quality:
          coverage >= GOOD_COVERAGE ? 'good' : coverage > 0 ? 'sparse' : 'none',
        lastChecked: now.toISOString(),
      };

      if (candidate.quality === 'good') {
        cache.set(key, { data: candidate, cachedAt: Date.now() });
        return candidate;
      }
      if (!best || candidate.coverage > best.coverage) best = candidate;
    }

    const result =
      best ?? fail('No nearby NOAA station reports hourly precipitation');
    cache.set(key, { data: result, cachedAt: Date.now() });
    return result;
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'NOAA fetch failed');
  }
}
