'use client';

import { useCallback, useMemo, useState } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, DEFAULT_MAP_STYLE } from '@/lib/mapbox-config';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { useProjectStore } from '@/stores/project-store';
import { fitBoundsFromPoints } from '@/lib/map-utils';
import { CorridorLayer } from '@/components/map/corridor-layer';
import { GeofenceLayer } from '@/components/map/geofence-layer';
import { NoFlyZonesLayer } from '@/components/map/nofly-zones-layer';
import { useAirspace } from '@/hooks/use-airspace';
import { BMP_CATEGORY_COLORS } from '@/lib/constants';
import { useAppMode } from '@/hooks/use-app-mode';
import { cn } from '@/lib/utils';
import type { Waypoint } from '@/types/drone';
import type { MarkerDragEvent } from 'react-map-gl/mapbox';

interface RouteEditorMapProps {
  waypoints: Waypoint[];
  flightPath: [number, number][];
  onWaypointDrag: (waypointNumber: number, lat: number, lng: number) => void;
  onWaypointToggle: (waypointNumber: number) => void;
  selectedWaypoint: number | null;
  onSelectWaypoint: (num: number | null) => void;
  /** Waypoint numbers currently in violation (drawn with a red warning ring) */
  violatingWaypointNumbers?: number[];
}

export function RouteEditorMap({
  waypoints,
  flightPath,
  onWaypointDrag,
  selectedWaypoint,
  onSelectWaypoint,
  violatingWaypointNumbers,
}: RouteEditorMapProps) {
  const { isApp } = useAppMode();
  const checkpoints = useCheckpointStore((s) => s.checkpoints);
  const project = useProjectStore((s) => s.currentProject());
  const { geofence, noFlyZones } = useAirspace(project?.id);
  const [hoveredWp, setHoveredWp] = useState<number | null>(null);
  const violatingSet = useMemo(
    () => new Set(violatingWaypointNumbers ?? []),
    [violatingWaypointNumbers]
  );

  const checkpointMap = useMemo(() => {
    const m: Record<string, (typeof checkpoints)[0]> = {};
    checkpoints.forEach((c) => { m[c.id] = c; });
    return m;
  }, [checkpoints]);

  // Build GeoJSON for the flight path polyline
  const pathGeoJson = useMemo(
    () => ({
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: flightPath,
      },
      properties: {},
    }),
    [flightPath]
  );

  const handleDragEnd = useCallback(
    (wpNumber: number, e: MarkerDragEvent) => {
      onWaypointDrag(wpNumber, e.lngLat.lat, e.lngLat.lng);
    },
    [onWaypointDrag]
  );

  const handleMapClick = useCallback(() => {
    onSelectWaypoint(null);
  }, [onSelectWaypoint]);

  return (
    <div
      className={cn(
        'rounded-lg border border-border overflow-hidden',
        isApp ? 'h-[300px]' : 'h-[450px]'
      )}
    >
      <Map
        initialViewState={
          waypoints.length > 0
            ? fitBoundsFromPoints(waypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng })), { minZoom: 8 })
            : {
                longitude: project?.coordinates.lng ?? -119.4161,
                latitude: project?.coordinates.lat ?? 36.7801,
                zoom: project?.projectType === 'linear' ? 11 : 16,
                pitch: 0,
                bearing: 0,
              }
        }
        mapStyle={DEFAULT_MAP_STYLE}
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        onClick={handleMapClick}
      >
        {project?.corridor?.centerline && (
          <CorridorLayer
            centerline={project.corridor.centerline}
            widthFeet={project.corridor.corridorWidthFeet}
          />
        )}

        {/* Block 3 — Airspace overlays */}
        <GeofenceLayer geofence={geofence} />
        <NoFlyZonesLayer zones={noFlyZones} />

        {/* Flight path line */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Source id="flight-path" type="geojson" data={pathGeoJson as any}>
          <Layer
            id="flight-path-line"
            type="line"
            paint={{
              'line-color': '#3B82F6',
              'line-width': 2,
              'line-dasharray': [2, 2],
            }}
          />
        </Source>

        {/* Waypoint markers */}
        {waypoints.map((wp) => {
          const checkpoint = checkpointMap[wp.checkpointId];
          const color = checkpoint
            ? BMP_CATEGORY_COLORS[checkpoint.bmpType]
            : '#6B7280';
          const isSelected = selectedWaypoint === wp.number;
          const isHovered = hoveredWp === wp.number;
          const isDisabled = wp.enabled === false;
          const isViolating = violatingSet.has(wp.number);

          return (
            <Marker
              key={wp.number}
              longitude={wp.lng}
              latitude={wp.lat}
              anchor="center"
              draggable={!isDisabled}
              onDragEnd={(e) => handleDragEnd(wp.number, e)}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSelectWaypoint(isSelected ? null : wp.number);
              }}
            >
              <div
                className="relative cursor-pointer"
                onMouseEnter={() => setHoveredWp(wp.number)}
                onMouseLeave={() => setHoveredWp(null)}
              >
                {/* Selected pulsing ring */}
                {isSelected && (
                  <div
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-ping"
                    style={{
                      width: 28,
                      height: 28,
                      backgroundColor: 'rgba(59, 130, 246, 0.3)',
                    }}
                  />
                )}

                {/* Selection ring (static) */}
                {isSelected && (
                  <div
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      width: 26,
                      height: 26,
                      border: '2px solid #3B82F6',
                      boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)',
                    }}
                  />
                )}

                {/* Block 3 — Airspace violation ring */}
                {isViolating && (
                  <>
                    <div
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-ping pointer-events-none"
                      style={{
                        width: 32,
                        height: 32,
                        backgroundColor: 'rgba(239, 68, 68, 0.35)',
                      }}
                    />
                    <div
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                      style={{
                        width: 30,
                        height: 30,
                        border: '2px solid #ef4444',
                        boxShadow: '0 0 10px rgba(239, 68, 68, 0.6)',
                      }}
                    />
                  </>
                )}

                {/* Marker circle */}
                <div
                  className={cn(
                    'flex items-center justify-center rounded-full border-2 text-[9px] font-bold text-white',
                    isDisabled
                      ? 'border-dashed border-gray-500'
                      : isViolating
                        ? 'border-red-300'
                        : 'border-black/40'
                  )}
                  style={{
                    width: 18,
                    height: 18,
                    backgroundColor: isDisabled ? '#6B7280' : color,
                    boxShadow: isSelected
                      ? `0 0 10px ${color}80`
                      : isViolating
                        ? '0 0 10px rgba(239, 68, 68, 0.8)'
                        : '0 1px 3px rgba(0,0,0,0.4)',
                  }}
                >
                  {wp.number}
                </div>

                {/* Tooltip on hover */}
                {isHovered && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[10px] text-white font-medium pointer-events-none z-10">
                    {checkpoint?.name ?? `Waypoint ${wp.number}`}
                    {isDisabled && ' (disabled)'}
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black/80" />
                  </div>
                )}
              </div>
            </Marker>
          );
        })}
      </Map>
    </div>
  );
}
