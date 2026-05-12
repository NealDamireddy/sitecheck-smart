'use client';

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';
import type { NoFlyZone } from '@/types/nofly-zone';
import { NOFLY_CATEGORY_COLORS } from '@/types/nofly-zone';

interface NoFlyZonesLayerProps {
  /** All zones to render. Inactive zones are filtered out automatically. */
  zones: NoFlyZone[] | undefined | null;
  /** If false, hide labels. Defaults to true. */
  showLabels?: boolean;
  /** Override fill opacity (defaults to 0.18) */
  fillOpacity?: number;
}

/**
 * No-Fly Zones map layer.
 *
 * Renders all *active* no-fly zones for a project as colored polygons with
 * category-driven fills. Each zone gets a fill, an outline, and (optionally)
 * a label centered on the polygon centroid.
 *
 * Colors are driven by `NOFLY_CATEGORY_COLORS` so the visual category mapping
 * stays consistent with any future legend / CRUD UI.
 *
 * Inactive zones are skipped client-side so toggling `active` in the future
 * CRUD page produces an immediate visual change.
 */
export function NoFlyZonesLayer({
  zones,
  showLabels = true,
  fillOpacity = 0.18,
}: NoFlyZonesLayerProps) {
  const polygonCollection = useMemo(() => {
    if (!zones || zones.length === 0) return null;
    const features = zones
      .filter((z) => z.active && Array.isArray(z.polygon) && z.polygon.length >= 3)
      .map((z) => {
        const ring: [number, number][] = [...z.polygon];
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          ring.push(first);
        }
        return {
          type: 'Feature' as const,
          properties: {
            id: z.id,
            name: z.name,
            category: z.category,
            color: NOFLY_CATEGORY_COLORS[z.category] ?? '#ef4444',
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [ring],
          },
        };
      });
    if (features.length === 0) return null;
    return { type: 'FeatureCollection' as const, features };
  }, [zones]);

  const labelCollection = useMemo(() => {
    if (!polygonCollection || !showLabels) return null;
    const features = polygonCollection.features.map((f) => {
      const ring = f.geometry.coordinates[0];
      // Simple centroid (average of ring vertices excluding the closing duplicate)
      const verts = ring.slice(0, -1);
      const sum = verts.reduce(
        (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
        { lng: 0, lat: 0 }
      );
      const centroid: [number, number] = [sum.lng / verts.length, sum.lat / verts.length];
      return {
        type: 'Feature' as const,
        properties: { name: f.properties.name },
        geometry: { type: 'Point' as const, coordinates: centroid },
      };
    });
    return { type: 'FeatureCollection' as const, features };
  }, [polygonCollection, showLabels]);

  if (!polygonCollection) return null;

  return (
    <>
      <Source id="nofly-zones" type="geojson" data={polygonCollection}>
        <Layer
          id="nofly-zones-fill"
          type="fill"
          paint={{
            'fill-color': ['get', 'color'] as unknown as string,
            'fill-opacity': fillOpacity,
          }}
        />
        <Layer
          id="nofly-zones-outline"
          type="line"
          paint={{
            'line-color': ['get', 'color'] as unknown as string,
            'line-width': 1.5,
            'line-opacity': 0.85,
          }}
        />
      </Source>

      {labelCollection && (
        <Source id="nofly-zones-labels" type="geojson" data={labelCollection}>
          <Layer
            id="nofly-zones-label"
            type="symbol"
            layout={{
              'text-field': ['get', 'name'] as unknown as string,
              'text-size': 10,
              'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
              'text-anchor': 'center',
              'text-allow-overlap': false,
            }}
            paint={{
              'text-color': '#fecaca',
              'text-halo-color': '#7f1d1d',
              'text-halo-width': 1.2,
              'text-opacity': 0.9,
            }}
          />
        </Source>
      )}
    </>
  );
}
