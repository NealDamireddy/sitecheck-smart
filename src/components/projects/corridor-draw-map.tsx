'use client';

import { useCallback, useMemo } from 'react';
import Map, {
  Marker,
  Source,
  Layer,
  NavigationControl,
  type MapMouseEvent,
} from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, DEFAULT_MAP_STYLE } from '@/lib/mapbox-config';
import { centerlineLengthFeet } from '@/lib/format';
import { Trash2, Undo2 } from 'lucide-react';

interface CorridorDrawMapProps {
  centerline: [number, number][];
  onChange: (centerline: [number, number][]) => void;
  initialView?: { longitude: number; latitude: number; zoom: number };
}

/**
 * Click-to-draw map for sketching a corridor centerline.
 *
 * - Click anywhere to add a vertex.
 * - Drag a vertex marker to move it.
 * - "Undo" removes the last vertex.
 * - "Clear" wipes the centerline.
 */
export function CorridorDrawMap({
  centerline,
  onChange,
  initialView = { longitude: -119.78, latitude: 36.84, zoom: 11 },
}: CorridorDrawMapProps) {
  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      const next: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      onChange([...centerline, next]);
    },
    [centerline, onChange]
  );

  const handleVertexDrag = useCallback(
    (idx: number, lng: number, lat: number) => {
      const next = [...centerline];
      next[idx] = [lng, lat];
      onChange(next);
    },
    [centerline, onChange]
  );

  const handleUndo = () => {
    if (centerline.length === 0) return;
    onChange(centerline.slice(0, -1));
  };

  const handleClear = () => {
    onChange([]);
  };

  const lineGeoJSON = useMemo(() => {
    if (centerline.length < 2) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: centerline },
    };
  }, [centerline]);

  const lengthFeet = useMemo(() => centerlineLengthFeet(centerline), [centerline]);
  const lengthMiles = (lengthFeet / 5280).toFixed(2);

  return (
    <div className="relative rounded-lg border border-border overflow-hidden">
      <div className="border-b border-border bg-surface px-4 py-2.5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium">
            {centerline.length === 0
              ? 'Click on the map to add the first centerline vertex'
              : `${centerline.length} vertices · ${lengthMiles} mi (${Math.round(lengthFeet).toLocaleString()} ft)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={centerline.length === 0}
            className="inline-flex items-center gap-1 rounded border border-border bg-elevated px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Undo2 className="h-3 w-3" />
            Undo
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={centerline.length === 0}
            className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/20 disabled:opacity-40"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        </div>
      </div>
      <div className="h-[450px]">
        <Map
          initialViewState={initialView}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={DEFAULT_MAP_STYLE}
          style={{ width: '100%', height: '100%' }}
          onClick={handleClick}
          cursor="crosshair"
        >
          <NavigationControl position="top-right" />

          {lineGeoJSON && (
            <Source id="draw-centerline" type="geojson" data={lineGeoJSON}>
              <Layer
                id="draw-centerline-line"
                type="line"
                paint={{
                  'line-color': '#fbbf24',
                  'line-width': 3,
                  'line-opacity': 0.9,
                }}
              />
            </Source>
          )}

          {centerline.map((pt, idx) => (
            <Marker
              key={idx}
              longitude={pt[0]}
              latitude={pt[1]}
              anchor="center"
              draggable
              onDragEnd={(e) => handleVertexDrag(idx, e.lngLat.lng, e.lngLat.lat)}
            >
              <div
                className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-amber-400 bg-black text-[9px] font-bold text-amber-300 cursor-grab active:cursor-grabbing"
                onClick={(e) => e.stopPropagation()}
              >
                {idx + 1}
              </div>
            </Marker>
          ))}
        </Map>
      </div>
    </div>
  );
}
