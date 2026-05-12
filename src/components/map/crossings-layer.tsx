'use client';

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';
import type { Crossing } from '@/types/crossing';
import { CROSSING_TYPE_COLORS } from '@/types/crossing';

interface CrossingsLayerProps {
  crossings: Crossing[];
  /** Optional click handler — fires with the crossing id */
  onCrossingClick?: (id: string) => void;
}

/**
 * Mapbox layer that renders crossing markers along a corridor.
 *
 * Each crossing becomes a circle whose color is determined by the crossing type.
 * A label layer shows the crossing name above the marker.
 */
export function CrossingsLayer({ crossings }: CrossingsLayerProps) {
  const geojson = useMemo(() => {
    const features = crossings
      .filter((c) => c.location && c.location.length === 2)
      .map((c) => ({
        type: 'Feature' as const,
        properties: {
          id: c.id,
          name: c.name,
          crossingType: c.crossingType,
          stationLabel: c.stationLabel ?? '',
          status: c.status,
          color: CROSSING_TYPE_COLORS[c.crossingType] ?? '#9CA3AF',
        },
        geometry: {
          type: 'Point' as const,
          coordinates: c.location as [number, number],
        },
      }));

    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }, [crossings]);

  if (geojson.features.length === 0) return null;

  return (
    <Source id="crossings" type="geojson" data={geojson}>
      {/* Outer ring (white halo) */}
      <Layer
        id="crossings-halo"
        type="circle"
        paint={{
          'circle-radius': 10,
          'circle-color': '#ffffff',
          'circle-opacity': 0.85,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        }}
      />
      {/* Colored marker */}
      <Layer
        id="crossings-marker"
        type="circle"
        paint={{
          'circle-radius': 7,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#0a0a0a',
          'circle-stroke-width': 1.5,
        }}
      />
      {/* Label */}
      <Layer
        id="crossings-label"
        type="symbol"
        layout={{
          'text-field': ['concat', ['get', 'name'], '  ', ['get', 'stationLabel']],
          'text-size': 11,
          'text-offset': [0, -1.5],
          'text-anchor': 'bottom',
          'text-allow-overlap': false,
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 1.5,
        }}
      />
    </Source>
  );
}
