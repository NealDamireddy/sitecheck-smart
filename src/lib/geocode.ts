/**
 * Street address → coordinates, for US addresses.
 *
 * Why this exists: the project wizard used to fall back to
 * `{ lat: 36.78, lng: -119.42 }` — the bundled demo project's centre, in
 * Fresno — whenever it had no location. A Pleasanton site created on
 * 2026-08-08 was stored with Fresno's coordinates, so NOAA was asked about
 * Fresno and the dashboard showed Fresno's weather as if it were the site's.
 * On a product whose rain-event triggers key off site location, that is a
 * correctness bug, not a display one.
 *
 * `src/lib/weather-api.ts` already refuses to guess a location. This module
 * exists so the wizard can stop guessing too.
 *
 * Source: the US Census Bureau geocoder. Chosen over Mapbox because the
 * project's `NEXT_PUBLIC_MAPBOX_TOKEN` is still a placeholder, and over
 * commercial providers because it needs no key, no billing, and is an official
 * government service — which is easier to defend in a regulatory record. Every
 * CGP site this product serves is in California, so US-only coverage costs
 * nothing.
 *
 * Never throws. Returns a discriminated result so callers can tell "no match"
 * apart from "lookup unavailable" and say so, rather than silently proceeding
 * with a wrong number.
 */

const CENSUS_URL =
  'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const TIMEOUT_MS = 8000;

/**
 * Nominatim's usage policy requires an identifying User-Agent and limits
 * callers to ~1 request/second. Site creation is rare and interactive, so the
 * rate is a non-issue, but the identification is mandatory.
 */
const NOMINATIM_UA =
  process.env.NOAA_USER_AGENT || 'SiteCheck (stormwater compliance tooling)';

/** How a project's coordinates were arrived at. Trustworthiness, recorded. */
export type LocationSource = 'geocoded' | 'manual' | 'centerline' | 'unknown';

/** Which service answered. Kept so a bad coordinate can be traced later. */
export type GeocodeProvider = 'census' | 'osm';

/**
 * How exact the match is.
 *
 * 'address' means the house number was matched. 'street' means only the road
 * was found — fine for weather (NOAA's grid is ~2.5 km) but worth showing the
 * user before they accept it as the site position.
 */
export type GeocodePrecision = 'address' | 'street';

export type GeocodeResult =
  | {
      ok: true;
      lat: number;
      lng: number;
      /** The address the geocoder actually matched — show this for confirmation. */
      matchedAddress: string;
      source: 'geocoded';
      provider: GeocodeProvider;
      precision: GeocodePrecision;
    }
  | {
      ok: false;
      /** 'no_match' is the user's problem to fix; 'unavailable' is ours. */
      reason: 'no_match' | 'unavailable' | 'empty_input';
      message: string;
    };

interface NominatimMatch {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: { house_number?: string };
}

interface CensusMatch {
  matchedAddress?: string;
  coordinates?: { x?: number; y?: number };
}

/**
 * Validate a coordinate pair, returning it narrowed or null.
 *
 * Returns the pair rather than acting as a type guard because a guard can only
 * narrow one parameter, and both need to be known-good before use.
 */
export function usableCoords(
  lat: unknown,
  lng: unknown
): { lat: number; lng: number } | null {
  const ok =
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    // 0,0 is in the Atlantic. Treat it as a missing value, not a location —
    // it is the classic silent default and would sail through range checks.
    !(lat === 0 && lng === 0);
  return ok ? { lat: lat as number, lng: lng as number } : null;
}

/** One provider attempt. `null` means "no answer" — try the next provider. */
type ProviderResult =
  | { lat: number; lng: number; matchedAddress: string; precision: GeocodePrecision }
  | null;

async function getJson(url: URL, headers: Record<string, string>): Promise<unknown | 'unavailable'> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal, headers });
    clearTimeout(timer);
    if (!res.ok) return 'unavailable';
    return await res.json();
  } catch {
    return 'unavailable';
  }
}

/** US Census Bureau. Authoritative for a regulatory record, but its address
 *  file lags new construction — the exact population this product serves. */
async function tryCensus(query: string): Promise<ProviderResult | 'unavailable'> {
  const url = new URL(CENSUS_URL);
  url.searchParams.set('address', query);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');

  const payload = await getJson(url, { Accept: 'application/json' });
  if (payload === 'unavailable') return 'unavailable';

  const matches = (payload as { result?: { addressMatches?: CensusMatch[] } } | null)
    ?.result?.addressMatches;
  if (!Array.isArray(matches) || matches.length === 0) return null;

  const best = matches[0];
  // Census returns x = longitude, y = latitude. Getting these backwards puts
  // California sites in Kazakhstan, so they are named explicitly here.
  const coords = usableCoords(best?.coordinates?.y, best?.coordinates?.x);
  if (!coords) return null;

  return {
    ...coords,
    matchedAddress: best.matchedAddress || query,
    // Census onelineaddress only returns rooftop-level address matches.
    precision: 'address',
  };
}

/** OpenStreetMap. Weaker provenance, but it knows streets Census does not —
 *  "4002 Equus Ct, Pleasanton" is a real example Census cannot resolve. */
async function tryNominatim(query: string): Promise<ProviderResult | 'unavailable'> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');
  url.searchParams.set('addressdetails', '1');

  const payload = await getJson(url, {
    Accept: 'application/json',
    'User-Agent': NOMINATIM_UA,
  });
  if (payload === 'unavailable') return 'unavailable';

  const rows = payload as Array<NominatimMatch> | null;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const best = rows[0];
  const coords = usableCoords(Number(best?.lat), Number(best?.lon));
  if (!coords) return null;

  return {
    ...coords,
    matchedAddress: best.display_name || query,
    // Without a house number this is the road centroid, not the parcel. Say so
    // rather than implying a precision the answer does not have.
    precision: best.address?.house_number ? 'address' : 'street',
  };
}

/**
 * Resolve an address, trying the authoritative source first.
 *
 * Census is preferred because an official US government match is the easiest
 * thing to defend in a regulatory record. OpenStreetMap is the fallback
 * because Census's address file does not cover many newly built streets, and
 * construction sites are disproportionately on exactly those.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const query = address?.trim();
  if (!query) {
    return {
      ok: false,
      reason: 'empty_input',
      message: 'Enter a site address before looking up coordinates.',
    };
  }

  const providers: Array<[GeocodeProvider, (q: string) => Promise<ProviderResult | 'unavailable'>]> = [
    ['census', tryCensus],
    ['osm', tryNominatim],
  ];

  let everyProviderWasDown = true;

  for (const [provider, run] of providers) {
    const result = await run(query);
    if (result === 'unavailable') continue;
    everyProviderWasDown = false;
    if (result) {
      return {
        ok: true,
        lat: result.lat,
        lng: result.lng,
        matchedAddress: result.matchedAddress,
        source: 'geocoded',
        provider,
        precision: result.precision,
      };
    }
  }

  // Distinguish "we asked and nobody knows this address" from "we could not
  // ask" — the first is the user's to fix, the second is not.
  return everyProviderWasDown
    ? {
        ok: false,
        reason: 'unavailable',
        message:
          'Address lookup is unavailable right now. Enter coordinates manually to continue.',
      }
    : {
        ok: false,
        reason: 'no_match',
        message:
          'No match for that address. Check it, or enter coordinates manually.',
      };
}
