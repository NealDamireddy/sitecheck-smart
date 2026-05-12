'use client';

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';
import type { Geofence } from '@/types/geofence';

interface GeofenceLayerProps {
  /** The project geofence to render. If undefined, the layer renders nothing. */
  geofence: Geofence | undefined | null;
  /** Override fill color (defaults to cyan) */
  fillColor?: string;
  /** Override outline color */
  lineColor?: string;
  /** Override fill opacity */
  fillOpacity?: number;
}

/**
 * Geofence map layer.
 *
 * Renders a single project-level operating boundary as a low-opacity fill
 * with a dashed outline. The polygon is the legal/operational area within
 * which drone missions must remain — flight paths leaving this area will
 * be rejected by `/api/generate-mission` and `/api/missions` POST.
 *
 * Source IDs are namespaced (`geofence-*`) to avoid collisions with the
 * other map layers (row, no-fly zones, checkpoints, etc).
 */
export function GeofenceLayer({
  geofence,
  fillColor = '#22d3ee',
  lineColor = '#22d3ee',
  fillOpacity = 0.05,
}: GeofenceLayerProps) {
  const featureCollection = useMemo(() => {
    if (!geofence || !Array.isArray(geofence.polygon) || geofence.polygon.length < 3) {
      return null;
    }
    // Close the ring if it isn't already closed
    const ring: [number, number][] = [...geofence.polygon];
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push(first);
    }
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {
            id: geofence.id,
            name: geofence.name,
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [ring],
          },
        },
      ],
    };
  }, [geofence]);

  if (!featureCollection) return null;

  return (
    <Source id="geofence" type="geojson" data={featureCollection}>
      <Layer
        id="geofence-fill"
        type="fill"
        paint={{
          'fill-color': fillColor,
          'fill-opacity': fillOpacity,
        }}
      />
      <Layer
        id="geofence-outline"
        type="line"
        paint={{
          'line-color': lineColor,
          'line-width': 1.5,
          'line-dasharray': [3, 2],
          'line-opacity': 0.8,
        }}
      />
    </Source>
  );
}
