/**
 * Geofence + No-Fly Zone validation library.
 *
 * Pure-JS implementation of point-in-polygon (ray casting) and segment
 * intersection. No external geometry deps — keeps bundle small and avoids
 * pulling in @turf/turf or its submodules.
 *
 * All polygons here are arrays of [lng, lat] pairs forming a closed ring
 * (first point may or may not equal last point — both forms accepted).
 */

import type { Geofence } from '@/types/geofence';
import type { NoFlyZone } from '@/types/nofly-zone';
import type { Project } from '@/types/project';

// ============================================================
// Types
// ============================================================

export type ViolationKind =
  | 'outside-geofence'
  | 'inside-nofly-zone'
  | 'altitude-ceiling';

export interface PathViolation {
  kind: ViolationKind;
  /** present when violation is per-waypoint */
  waypointNumber?: number;
  /** present when violation is on a flight-path edge */
  pathSegmentIndex?: number;
  /** id of the geofence or no-fly zone violated */
  zoneId?: string;
  zoneName?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  violations: PathViolation[];
}

export interface ValidatableWaypoint {
  lat: number;
  lng: number;
  number?: number;
  altitudeFeet?: number;
}

// ============================================================
// Geometry helpers
// ============================================================

/**
 * Ray-casting point-in-polygon test.
 * Polygon is an array of [lng, lat] pairs. Works for non-convex polygons.
 * Points exactly on the boundary may return either true or false (acceptable
 * for our use case — we have a 50ft buffer in the auto-derived fence).
 */
export function pointInPolygon(
  point: [number, number],
  polygon: [number, number][]
): boolean {
  if (polygon.length < 3) return false;
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Test whether two 2D line segments intersect.
 * Uses orientation tests. Treats collinear-overlapping as intersecting.
 */
function segmentsIntersect(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number]
): boolean {
  const o = (
    p: [number, number],
    q: [number, number],
    r: [number, number]
  ): number => {
    const v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    if (Math.abs(v) < 1e-15) return 0;
    return v > 0 ? 1 : 2;
  };
  const onSeg = (
    p: [number, number],
    q: [number, number],
    r: [number, number]
  ): boolean =>
    Math.min(p[0], r[0]) <= q[0] &&
    q[0] <= Math.max(p[0], r[0]) &&
    Math.min(p[1], r[1]) <= q[1] &&
    q[1] <= Math.max(p[1], r[1]);

  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(a, c, b)) return true;
  if (o2 === 0 && onSeg(a, d, b)) return true;
  if (o3 === 0 && onSeg(c, a, d)) return true;
  if (o4 === 0 && onSeg(c, b, d)) return true;
  return false;
}

/**
 * Test whether a [lng,lat]→[lng,lat] segment crosses a polygon boundary edge.
 * Used to catch flyovers — the case where both endpoints are clear but the
 * straight-line path between them clips through a polygon.
 */
function segmentCrossesPolygon(
  segStart: [number, number],
  segEnd: [number, number],
  polygon: [number, number][]
): boolean {
  if (polygon.length < 3) return false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (segmentsIntersect(segStart, segEnd, polygon[i], polygon[j])) {
      return true;
    }
  }
  return false;
}

/**
 * Check whether a waypoint's altitude falls inside a no-fly zone's vertical band.
 * If altitude is unknown we conservatively assume the zone applies.
 */
function altitudeWithinBand(
  altitudeFeet: number | undefined,
  floorFeet: number | undefined,
  ceilingFeet: number | undefined
): boolean {
  if (altitudeFeet == null) return true; // unknown altitude → assume in band
  const floor = floorFeet ?? 0;
  const ceiling = ceilingFeet ?? Number.POSITIVE_INFINITY;
  return altitudeFeet >= floor && altitudeFeet <= ceiling;
}

// ============================================================
// Public validation API
// ============================================================

/**
 * Validate a single waypoint against a geofence + list of no-fly zones.
 * Returns an array of violations (empty if the waypoint is clear).
 */
