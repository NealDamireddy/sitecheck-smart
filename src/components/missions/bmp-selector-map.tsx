'use client';

import { useState, useCallback } from 'react';
import Map, { Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Checkpoint } from '@/types/checkpoint';
import { BMP_CATEGORY_COLORS } from '@/lib/constants';
import { MAPBOX_TOKEN, DEFAULT_MAP_STYLE } from '@/lib/mapbox-config';
import { fitBoundsFromPoints } from '@/lib/map-utils';
import { useProjectStore } from '@/stores/project-store';
import { CorridorLayer } from '@/components/map/corridor-layer';
import { GeofenceLayer } from '@/components/map/geofence-layer';
import { NoFlyZonesLayer } from '@/components/map/nofly-zones-layer';
import { useAirspace } from '@/hooks/use-airspace';

interface BmpSelectorMapProps {
  checkpoints: Checkpoint[];
  selectedIds: Set<string>;
  onToggle: (checkpointId: string) => void;
}

export function BmpSelectorMap({
  checkpoints,
  selectedIds,
  onToggle,
}: BmpSelectorMapProps) {
  const project = useProjectStore((s) => s.currentProject());
  const { geofence, noFlyZones } = useAirspace(project?.id);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string>('grab');

  const onMarkerEnter = useCallback((id: string) => {
    setHoveredId(id);
    setCursor('pointer');
  }, []);

  const onMarkerLeave = useCallback(() => {
    setHoveredId(null);
    setCursor('grab');
  }, []);

  return (
    <div className="h-[300px] rounded-lg border border-border overflow-hidden">
      <Map
        initialViewState={
          checkpoints.length > 0
            ? fitBoundsFromPoints(
                checkpoints.map((cp) => ({ lat: cp.lat ?? cp.location.lat, lng: cp.lng ?? cp.location.lng })),
                { minZoom: 8 }
              )
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
        cursor={cursor}
        style={{ width: '100%', height: '100%' }}
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

        {checkpoints.map((cp) => {
          const lng = cp.lng ?? cp.location.lng;
          const lat = cp.lat ?? cp.location.lat;
          const isSelected = selectedIds.has(cp.id);
          const isHovered = hoveredId === cp.id;
          const color = BMP_CATEGORY_COLORS[cp.bmpType];
          const dotSize = isSelected ? 14 : 10;

          return (
            <Marker
              key={cp.id}
              longitude={lng}
              latitude={lat}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onToggle(cp.id);
              }}
            >
              <div
                className="relative cursor-pointer"
                onMouseEnter={() => onMarkerEnter(cp.id)}
                onMouseLeave={onMarkerLeave}
              >
                {/* Selection ring */}
                {isSelected && (
                  <div
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      width: dotSize + 8,
                      height: dotSize + 8,
                      border: '2px solid #3B82F6',
                      boxShadow: '0 0 6px rgba(59, 130, 246, 0.5)',
                    }}
                  />
                )}

                {/* Marker dot */}
                <div
                  className="rounded-full border-2 border-black/40"
                  style={{
                    width: dotSize,
                    height: dotSize,
                    backgroundColor: color,
                    transition: 'width 150ms, height 150ms',
                    boxShadow: isSelected
                      ? `0 0 8px ${color}80`
                      : '0 1px 2px rgba(0,0,0,0.4)',
                  }}
                />

                {/* Tooltip on hover */}
                {isHovered && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[10px] text-white font-medium pointer-events-none z-10">
                    {cp.name}
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
