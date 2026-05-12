/**
 * Shared flight path generation utilities.
 * Used by both the server-side generate-mission API and the client-side route editor.
 */

import { generateLinearFlightPath } from './linear-path';
import type { ProjectType } from '@/types/project';

export interface PathCheckpoint {
  id: string;
  name: string;
  bmpType: string;
  lat: number;
  lng: number;
  linearRef?: { station: number; offset: number; segmentId?: string };
}

function distance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dlat = a.lat - b.lat;
  const dlng = a.lng - b.lng;
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

/**
 * Order checkpoints using nearest-neighbor TSP heuristic.
 * Starts from the northernmost checkpoint and greedily visits the nearest unvisited.
 */
export function orderCheckpoints<T extends { lat: number; lng: number }>(checkpoints: T[]): T[] {
  if (checkpoints.length <= 1) return [...checkpoints];

  const ordered: T[] = [];
  const remaining = [...checkpoints];

  // Start from the northernmost checkpoint
  remaining.sort((a, b) => b.lat - a.lat);
  ordered.push(remaining.shift()!);

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = distance(last, remaining[i]);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    ordered.push(remaining.splice(nearestIdx, 1)[0]);
  }

  return ordered;
}

/**
 * Generate intermediate flight path points between waypoints.
 * Creates smooth curves with perpendicular offsets for natural-looking paths.
 */
export function generateFlightPath(
  orderedCheckpoints: { lat: number; lng: number }[],
  siteCenter: { lat: number; lng: number }
): [number, number][] {
  const path: [number, number][] = [];

  // Launch from site center
  path.push([siteCenter.lng, siteCenter.lat]);

  // Add path to first checkpoint with intermediates
  if (orderedCheckpoints.length > 0) {
    const first = orderedCheckpoints[0];
    const midLng = (siteCenter.lng + first.lng) / 2;
    const midLat = (siteCenter.lat + first.lat) / 2;
    path.push([midLng, midLat]);
    path.push([first.lng, first.lat]);
  }

  // Connect all checkpoints with intermediate points
  for (let i = 0; i < orderedCheckpoints.length - 1; i++) {
    const from = orderedCheckpoints[i];
    const to = orderedCheckpoints[i + 1];

    // Add 3 intermediate points with slight curve offsets
    const steps = 3;
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1);
      const lng = from.lng + (to.lng - from.lng) * t;
      const lat = from.lat + (to.lat - from.lat) * t;
      // Perpendicular offset for natural-looking paths
      const perpOffset = Math.sin(t * Math.PI) * 0.0002 * (i % 2 === 0 ? 1 : -1);
      path.push([lng + perpOffset, lat - perpOffset]);
    }

    path.push([to.lng, to.lat]);
  }

  // Return to launch site
  if (orderedCheckpoints.length > 0) {
    const last = orderedCheckpoints[orderedCheckpoints.length - 1];
    const midLng = (siteCenter.lng + last.lng) / 2;
    const midLat = (siteCenter.lat + last.lat) / 2;
    path.push([midLng, midLat]);
  }
  path.push([siteCenter.lng, siteCenter.lat]);

  return path;
}

/**
 * Smart dispatch: chooses bounded-site or linear flight path generation
 * based on the project type and available corridor geometry.
 */
export function generateSmartFlightPath(
  checkpoints: PathCheckpoint[],
  siteCenter: { lat: number; lng: number },
  options?: {
    projectType?: ProjectType;
    centerline?: [number, number][];
  }
): [number, number][] {
  if (options?.projectType === 'linear' && options.centerline && options.centerline.length >= 2) {
    return generateLinearFlightPath(checkpoints, options.centerline, siteCenter);
  }

  // Default: bounded-site TSP ordering + flight path with return-to-launch
  const ordered = orderCheckpoints(checkpoints);
  return generateFlightPath(ordered, siteCenter);
}