export function validateWaypoint(
  waypoint: ValidatableWaypoint,
  geofence: Geofence | undefined,
  noFlyZones: NoFlyZone[]
): PathViolation[] {
  const violations: PathViolation[] = [];
  const point: [number, number] = [waypoint.lng, waypoint.lat];

  // 1. Geofence containment
  if (geofence && geofence.polygon.length >= 3) {
    if (!pointInPolygon(point, geofence.polygon)) {
      violations.push({
        kind: 'outside-geofence',
        waypointNumber: waypoint.number,
        zoneId: geofence.id,
        zoneName: geofence.name,
        message: `Waypoint ${waypoint.number ?? '?'} is outside the project geofence "${geofence.name}".`,
      });
    }

    // Altitude ceiling check (only meaningful if waypoint has altitude)
    if (
      waypoint.altitudeFeet != null &&
      geofence.ceilingFeet != null &&
      waypoint.altitudeFeet > geofence.ceilingFeet
    ) {
      violations.push({
        kind: 'altitude-ceiling',
        waypointNumber: waypoint.number,
        zoneId: geofence.id,
        zoneName: geofence.name,
        message: `Waypoint ${waypoint.number ?? '?'} altitude ${waypoint.altitudeFeet}ft exceeds geofence ceiling ${geofence.ceilingFeet}ft.`,
      });
    }
  }

  // 2. No-fly zone containment
  for (const zone of noFlyZones) {
    if (!zone.active || zone.polygon.length < 3) continue;
    if (!altitudeWithinBand(waypoint.altitudeFeet, zone.floorFeet, zone.ceilingFeet)) {
      continue;
    }
    if (pointInPolygon(point, zone.polygon)) {
      violations.push({
        kind: 'inside-nofly-zone',
        waypointNumber: waypoint.number,
        zoneId: zone.id,
        zoneName: zone.name,
        message: `Waypoint ${waypoint.number ?? '?'} is inside no-fly zone "${zone.name}" (${zone.category}).`,
      });
    }
  }

  return violations;
}

/**
 * Validate an entire flight path (list of [lng,lat] coordinates) plus its
 * waypoints against a project's geofence and no-fly zones.
 *
 * Two-pass strategy:
 *   1. Validate each waypoint individually (point-in-polygon).
 *   2. Validate each flight-path segment to catch flyovers — cases where both
 *      endpoints are outside a no-fly zone but the straight line between them
 *      clips through it.
 */
