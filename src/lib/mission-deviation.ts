/**
 * Block 4 — Pure deviation math for the mission replay overlay.
 *
 * No React, no DB, no fetch. Computes:
 *   1. Perpendicular distance from a sample point to a planned segment.
 *   2. Aggregate flight-quality stats for MissionDeviationPanel.
 *   3. The list of "high-deviation" samples used to render arrow icons on
 *      the replay map.
 *
 * Distance math uses the small-angle equirectangular approximation. For the
 * geographic scale of a single mission (a few miles, single state plane), the
 * error vs. true haversine is < 0.1% — well within the 30-foot deviation
 * threshold the UI uses.
 */

import type {
  DroneTelemetrySample,
  MissionDeviationStats,
} from '@/types/drone';

const FEET_PER_METER = 3.28084;
const EARTH_RADIUS_M = 6_371_000;

interface LngLat {
  lng: number;
  lat: number;
}

/**
 * Convert lat/lng degrees to meters in a local tangent plane centered on
 * `originLat`. The plane is good enough for sub-mile distances.
 */
function toLocalMeters(p: LngLat, originLat: number): { x: number; y: number } {
  const cosLat = Math.cos((originLat * Math.PI) / 180);
  const x = ((p.lng) * Math.PI) / 180 * EARTH_RADIUS_M * cosLat;
  const y = ((p.lat) * Math.PI) / 180 * EARTH_RADIUS_M;
  return { x, y };
}

function metersBetween(a: LngLat, b: LngLat): number {
  const ax = toLocalMeters(a, a.lat);
  const bx = toLocalMeters(b, a.lat);
  const dx = bx.x - ax.x;
  const dy = bx.y - ax.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Perpendicular distance (in feet) from point `p` to the line segment a→b.
 * If the projection falls outside [0,1] the distance to the nearest endpoint
 * is returned instead.
 */
export function pointToSegmentDistanceFeet(
  p: LngLat,
  a: LngLat,
  b: LngLat
): number {
  // All three points projected to a local tangent plane centered on `a`.
  const origin = a.lat;
  const pa = toLocalMeters(a, origin);
  const pb = toLocalMeters(b, origin);
  const pp = toLocalMeters(p, origin);

  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) {
    // Degenerate segment — fall back to a→p distance
    return metersBetween(a, p) * FEET_PER_METER;
  }
  let t = ((pp.x - pa.x) * dx + (pp.y - pa.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = pa.x + t * dx;
  const cy = pa.y + t * dy;
  const ex = pp.x - cx;
  const ey = pp.y - cy;
  return Math.sqrt(ex * ex + ey * ey) * FEET_PER_METER;
}

/**
 * Distance from a sample to the nearest planned-path segment, in feet.
 * Returns `Infinity` for paths with fewer than 2 vertices.
 */
export function sampleDeviationFeet(
  sample: DroneTelemetrySample,
  plannedPath: [number, number][]
): number {
  if (plannedPath.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0; i < plannedPath.length - 1; i++) {
    const a: LngLat = { lng: plannedPath[i][0], lat: plannedPath[i][1] };
    const b: LngLat = { lng: plannedPath[i + 1][0], lat: plannedPath[i + 1][1] };
    const d = pointToSegmentDistanceFeet({ lng: sample.lng, lat: sample.lat }, a, b);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Aggregate flight-quality stats for the deviation panel. Safe to call with
 * an empty `actualSamples` array — returns zeroes.
 */
export function computeDeviationStats(
  plannedPath: [number, number][],
  actualSamples: DroneTelemetrySample[],
  plannedAltitudeFeet: number,
  plannedWaypointCount: number,
  capturedWaypointCount: number
): MissionDeviationStats {
  if (actualSamples.length === 0) {
    return {
      maxDeviationFeet: 0,
      meanDeviationFeet: 0,
      maxAltitudeDeviationFeet: 0,
      capturedWaypointCount,
      plannedWaypointCount,
      meanGroundSpeedMph: 0,
      totalFlightSeconds: 0,
      sampleCount: 0,
    };
  }

  let maxDev = 0;
  let totalDev = 0;
  let maxAltDev = 0;
  let totalSpeed = 0;

  for (const s of actualSamples) {
    const d = sampleDeviationFeet(s, plannedPath);
    if (Number.isFinite(d)) {
      if (d > maxDev) maxDev = d;
      totalDev += d;
    }
    const altDev = Math.abs(s.altitudeFeet - plannedAltitudeFeet);
    if (altDev > maxAltDev) maxAltDev = altDev;
    totalSpeed += s.speedMph;
  }

  const first = actualSamples[0];
  const last = actualSamples[actualSamples.length - 1];
  const totalFlightSeconds = Math.max(
    0,
    Math.round(
      (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / 1000
    )
  );

  return {
    maxDeviationFeet: Math.round(maxDev),
    meanDeviationFeet: Math.round(totalDev / actualSamples.length),
    maxAltitudeDeviationFeet: Math.round(maxAltDev),
    capturedWaypointCount,
    plannedWaypointCount,
    meanGroundSpeedMph: Math.round((totalSpeed / actualSamples.length) * 10) / 10,
    totalFlightSeconds,
    sampleCount: actualSamples.length,
  };
}

/**
 * Return the subset of `actualSamples` whose deviation from the planned path
 * exceeds `thresholdFeet`. Used to render arrow markers on the replay map.
 */
export function findHighDeviationSamples(
  plannedPath: [number, number][],
  actualSamples: DroneTelemetrySample[],
  thresholdFeet = 30
): DroneTelemetrySample[] {
  const out: DroneTelemetrySample[] = [];
  for (const s of actualSamples) {
    const d = sampleDeviationFeet(s, plannedPath);
    if (Number.isFinite(d) && d > thresholdFeet) out.push(s);
  }
  return out;
}

/**
 * Color helper for the deviation panel tiles. Green ≤ 30 ft, amber 30-100 ft,
 * red > 100 ft.
 */
export function deviationSeverity(feet: number): 'good' | 'warn' | 'bad' {
  if (feet <= 30) return 'good';
  if (feet <= 100) return 'warn';
  return 'bad';
}
