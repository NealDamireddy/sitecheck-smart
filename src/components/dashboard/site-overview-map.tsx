'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Map, { Marker, Popup, NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import Link from 'next/link';

import { MAPBOX_TOKEN, DEFAULT_MAP_STYLE } from '@/lib/mapbox-config';
import { useAppMode } from '@/hooks/use-app-mode';
import { cn } from '@/lib/utils';
import { STATUS_COLORS, STATUS_LABELS, BMP_CATEGORY_LABELS } from '@/lib/constants';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { useProjectStore } from '@/stores/project-store';
import { useCrossingsStore } from '@/stores/crossings-store';
import { fitBoundsFromPoints } from '@/lib/map-utils';
import { CorridorLayer } from '@/components/map/corridor-layer';
import { CrossingsLayer } from '@/components/map/crossings-layer';
import { RowLayer } from '@/components/map/row-layer';
import { GeofenceLayer } from '@/components/map/geofence-layer';
import { NoFlyZonesLayer } from '@/components/map/nofly-zones-layer';
import { useAirspace } from '@/hooks/use-airspace';
import type { Checkpoint, CheckpointStatus } from '@/types/checkpoint';
import type { Crossing } from '@/types/crossing';

const EMPTY_CROSSINGS: Crossing[] = [];

export function SiteOverviewMap() {
  const { isApp } = useAppMode();
  const checkpoints = useCheckpointStore((s) => s.checkpoints);
  const fetchCheckpoints = useCheckpointStore((s) => s.fetchCheckpoints);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const project = useProjectStore((s) => s.currentProject());
  const fetchCrossings = useCrossingsStore((s) => s.fetchCrossings);
  // IMPORTANT: select the raw value (stable ref) and default outside the selector,
  // otherwise a new [] is created on every render and Zustand re-renders forever
  // (React error #185 — maximum update depth exceeded).
  const crossingsForProject = useCrossingsStore((s) => s.crossingsByProject[currentProjectId]);
  const crossings = project?.projectType === 'linear'
    ? (crossingsForProject ?? EMPTY_CROSSINGS)
    : EMPTY_CROSSINGS;
  const { geofence, noFlyZones } = useAirspace(currentProjectId);

  useEffect(() => {
    if (checkpoints.length === 0) fetchCheckpoints();
  }, [checkpoints.length, fetchCheckpoints]);

  useEffect(() => {
    if (project?.projectType === 'linear' && currentProjectId) {
      fetchCrossings(currentProjectId);
    }
  }, [project?.projectType, currentProjectId, fetchCrossings]);

  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null);

  const initialViewState = useMemo(() => {
    if (checkpoints.length > 0) {
      return fitBoundsFromPoints(
        checkpoints.map((cp) => ({ lat: cp.lat ?? cp.location.lat, lng: cp.lng ?? cp.location.lng })),
        { minZoom: 8 }
      );
    }
    if (project) {
      return {
        longitude: project.coordinates.lng,
        latitude: project.coordinates.lat,
        zoom: project.projectType === 'linear' ? 11 : 16,
        pitch: 0,
        bearing: 0,
      };
    }
    return { longitude: -119.4161, latitude: 36.7801, zoom: 16, pitch: 0, bearing: 0 };
  }, [checkpoints, project]);

  const statusCounts = useMemo(() => {
    const counts: Record<CheckpointStatus, number> = {
      compliant: 0,
      deficient: 0,
      'needs-review': 0,
    };
    for (const cp of checkpoints) {
      counts[cp.status]++;
    }
    return counts;
  }, [checkpoints]);

  const handleMarkerClick = useCallback((cp: Checkpoint) => {
    setSelectedCheckpoint(cp);
  }, []);

  const handlePopupClose = useCallback(() => {
    setSelectedCheckpoint(null);
  }, []);

  return (
    <div className="relative rounded-lg border border-border bg-surface overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-heading text-sm font-semibold tracking-wide">
          {project?.projectType === 'linear' ? 'Corridor Overview' : 'Site Overview'}
        </h3>
      </div>

      <div className={cn('relative', isApp ? 'h-[200px]' : 'h-[400px]')}>
        <Map
          key={currentProjectId}
          initialViewState={initialViewState}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={DEFAULT_MAP_STYLE}
          style={{ width: '100%', height: '100%' }}
          reuseMaps
        >
          <NavigationControl position="top-right" />
          {project?.corridor?.centerline && (
            <CorridorLayer
              centerline={project.corridor.centerline}
              widthFeet={project.corridor.corridorWidthFeet}
            />
          )}
          {project?.corridor?.centerline && project.rowBoundaries?.widthFeet && (
            <RowLayer
              centerline={project.corridor.centerline}
              leftBoundary={project.rowBoundaries.left.length > 0 ? project.rowBoundaries.left : undefined}
              rightBoundary={project.rowBoundaries.right.length > 0 ? project.rowBoundaries.right : undefined}
              widthFeet={project.rowBoundaries.widthFeet}
            />
          )}
          {project?.projectType === 'linear' && crossings.length > 0 && (
            <CrossingsLayer crossings={crossings} />
          )}

          {/* Block 3 — Airspace overlays */}
          <GeofenceLayer geofence={geofence} />
          <NoFlyZonesLayer zones={noFlyZones} />

          {checkpoints.map((cp) => {
            const color = STATUS_COLORS[cp.status];
            const isDeficient = cp.status === 'deficient';
            const size = isDeficient ? 16 : 12;

            return (
              <Marker
                key={cp.id}
                longitude={cp.location.lng}
                latitude={cp.location.lat}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  handleMarkerClick(cp);
                }}
              >
                <div
                  className="relative cursor-pointer"
                  style={{ width: size, height: size }}
                >
                  {isDeficient && (
                    <span
                      className="absolute inset-0 animate-ping rounded-full opacity-50"
                      style={{ backgroundColor: color }}
                    />
                  )}
                  <span
                    className="absolute inset-0 rounded-full border border-white/40"
                    style={{ backgroundColor: color }}
                  />
                </div>
              </Marker>
            );
          })}

          {selectedCheckpoint && (
            <Popup
              longitude={selectedCheckpoint.location.lng}
              latitude={selectedCheckpoint.location.lat}
              anchor="bottom"
              onClose={handlePopupClose}
              closeOnClick={false}
              offset={12}
              maxWidth="260px"
            >
              <div className="bg-[#1C1C1C] text-foreground border border-border rounded-md p-3 -m-[10px] min-w-[220px]">
                <p className="font-mono text-xs text-muted-foreground">
                  {selectedCheckpoint.id}
                </p>
                <p className="mt-0.5 text-sm font-semibold leading-tight">
                  {selectedCheckpoint.name}
                </p>

                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none"
                    style={{
                      backgroundColor: `${STATUS_COLORS[selectedCheckpoint.status]}20`,
                      color: STATUS_COLORS[selectedCheckpoint.status],
                      border: `1px solid ${STATUS_COLORS[selectedCheckpoint.status]}40`,
                    }}
                  >
                    {STATUS_LABELS[selectedCheckpoint.status]}
                  </span>
                </div>

                <p className="mt-2 text-[11px] text-muted-foreground">
                  {BMP_CATEGORY_LABELS[selectedCheckpoint.bmpType]}
                </p>

                <Link
                  href={`/checkpoints/${selectedCheckpoint.id}`}
                  className="mt-2 inline-block text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                >
                  View Details &rarr;
                </Link>
              </div>
            </Popup>
          )}
        </Map>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-10 rounded-md border border-border bg-[#1C1C1C]/90 backdrop-blur-sm px-3 py-2">
          <div className="flex items-center gap-4 text-xs">
            {(Object.keys(STATUS_COLORS) as CheckpointStatus[]).map((status) => (
              <div key={status} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
                <span className="text-muted-foreground">
                  {statusCounts[status]} {STATUS_LABELS[status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
