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
export function useAirspace(projectId: string | undefined): UseAirspaceResult {
  const [geofence, setGeofence] = useState<Geofence | undefined>(undefined);
  const [noFlyZones, setNoFlyZones] = useState<NoFlyZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setGeofence(undefined);
      setNoFlyZones([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

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
        setGeofence(Array.isArray(fences) && fences.length > 0 ? fences[0] : undefined);
        setNoFlyZones(Array.isArray(zones) ? zones : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load airspace');
        setGeofence(undefined);
        setNoFlyZones([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { geofence, noFlyZones, loading, error };
}
