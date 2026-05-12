import { formatDistanceToNow, format, differenceInHours, differenceInMinutes, differenceInSeconds } from 'date-fns';
import type { CorridorGeometry, ProjectSegment } from '@/types/project';

export function formatRelativeTime(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy');
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy h:mm a');
}

export function formatTime(date: string | Date): string {
  return format(new Date(date), 'h:mm a');
}

export function formatCountdown(deadline: string | Date): { hours: number; minutes: number; seconds: number; expired: boolean } {
  const now = new Date();
  const target = new Date(deadline);

  if (now >= target) {
    return { hours: 0, minutes: 0, seconds: 0, expired: true };
  }

  const totalSeconds = Math.floor((target.getTime() - now.getTime()) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds, expired: false };
}

export function formatCoordinate(value: number, type: 'lat' | 'lng'): string {
  const direction = type === 'lat' ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
  return `${Math.abs(value).toFixed(6)}° ${direction}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

// ============================================================
// Linear / corridor stationing helpers
// ============================================================

/**
 * Format a station number in feet to standard surveying notation.
 * Example: 1525 → "STA 15+25"; 0 → "STA 0+00"; 27456 → "STA 274+56"
 */
export function formatStation(stationFeet: number): string {
  if (stationFeet < 0 || !Number.isFinite(stationFeet)) return 'STA —';
  const hundreds = Math.floor(stationFeet / 100);
  const remainder = Math.round(stationFeet % 100);
  return `STA ${hundreds}+${remainder.toString().padStart(2, '0')}`;
}

/**
 * Parse a station label back to a numeric value in feet.
 * Example: "STA 15+25" → 1525. Throws on invalid format.
 */
export function parseStation(label: string): number {
  const match = label.trim().match(/^STA\s+(\d+)\+(\d{1,2})$/i);
  if (!match) throw new Error(`Invalid station label: ${label}`);
  return parseInt(match[1], 10) * 100 + parseInt(match[2], 10);
}

/**
 * Format a length in feet to a human-readable string.
 * Falls back to miles when length >= 5280.
 */
export function formatLinearLength(feet: number, unit: 'feet' | 'miles' = 'feet'): string {
  if (unit === 'miles' || feet >= 5280) {
    return `${(feet / 5280).toFixed(2)} mi`;
  }
  if (feet >= 1000) return `${(feet / 1000).toFixed(2)}k ft`;
  return `${Math.round(feet)} ft`;
}

/**
 * Compute geodesic distance in feet between two [lng, lat] coordinates.
 * Uses the Haversine formula.
 */
export function distanceFeet(a: [number, number], b: [number, number]): number {
  const R = 20902231; // Earth radius in feet
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

/**
 * Compute the total length of a centerline in feet.
 */
export function centerlineLengthFeet(centerline: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < centerline.length; i++) {
    total += distanceFeet(centerline[i - 1], centerline[i]);
  }
  return total;
}

/**
 * Interpolate a coordinate along a centerline at a given distance from the start.
 * Returns null if the centerline is too short.
 */
export function interpolateAlongCenterline(
  centerline: [number, number][],
  distanceFromStartFeet: number
): [number, number] | null {
  if (centerline.length < 2) return null;
  if (distanceFromStartFeet <= 0) return centerline[0];

  let traversed = 0;
  for (let i = 1; i < centerline.length; i++) {
    const segLen = distanceFeet(centerline[i - 1], centerline[i]);
    if (traversed + segLen >= distanceFromStartFeet) {
      const remainder = distanceFromStartFeet - traversed;
      const t = segLen === 0 ? 0 : remainder / segLen;
      const lng = centerline[i - 1][0] + (centerline[i][0] - centerline[i - 1][0]) * t;
      const lat = centerline[i - 1][1] + (centerline[i][1] - centerline[i - 1][1]) * t;
      return [lng, lat];
    }
    traversed += segLen;
  }
  return centerline[centerline.length - 1];
}

/**
 * Convert a station + offset to a lat/lng coordinate by interpolating along the centerline
 * and applying a perpendicular offset.
 *
 * @param station - distance along corridor from start (in corridor.linearUnit)
 * @param offsetFeet - perpendicular offset in feet (positive = right of travel direction)
 * @param corridor - corridor geometry
 */
export function stationToCoordinate(
  station: number,
  offsetFeet: number,
  corridor: CorridorGeometry
): [number, number] | null {
  if (!corridor.centerline || corridor.centerline.length < 2) return null;
  const distanceFromStart =
    corridor.linearUnit === 'miles' ? station * 5280 : station;

  const base = interpolateAlongCenterline(corridor.centerline, distanceFromStart);
  if (!base) return null;
  if (!offsetFeet) return base;

  // Find the segment direction at this point so we can apply a perpendicular offset.
  let traversed = 0;
  let dirVec: [number, number] = [0, 0];
  for (let i = 1; i < corridor.centerline.length; i++) {
    const segLen = distanceFeet(corridor.centerline[i - 1], corridor.centerline[i]);
    if (traversed + segLen >= distanceFromStart) {
      dirVec = [
        corridor.centerline[i][0] - corridor.centerline[i - 1][0],
        corridor.centerline[i][1] - corridor.centerline[i - 1][1],
      ];
      break;
    }
    traversed += segLen;
  }

  // Approx degrees per foot at this latitude
  const lat = base[1];
  const ftPerDegLat = 364000;
  const ftPerDegLng = 364000 * Math.cos((lat * Math.PI) / 180);

  // Convert direction vector to feet, then perpendicular (right = +90° clockwise)
  const dxFt = dirVec[0] * ftPerDegLng;
  const dyFt = dirVec[1] * ftPerDegLat;
  const len = Math.sqrt(dxFt * dxFt + dyFt * dyFt);
  if (len === 0) return base;
  const perpFt: [number, number] = [dyFt / len, -dxFt / len]; // rotate -90°

  return [
    base[0] + (perpFt[0] * offsetFeet) / ftPerDegLng,
    base[1] + (perpFt[1] * offsetFeet) / ftPerDegLat,
  ];
}

/**
 * Calculate the length of a segment in feet from its station range.
 */
export function calculateSegmentLength(segment: ProjectSegment, unit: 'feet' | 'miles' = 'feet'): number {
  const lengthInUnit = segment.endStation - segment.startStation;
  return unit === 'miles' ? lengthInUnit * 5280 : lengthInUnit;
}

/**
 * Validate that a station number is within the corridor's total length.
 */
export function isStationInRange(station: number, corridor: CorridorGeometry): boolean {
  return station >= 0 && station <= corridor.totalLength;
}