export function validateFlightPath(
  flightPath: [number, number][],
  waypoints: ValidatableWaypoint[],
  geofence: Geofence | undefined,
  noFlyZones: NoFlyZone[],
  options?: { defaultAltitudeFeet?: number }
): ValidationResult {
  const violations: PathViolation[] = [];
  const defaultAlt = options?.defaultAltitudeFeet;

  // Pass 1: per-waypoint checks
  for (const wp of waypoints) {
    const wpWithAlt: ValidatableWaypoint = {
      ...wp,
      altitudeFeet: wp.altitudeFeet ?? defaultAlt,
    };
    violations.push(...validateWaypoint(wpWithAlt, geofence, noFlyZones));
  }

  // Pass 2: per-segment flyover checks against no-fly zones
  // (We don't need this for the geofence — if both endpoints are inside a
  // convex-ish fence, the segment between them is also inside in practice.)
  if (flightPath.length >= 2) {
    for (let i = 0; i < flightPath.length - 1; i++) {
      const segStart = flightPath[i];
      const segEnd = flightPath[i + 1];
      for (const zone of noFlyZones) {
        if (!zone.active || zone.polygon.length < 3) continue;
        if (
          !altitudeWithinBand(defaultAlt, zone.floorFeet, zone.ceilingFeet)
        ) {
          continue;
        }
        // Skip if either endpoint is already flagged inside this zone
        // (avoids duplicating violations from pass 1)
        if (
          pointInPolygon(segStart, zone.polygon) ||
          pointInPolygon(segEnd, zone.polygon)
        ) {
          continue;
        }
        if (segmentCrossesPolygon(segStart, segEnd, zone.polygon)) {
          violations.push({
            kind: 'inside-nofly-zone',
            pathSegmentIndex: i,
            zoneId: zone.id,
            zoneName: zone.name,
            message: `Flight path segment ${i}→${i + 1} crosses no-fly zone "${zone.name}".`,
          });
        }
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

// ============================================================
// Default geofence derivation
// ============================================================

/**
 * Compute a perpendicular offset from a point along a bearing.
 * Mirrors the helper used by `RowLayer`.
 */
function perpendicularOffset(
  point: [number, number],
  bearing: number,
  distanceFeet: number
): [number, number] {
  const distDegLat = distanceFeet / 364000;
  const latRad = (point[1] * Math.PI) / 180;
  const distDegLng = distanceFeet / (364000 * Math.cos(latRad));
  const perpBearing = bearing - Math.PI / 2;
  return [
    point[0] + distDegLng * Math.sin(perpBearing),
    point[1] + distDegLat * Math.cos(perpBearing),
  ];
}

function computeBearing(
  from: [number, number],
  to: [number, number]
): number {
  const dLng = ((to[0] - from[0]) * Math.PI) / 180;
  const lat1 = (from[1] * Math.PI) / 180;
  const lat2 = (to[1] * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return Math.atan2(y, x);
}

/**
 * Buffer a centerline polyline left and right by `halfWidthFeet`, then close
 * the result into a polygon ring.
 */
function bufferCenterlineToPolygon(
  centerline: [number, number][],
  halfWidthFeet: number
): [number, number][] {
  if (centerline.length < 2) return [];
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < centerline.length; i++) {
    let bearing: number;
    if (i === 0) {
      bearing = computeBearing(centerline[0], centerline[1]);
    } else if (i === centerline.length - 1) {
      bearing = computeBearing(centerline[i - 1], centerline[i]);
    } else {
      const b1 = computeBearing(centerline[i - 1], centerline[i]);
      const b2 = computeBearing(centerline[i], centerline[i + 1]);
      bearing = Math.atan2(
        (Math.sin(b1) + Math.sin(b2)) / 2,
        (Math.cos(b1) + Math.cos(b2)) / 2
      );
    }
    left.push(perpendicularOffset(centerline[i], bearing, halfWidthFeet));
    right.push(perpendicularOffset(centerline[i], bearing, -halfWidthFeet));
  }
  // Close into a polygon: left forward, right reversed, back to start
  return [...left, ...right.reverse(), left[0]];
}

/**
 * Derive a default geofence polygon from a project.
 *
 * For linear projects: buffer the centerline by max(corridor width, ROW width)/2 + 50 ft.
 * For bounded-site projects: convert the bounding box into a 4-corner polygon.
 * Returns undefined if neither is available.
 */
export function deriveDefaultGeofence(project: Project): Geofence | undefined {
  // Linear: buffer centerline
  if (project.projectType === 'linear' && project.corridor?.centerline?.length) {
    const corridorHalf = (project.corridor.corridorWidthFeet ?? 0) / 2;
    const rowHalf = (project.rowBoundaries?.widthFeet ?? 0) / 2;
    const halfWidth = Math.max(corridorHalf, rowHalf) + 50; // 50ft buffer
    const polygon = bufferCenterlineToPolygon(
      project.corridor.centerline,
      halfWidth
    );
    if (polygon.length < 4) return undefined;
    return {
      id: `geofence-auto-${project.id}`,
      projectId: project.id,
      name: `${project.name} — Auto Geofence`,
      polygon,
      source: 'auto',
      notes: `Auto-derived from corridor centerline (buffer ${Math.round(halfWidth)}ft)`,
    };
  }

  // Bounded-site: bounding box → polygon
  if (project.bounds) {
    const [[lat1, lng1], [lat2, lng2]] = project.bounds;
    const minLng = Math.min(lng1, lng2);
    const maxLng = Math.max(lng1, lng2);
    const minLat = Math.min(lat1, lat2);
    const maxLat = Math.max(lat1, lat2);
    const polygon: [number, number][] = [
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat],
    ];
    return {
      id: `geofence-auto-${project.id}`,
      projectId: project.id,
      name: `${project.name} — Auto Geofence`,
      polygon,
      source: 'auto',
      notes: 'Auto-derived from project bounding box',
    };
  }

  return undefined;
}
