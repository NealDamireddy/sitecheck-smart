'use client';

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';

interface RowLayerProps {
  /** Centerline used to derive ROW boundaries when explicit boundaries are not provided */
  centerline: [number, number][];
  /** Explicit left ROW boundary (overrides auto-generation) */
  leftBoundary?: [number, number][];
  /** Explicit right ROW boundary (overrides auto-generation) */
  rightBoundary?: [number, number][];
  /** ROW total width in feet (used to auto-derive boundaries from centerline) */
  widthFeet: number;
  /** Boundary line color */
  lineColor?: string;
  /** Easement polygon fill color */
  fillColor?: string;
  /** Easement polygon fill opacity */
  fillOpacity?: number;
}

/**
 * Compute a perpendicular offset point from a line segment.
 * Positive distance = left side, negative = right side (relative to direction of travel).
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

function computeBearing(from: [number, number], to: [number, number]): number {
  const dLng = ((to[0] - from[0]) * Math.PI) / 180;
  const lat1 = (from[1] * Math.PI) / 180;
  const lat2 = (to[1] * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return Math.atan2(y, x);
}

/**
 * Right-of-Way layer.
 *
 * If explicit `leftBoundary` and `rightBoundary` are provided, those are rendered.
 * Otherwise, both boundaries are auto-generated from the centerline + widthFeet.
 *
 * The layer renders:
 *  - dashed left boundary line
 *  - dashed right boundary line
 *  - light easement polygon fill (the area enclosed by both boundaries)
 */
export function RowLayer({
  centerline,
  leftBoundary,
  rightBoundary,
  widthFeet,
  lineColor = '#fbbf24',
  fillColor = '#fbbf24',
  fillOpacity = 0.05,
}: RowLayerProps) {
  const halfWidth = widthFeet / 2;

  const { left, right } = useMemo(() => {
    if (leftBoundary && leftBoundary.length >= 2 && rightBoundary && rightBoundary.length >= 2) {
      return { left: leftBoundary, right: rightBoundary };
    }
    if (centerline.length < 2) return { left: [], right: [] };

    const leftSide: [number, number][] = [];
    const rightSide: [number, number][] = [];

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
      leftSide.push(perpendicularOffset(centerline[i], bearing, halfWidth));
      rightSide.push(perpendicularOffset(centerline[i], bearing, -halfWidth));
    }
    return { left: leftSide, right: rightSide };
  }, [centerline, halfWidth, leftBoundary, rightBoundary]);

  const polygonGeoJSON = useMemo(() => {
    if (left.length < 2 || right.length < 2) return null;
    const ring = [...left, ...[...right].reverse(), left[0]];
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [ring],
      },
    };
  }, [left, right]);

  const leftLineGeoJSON = useMemo(
    () =>
      left.length >= 2
        ? {
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'LineString' as const, coordinates: left },
          }
        : null,
    [left]
  );

  const rightLineGeoJSON = useMemo(
    () =>
      right.length >= 2
        ? {
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'LineString' as const, coordinates: right },
          }
        : null,
    [right]
  );

  if (!polygonGeoJSON) return null;

  return (
    <>
      {/* Easement fill (low opacity) */}
      <Source id="row-easement" type="geojson" data={polygonGeoJSON}>
        <Layer
          id="row-easement-fill"
          type="fill"
          paint={{
            'fill-color': fillColor,
            'fill-opacity': fillOpacity,
          }}
        />
      </Source>

      {/* Left boundary */}
      {leftLineGeoJSON && (
        <Source id="row-left" type="geojson" data={leftLineGeoJSON}>
          <Layer
            id="row-left-line"
            type="line"
            paint={{
              'line-color': lineColor,
              'line-width': 1.5,
              'line-dasharray': [2, 2],
              'line-opacity': 0.7,
            }}
          />
        </Source>
      )}

      {/* Right boundary */}
      {rightLineGeoJSON && (
        <Source id="row-right" type="geojson" data={rightLineGeoJSON}>
          <Layer
            id="row-right-line"
            type="line"
            paint={{
              'line-color': lineColor,
              'line-width': 1.5,
              'line-dasharray': [2, 2],
              'line-opacity': 0.7,
            }}
          />
        </Source>
      )}
    </>
  );
}
