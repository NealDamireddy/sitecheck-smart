/**
 * GET /api/geocode?address=...
 *
 * Server-side proxy for `geocodeAddress`. The lookup runs here rather than in
 * the browser so the upstream call is not subject to the geocoder's CORS
 * policy, the outbound User-Agent is ours, and the behaviour is testable
 * without a DOM.
 *
 * Authenticated: this is a signed-in workflow action, and proxying an
 * unauthenticated outbound fetch for anyone on the internet is a small open
 * relay.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { geocodeAddress } from '@/lib/geocode';
import { log } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const address = request.nextUrl.searchParams.get('address') ?? '';
    const result = await geocodeAddress(address);

    if (!result.ok) {
      // 422 for "we looked and found nothing" so the client can tell it apart
      // from a transport failure; 503 when the lookup itself is down.
      const status = result.reason === 'unavailable' ? 503 : 422;
      return NextResponse.json(
        { error: result.message, code: result.reason },
        { status }
      );
    }

    return NextResponse.json({
      lat: result.lat,
      lng: result.lng,
      matchedAddress: result.matchedAddress,
      source: result.source,
      provider: result.provider,
      precision: result.precision,
    });
  } catch (err) {
    log.error('Geocode lookup failed', { err });
    return NextResponse.json(
      { error: 'Address lookup failed', code: 'unavailable' },
      { status: 503 }
    );
  }
}
