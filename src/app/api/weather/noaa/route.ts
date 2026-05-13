/**
 * GET /api/weather/noaa?lat=<lat>&lon=<lon>
 *
 * Proxy to NOAA's public api.weather.gov with a 10-minute in-memory
 * cache. Stateless and read-only — no DB writes, no user data. The
 * middleware whitelists this route alongside `/api/admin/` so the
 * dashboard banner can call it before a Supabase session exists (e.g.
 * in demo mode).
 *
 * Env: set NOAA_USER_AGENT (e.g. 'SiteCheck (you@example.com)') in
 * `.env.local`. NOAA blocks browser-like or default User-Agent values.
 *
 * Response: NoaaSummary — see src/lib/smarts/noaa.ts. Status is always
 * 200 on a well-formed request; on upstream NOAA failure the body has
 * `state: 'unknown'` and `error: '...'`. Status 400 only when lat/lon
 * are missing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchNoaaSummary } from '@/lib/smarts/noaa';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const latRaw = searchParams.get('lat');
  const lonRaw = searchParams.get('lon');

  if (!latRaw || !lonRaw) {
    return NextResponse.json(
      { state: 'unknown', error: 'lat and lon query params are required' },
      { status: 400 }
    );
  }

  const lat = Number(latRaw);
  const lon = Number(lonRaw);

  const summary = await fetchNoaaSummary(lat, lon);
  return NextResponse.json(summary);
}
