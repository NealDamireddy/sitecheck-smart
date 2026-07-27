'use client';

import { useEffect, useState } from 'react';
import type { Geofence } from '@/types/geofence';
import type { NoFlyZone } from '@/types/nofly-zone';

interface UseAirspaceResult {
  geofence: Geofence | undefined;
  noFlyZones: NoFlyZone[];
  loading: boolean;
  error: string | null;
}

/**
 * Client-side hook that fetches the project's geofence + active no-fly zones
 * from `/api/geofences` and `/api/nofly-zones`.
 *
 * This is a thin wrapper around `fetch` so map components can render the new
 * `<GeofenceLayer>` and `<NoFlyZonesLayer>` without needing a Zustand store
 * yet (Phase 5 will consolidate into stores).
 *
 * Returns the *first* geofence for the project (single-fence model for now)
 * and *all active* zones.
 */
interface AirspaceData {
  /** The project this data was fetched for — stale data is ignored. */
  projectId: string;
  geofence: Geofence | undefined;
  noFlyZones: NoFlyZone[];
  error: string | null;
}

export function useAirspace(projectId: string | undefined): UseAirspaceResult {
  // All state is written asynchronously (fetch settle) and tagged with
  // the project it belongs to; everything exposed is derived from the
  // tag. No synchronous resets in the effect, no stale flash on switch.
  const [data, setData] = useState<AirspaceData | null>(null);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    Promise.all([
      fetch(`/api/geofences?projectId=${encodeURIComponent(projectId)}`).then((r) =>
        r.ok ? (r.json() as Promise<Geofence[]>) : []
      ),
      fetch(
        `/api/nofly-zones?projectId=${encodeURIComponent(projectId)}&active=true`
      ).then((r) => (r.ok ? (r.json() as Promise<NoFlyZone[]>) : [])),
    ])
      .then(([fences, zones]) => {
        if (cancelled) return;
        setData({
          projectId,
          geofence:
            Array.isArray(fences) && fences.length > 0 ? fences[0] : undefined,
          noFlyZones: Array.isArray(zones) ? zones : [],
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setData({
          projectId,
          geofence: undefined,
          noFlyZones: [],
          error: err instanceof Error ? err.message : 'Failed to load airspace',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const current = projectId && data?.projectId === projectId ? data : null;
  return {
    geofence: current?.geofence,
    noFlyZones: current?.noFlyZones ?? [],
    loading: Boolean(projectId) && current === null,
    error: current?.error ?? null,
  };
}
