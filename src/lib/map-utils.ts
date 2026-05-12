/**
 * Shared map viewport utilities — computes center + zoom from points or linestrings.
 */

export interface ViewportState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

/**
 * Compute a viewport that fits all given lat/lng points with padding.
 * Uses a simple heuristic to estimate zoom from bounds span.
 */
export function fitBoundsFromPoints(
  points: { lat: number; lng: number }[],
  options?: { minZoom?: number; maxZoom?: number; padding?: number }
): ViewportState {
  const { minZoom = 8, maxZoom = 18, padding = 0.2 } = options ?? {};

  if (points.length === 0) {
    return { longitude: 0, latitude: 0, zoom: 2, pitch: 0, bearing: 0 };
  }

  if (points.length === 1) {
    return {
      longitude: points[0].lng,
      latitude: points[0].lat,
      zoom: 16,
      pitch: 0,
      bearing: 0,
    };
  }

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  const latSpan = (maxLat - minLat) * (1 + padding);
  const lngSpan = (maxLng - minLng) * (1 + padding);
  const maxSpan = Math.max(latSpan, lngSpan);

  // Heuristic: at zoom 16, roughly 0.005° fills the viewport
  const zoom = maxSpan > 0
    ? Math.min(maxZoom, Math.max(minZoom, Math.log2(0.01 / maxSpan) + 16))
    : 16;

  return { longitude: centerLng, latitude: centerLat, zoom, pitch: 0, bearing: 0 };
}

/**
 * Compute a viewport from a GeoJSON LineString coordinate array.
 * Coordinates are [lng, lat] pairs.
 */
export function fitBoundsFromLineString(
  coordinates: [number, number][],
  options?: { minZoom?: number; maxZoom?: number; padding?: number }
): ViewportState {
  const points = coordinates.map(([lng, lat]) => ({ lat, lng }));
  return fitBoundsFromPoints(points, options);
}
