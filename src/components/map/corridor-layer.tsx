'use client';

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';

interface CorridorLayerProps {
  /** Centerline coordinates as [lng, lat][] */
  centerline: [number, number][];
  /** Corridor width in feet */
  widthFeet: number;
  /** Centerline color */
  lineColor?: string;
  /** Buffer fill color */
  fillColor?: string;
  /** Fill opacity */
  fillOpacity?: number;
}

/**
 * Compute a perpendicular offset point from a line segment.
 * Returns [lng, lat] offset by `distanceFeet` perpendicular to the segment direction.
 * Positive distance = left side, negative = right side.
 */
function perpendicularOffset(
  point: [number, number],
  bearing: number,
  distanceFeet: number
): [number, number] {
  // Convert feet to approximate degrees (1° lat ≈ 364,000 ft at mid-latitudes)
  const distDegLat = distanceFeet / 364000;
  const latRad = (point[1] * Math.PI) / 180;
  const distDegLng = distanceFeet / (364000 * Math.cos(latRad));

  // Perpendicular bearing (90° to the left of travel direction)
  const perpBearing = bearing - Math.PI / 2;

  return [
    point[0] + distDegLng * Math.sin(perpBearing),
    point[1] + distDegLat * Math.cos(perpBearing),
  ];
}

/**
 * Compute bearing (radians, clockwise from north) between two [lng, lat] points.
 */
function computeBearing(from: [number, number], to: [number, number]): number {
  const dLng = ((to[0] - from[0]) * Math.PI) / 180;
  const lat1 = (from[1] * Math.PI) / 180;
  const lat2 = (to[1] * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return Math.atan2(y, x);
}

export function CorridorLayer({
  centerline,
  widthFeet,
  lineColor = '#06b6d4',
  fillColor = '#06b6d4',
  fillOpacity = 0.12,
}: CorridorLayerProps) {
  const halfWidth = widthFeet / 2;

  /** Buffer polygon from centerline offset */
  const bufferGeoJSON = useMemo(() => {
    if (centerline.length < 2) return null;

    const leftSide: [number, number][] = [];
    const rightSide: [number, number][] = [];

    for (let i = 0; i < centerline.length; i++) {
      let bearing: number;
      if (i === 0) {
        bearing = computeBearing(centerline[0], centerline[1]);
      } else if (i === centerline.length - 1) {
        bearing = computeBearing(centerline[i - 1], centerline[i]);
      } else {
        // Average of incoming and outgoing bearings for smoother corners
        const b1 = computeBearing(centerline[i - 1], centerline[i]);
        const b2 = computeBearing(centerline[i], centerline[i + 1]);
        bearing = Math.atan2(
          (Math.sin(b1) + Math.sin(b2)) / 2,
          (Math.cos(b1) + Math.cos(b2)) / 2
        );
      }

      leftSide.push(perpendicularOffset(centerline[i], bearing, halfWidth));
      rightSide.push(perpendicularOffset(centerline[i], bearing, -halfWidth));
    }

    // Create polygon: left side forward, right side reversed, close the ring
    const ring = [...leftSide, ...rightSide.reverse(), leftSide[0]];

    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [ring],
      },
    };
  }, [centerline, halfWidth]);

  /** Centerline GeoJSON */
  const centerlineGeoJSON = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: centerline,
      },
    }),
    [centerline]
  );

  if (centerline.length < 2) return null;

  return (
    <>
      {/* Buffer fill */}
      {bufferGeoJSON && (
        <Source id="corridor-buffer" type="geojson" data={bufferGeoJSON}>
          <Layer
            id="corridor-buffer-fill"
            type="fill"
            paint={{
              'fill-color': fillColor,
              'fill-opacity': fillOpacity,
            }}
          />
          <Layer
            id="corridor-buffer-outline"
            type="line"
            paint={{
              'line-color': fillColor,
              'line-opacity': 0.3,
              'line-width': 1,
              'line-dasharray': [4, 2],
            }}
          />
        </Source>
      )}

      {/* Centerline */}
      <Source id="corridor-centerline" type="geojson" data={centerlineGeoJSON}>
        <Layer
          id="corridor-centerline-line"
          type="line"
          paint={{
            'line-color': lineColor,
            'line-width': 2,
            'line-dasharray': [6, 3],
            'line-opacity': 0.7,
          }}
        />
      </Source>
    </>
  );
}
