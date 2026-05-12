'use client';

import { useState, useCallback, useMemo } from 'react';
import Map, { Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin } from 'lucide-react';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { useEffect } from 'react';
import { STATUS_COLORS, BMP_CATEGORY_COLORS } from '@/lib/constants';
import { MAPBOX_TOKEN, DEFAULT_MAP_STYLE } from '@/lib/mapbox-config';
import { useProjectStore } from '@/stores/project-store';
import { fitBoundsFromPoints } from '@/lib/map-utils';
import { CorridorLayer } from '@/components/map/corridor-layer';

interface ExtractedMapCheckpoint {
  id: string;
  lat: number;
  lng: number;
  name: string;
  bmpType: string;
}

interface CheckpointMapPanelProps {
  selectedCheckpointId: string | null;
  onSelect: (id: string) => void;
  extractedCheckpoints?: ExtractedMapCheckpoint[];
}

export function CheckpointMapPanel({ selectedCheckpointId, onSelect, extractedCheckpoints }: CheckpointMapPanelProps) {
  const storeCheckpoints = useCheckpointStore((s) => s.checkpoints);
  const fetchCheckpoints = useCheckpointStore((s) => s.fetchCheckpoints);
  const project = useProjectStore((s) => s.currentProject());

  useEffect(() => {
    if (storeCheckpoints.length === 0) fetchCheckpoints();
  }, [storeCheckpoints.length, fetchCheckpoints]);

  const [cursor, setCursor] = useState<string>('grab');

  const onMouseEnter = useCallback(() => setCursor('pointer'), []);
  const onMouseLeave = useCallback(() => setCursor('grab'), []);

  const useExtracted = extractedCheckpoints && extractedCheckpoints.length > 0;

  // Compute view state that fits extracted or store checkpoints
  const viewState = useMemo(() => {
    const points = useExtracted
      ? extractedCheckpoints.map((cp) => ({ lat: cp.lat, lng: cp.lng }))
      : storeCheckpoints.length > 0
        ? storeCheckpoints.map((cp) => ({ lat: cp.lat ?? cp.location.lat, lng: cp.lng ?? cp.location.lng }))
        : null;

    if (points && points.length > 0) {
      return fitBoundsFromPoints(points, { minZoom: 8 });
    }

    // Fallback to project center
    return {
      longitude: project?.coordinates.lng ?? -119.4161,
      latitude: project?.coordinates.lat ?? 36.7801,
      zoom: project?.projectType === 'linear' ? 11 : 16,
      pitch: 0,
      bearing: 0,
    };
  }, [useExtracted, extractedCheckpoints, storeCheckpoints, project]);

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="border-b border-white/5 bg-[#141414] px-3 py-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs font-medium text-foreground">
            {project?.projectType === 'linear' ? 'Corridor Map' : 'Site Map'}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Click a pin to select a checkpoint
        </p>
      </div>

      {/* Map container */}
      <div className="relative flex-1">
        <Map
          initialViewState={viewState}
          mapStyle={DEFAULT_MAP_STYLE}
          mapboxAccessToken={MAPBOX_TOKEN}
          scrollZoom={false}
          cursor={cursor}
          style={{ width: '100%', height: '100%' }}
        >
          {project?.corridor?.centerline && (
            <CorridorLayer
              centerline={project.corridor.centerline}
              widthFeet={project.corridor.corridorWidthFeet}
            />
          )}
          {useExtracted
            ? extractedCheckpoints.map((cp) => {
                const isSelected = selectedCheckpointId === cp.id;
                const color = BMP_CATEGORY_COLORS[cp.bmpType as keyof typeof BMP_CATEGORY_COLORS] || '#F59E0B';

                return (
                  <Marker
                    key={cp.id}
                    longitude={cp.lng}
                    latitude={cp.lat}
                    anchor="center"
                    onClick={(e) => {
                      e.originalEvent.stopPropagation();
                      onSelect(cp.id);
                    }}
                  >
                    <div
                      className="relative cursor-pointer"
                      onMouseEnter={onMouseEnter}
                      onMouseLeave={onMouseLeave}
                    >
                      {/* Pulsing ring for selected */}
                      {isSelected && (
                        <div
                          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-ping"
                          style={{
                            width: 24,
                            height: 24,
                            backgroundColor: color,
                            opacity: 0.4,
                          }}
                        />
                      )}

                      {/* Marker circle */}
                      <div
                        className="rounded-full border-2 border-black/40"
                        style={{
                          width: isSelected ? 16 : 10,
                          height: isSelected ? 16 : 10,
                          backgroundColor: color,
                          transition: 'width 150ms, height 150ms',
                          boxShadow: isSelected
                            ? `0 0 8px ${color}80`
                            : '0 1px 3px rgba(0,0,0,0.4)',
                        }}
                      />

                      {/* Tooltip for selected */}
                      {isSelected && (
                        <div className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-[#1C1C1C] px-2 py-1 text-[10px] text-foreground shadow-lg border border-white/10 z-50">
                          {cp.id}: {cp.name}
                        </div>
                      )}
                    </div>
                  </Marker>
                );
              })
            : storeCheckpoints.map((cp) => {
                const isSelected = selectedCheckpointId === cp.id;
                const color = STATUS_COLORS[cp.status];

                return (
                  <Marker
                    key={cp.id}
                    longitude={cp.location.lng}
                    latitude={cp.location.lat}
                    anchor="center"
                    onClick={(e) => {
                      e.originalEvent.stopPropagation();
                      onSelect(cp.id);
                    }}
                  >
                    <div
                      className="relative cursor-pointer"
                      onMouseEnter={onMouseEnter}
                      onMouseLeave={onMouseLeave}
                    >
                      {/* Pulsing ring for selected */}
                      {isSelected && (
                        <div
                          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-ping"
                          style={{
                            width: 24,
                            height: 24,
                            backgroundColor: color,
                            opacity: 0.4,
                          }}
                        />
                      )}

                      {/* Marker circle */}
                      <div
                        className="rounded-full border-2 border-black/40"
                        style={{
                          width: isSelected ? 16 : 10,
                          height: isSelected ? 16 : 10,
                          backgroundColor: color,
                          transition: 'width 150ms, height 150ms',
                          boxShadow: isSelected
                            ? `0 0 8px ${color}80`
                            : '0 1px 3px rgba(0,0,0,0.4)',
                        }}
                      />

                      {/* Tooltip for selected */}
                      {isSelected && (
                        <div className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-[#1C1C1C] px-2 py-1 text-[10px] text-foreground shadow-lg border border-white/10 z-50">
                          {cp.id}: {cp.name}
                        </div>
                      )}
                    </div>
                  </Marker>
                );
              })}
        </Map>

        {/* Compass indicator */}
        <div className="absolute bottom-3 right-3 text-[10px] font-mono text-white/50 pointer-events-none z-10">
          N ↑
        </div>
      </div>
    </div>
  );
}
