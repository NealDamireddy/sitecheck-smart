'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Crosshair } from 'lucide-react';
import { DroneMission } from '@/types/drone';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { useProjectStore } from '@/stores/project-store';
import { useDroneStore } from '@/stores/drone-store';
import { STATUS_COLORS } from '@/lib/constants';
import { MAPBOX_TOKEN, DEFAULT_MAP_STYLE } from '@/lib/mapbox-config';
import { CorridorLayer } from '@/components/map/corridor-layer';
import { GeofenceLayer } from '@/components/map/geofence-layer';
import { NoFlyZonesLayer } from '@/components/map/nofly-zones-layer';
import { useAirspace } from '@/hooks/use-airspace';
import { findHighDeviationSamples } from '@/lib/mission-deviation';
import { cn } from '@/lib/utils';

interface MissionMapProps {
  mission: DroneMission;
  currentWaypointIndex: number;
  playbackProgress: number;
  onSelectWaypoint: (index: number) => void;
}

export function MissionMap({
  mission,
  currentWaypointIndex,
  playbackProgress,
  onSelectWaypoint,
}: MissionMapProps) {
  const [cursor, setCursor] = useState<string>('grab');
  const [followDrone, setFollowDrone] = useState(false);
  const mapRef = useRef<MapRef>(null);

  const checkpoints = useCheckpointStore((s) => s.checkpoints);
  const fetchCheckpoints = useCheckpointStore((s) => s.fetchCheckpoints);
  const project = useProjectStore((s) => s.currentProject());
  const { geofence, noFlyZones } = useAirspace(project?.id);

  // Block 4 — read the persisted actual flight track for this mission. Empty
  // when the mission hasn't been flown (or is still in progress without any
  // samples persisted yet); the overlay layers no-op in that case.
  const actualSamples = useDroneStore((s) => s.getActualFlightPath(mission.id));
  const hasActualTrack = actualSamples.length >= 2;

  useEffect(() => {
    if (checkpoints.length === 0) fetchCheckpoints();
  }, [checkpoints.length, fetchCheckpoints]);

  const onMouseEnter = useCallback(() => setCursor('pointer'), []);
  const onMouseLeave = useCallback(() => setCursor('grab'), []);

  // Compute initial viewport from flight path bounds
  const initialViewState = useMemo(() => {
    const lngs = mission.flightPath.map(([lng]) => lng);
    const lats = mission.flightPath.map(([, lat]) => lat);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;

    // Approximate zoom from bounds span
    const lngSpan = maxLng - minLng;
    const latSpan = maxLat - minLat;
    const maxSpan = Math.max(lngSpan, latSpan);
    // Rough heuristic: at zoom 16, ~0.005 degrees fits nicely
    const zoom = maxSpan > 0 ? Math.min(18, Math.max(8, Math.log2(0.01 / maxSpan) + 16)) : 16;

    return {
      longitude: centerLng,
      latitude: centerLat,
      zoom,
      pitch: 0,
      bearing: 0,
    };
  }, [mission.flightPath]);

  // Full planned flight path GeoJSON
  const plannedPathGeoJSON = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: mission.flightPath,
      },
    }),
    [mission.flightPath]
  );

  // Completed flight path GeoJSON (slice based on playbackProgress)
  const completedPathGeoJSON = useMemo(() => {
    const totalPoints = mission.flightPath.length;
    const completedCount = Math.min(
      Math.ceil(playbackProgress * (totalPoints - 1)) + 1,
      totalPoints
    );
    const completedCoords = mission.flightPath.slice(0, completedCount);

    // If progress is between two points, interpolate to the exact position
    if (playbackProgress > 0 && completedCount < totalPoints) {
      const progressIndex = Math.floor(playbackProgress * (totalPoints - 1));
      const fraction = playbackProgress * (totalPoints - 1) - progressIndex;
      if (fraction > 0 && progressIndex < totalPoints - 1) {
        const from = mission.flightPath[progressIndex];
        const to = mission.flightPath[progressIndex + 1];
        const interpLng = from[0] + (to[0] - from[0]) * fraction;
        const interpLat = from[1] + (to[1] - from[1]) * fraction;
        completedCoords.push([interpLng, interpLat]);
      }
    }

    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: completedCoords,
      },
    };
  }, [mission.flightPath, playbackProgress]);

  // Block 4 — actual flight track GeoJSON (solid magenta line above the
  // dashed planned path). When no samples are persisted, this collapses to an
  // empty geometry and the layer paint never matches anything.
  const actualPathGeoJSON = useMemo(() => {
    const coords: [number, number][] = hasActualTrack
      ? actualSamples.map((s) => [s.lng, s.lat])
      : [];
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: coords,
      },
    };
  }, [actualSamples, hasActualTrack]);

  // Block 4 — deviation arrows. Any sample more than 30 ft off the nearest
  // planned segment is rendered as a small magenta dot on top of the actual
  // track. Cheap to compute (O(samples × segments)) and runs once per change.
  const deviationFeatures = useMemo(() => {
    if (!hasActualTrack) return { type: 'FeatureCollection' as const, features: [] };
    const flagged = findHighDeviationSamples(mission.flightPath, [...actualSamples], 30);
    return {
      type: 'FeatureCollection' as const,
      features: flagged.map((s, i) => ({
        type: 'Feature' as const,
        properties: { idx: i },
        geometry: {
          type: 'Point' as const,
          coordinates: [s.lng, s.lat],
        },
      })),
    };
  }, [mission.flightPath, actualSamples, hasActualTrack]);

  // Drone position interpolated along the flight path. Block 4 — when an
  // actual track exists, drive the marker along the real samples; otherwise
  // fall back to the planned path so older / in-progress missions still
  // animate their marker the same way as before.
  const dronePosition = useMemo(() => {
    if (playbackProgress <= 0) return null;

    if (hasActualTrack) {
      const totalSamples = actualSamples.length;
      const progressIndex = Math.min(
        Math.floor(playbackProgress * (totalSamples - 1)),
        totalSamples - 2
      );
      const fraction = playbackProgress * (totalSamples - 1) - progressIndex;
      const from = actualSamples[progressIndex];
      const to = actualSamples[Math.min(progressIndex + 1, totalSamples - 1)];
      return {
        longitude: from.lng + (to.lng - from.lng) * fraction,
        latitude: from.lat + (to.lat - from.lat) * fraction,
      };
    }

    const totalPoints = mission.flightPath.length;
    const progressIndex = Math.min(
      Math.floor(playbackProgress * (totalPoints - 1)),
      totalPoints - 2
    );
    const fraction = playbackProgress * (totalPoints - 1) - progressIndex;
    const from = mission.flightPath[progressIndex];
    const to = mission.flightPath[Math.min(progressIndex + 1, totalPoints - 1)];

    return {
      longitude: from[0] + (to[0] - from[0]) * fraction,
      latitude: from[1] + (to[1] - from[1]) * fraction,
    };
  }, [mission.flightPath, playbackProgress, actualSamples, hasActualTrack]);

  // Follow drone: smoothly pan map to drone position
  useEffect(() => {
    if (!followDrone || !dronePosition || !mapRef.current) return;
    mapRef.current.easeTo({
      center: [dronePosition.longitude, dronePosition.latitude],
      zoom: 17,
      duration: 600,
    });
  }, [followDrone, dronePosition]);

  // Disable follow on user drag
  const handleDragStart = useCallback(() => {
    if (followDrone) setFollowDrone(false);
  }, [followDrone]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg">
      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        onDragStart={handleDragStart}
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

        {/* Full planned flight path - dashed amber */}
        <Source id="planned-path" type="geojson" data={plannedPathGeoJSON}>
          <Layer
            id="planned-path-line"
            type="line"
            paint={{
              'line-color': '#F59E0B',
              'line-width': 2,
              'line-opacity': 0.3,
              'line-dasharray': [4, 4],
            }}
          />
        </Source>

        {/* Completed flight path - solid amber (planned-path slice driven
            by playbackProgress, kept for back-compat with missions that have
            no persisted actual track yet) */}
        <Source id="completed-path" type="geojson" data={completedPathGeoJSON}>
          <Layer
            id="completed-path-line"
            type="line"
            paint={{
              'line-color': '#F59E0B',
              'line-width': 2.5,
              'line-opacity': hasActualTrack ? 0.25 : 0.8,
            }}
          />
        </Source>

        {/* Block 4 — actual flight track (solid magenta). Drawn above the
            planned path so deviations are visually obvious. */}
        {hasActualTrack && (
          <Source id="actual-path" type="geojson" data={actualPathGeoJSON}>
            <Layer
              id="actual-path-line"
              type="line"
              paint={{
                'line-color': '#ec4899',
                'line-width': 3,
                'line-opacity': 0.95,
              }}
              layout={{
                'line-cap': 'round',
                'line-join': 'round',
              }}
            />
          </Source>
        )}

        {/* Block 4 — deviation markers (>30 ft off the planned segment) */}
        {hasActualTrack && deviationFeatures.features.length > 0 && (
          <Source id="deviation-points" type="geojson" data={deviationFeatures}>
            <Layer
              id="deviation-points-circle"
              type="circle"
              paint={{
                'circle-radius': 4,
                'circle-color': '#ef4444',
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 1.2,
                'circle-opacity': 0.9,
              }}
            />
          </Source>
        )}

        {/* Waypoint markers */}
        {mission.waypoints.map((wp, i) => {
          const cp = checkpoints.find((c) => c.id === wp.checkpointId);
          const color = cp ? STATUS_COLORS[cp.status] : '#6B7280';
          const isCurrent = i === currentWaypointIndex;
          const isPast = i < currentWaypointIndex;

          return (
            <Marker
              key={wp.number}
              longitude={wp.lng}
              latitude={wp.lat}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSelectWaypoint(i);
              }}
            >
              <div
                className="relative cursor-pointer"
                style={{ opacity: isPast && !isCurrent ? 0.6 : 1 }}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
              >
                {/* Pulsing ring for current waypoint */}
                {isCurrent && (
                  <div
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-ping"
                    style={{
                      width: 20,
                      height: 20,
                      backgroundColor: color,
                      opacity: 0.4,
                    }}
                  />
                )}

                {/* Waypoint circle */}
                <div
                  className="rounded-full border-2 border-black/40"
                  style={{
                    width: isCurrent ? 14 : 10,
                    height: isCurrent ? 14 : 10,
                    backgroundColor: color,
                    transition: 'width 150ms, height 150ms',
                    boxShadow: isCurrent
                      ? `0 0 6px ${color}80`
                      : '0 1px 2px rgba(0,0,0,0.4)',
                  }}
                />
              </div>
            </Marker>
          );
        })}

        {/* Animated drone marker */}
        {dronePosition && (
          <Marker
            longitude={dronePosition.longitude}
            latitude={dronePosition.latitude}
            anchor="center"
          >
            <div className="relative">
              {/* Shadow / glow */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-ping"
                style={{
                  width: 28,
                  height: 28,
                  backgroundColor: 'rgba(245, 158, 11, 0.3)',
                }}
              />
              {/* Drone body */}
              <div
                className="flex items-center justify-center rounded-full border-2 border-amber-300"
                style={{
                  width: 20,
                  height: 20,
                  backgroundColor: '#F59E0B',
                  boxShadow: '0 0 12px rgba(245, 158, 11, 0.5)',
                }}
              >
                <span className="text-[8px] font-bold text-black leading-none">
                  &#9650;
                </span>
              </div>
            </div>
          </Marker>
        )}
      </Map>

      {/* Bottom-left label */}
      <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[9px] text-white/70 font-mono pointer-events-none z-10">
        {mission.waypoints.length} waypoints &middot; {mission.flightPath.length} path points
        {hasActualTrack && (
          <>
            {' '}&middot; <span className="text-pink-300">{actualSamples.length} samples</span>
          </>
        )}
      </div>

      {/* Follow-drone toggle */}
      <button
        onClick={() => setFollowDrone(!followDrone)}
        className={cn(
          'absolute bottom-10 right-2 z-10 flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors border',
          followDrone
            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
            : 'bg-black/60 border-white/10 text-white/60 hover:text-white/80 hover:bg-black/80'
        )}
        title={followDrone ? 'Disable follow drone' : 'Follow drone position'}
      >
        <Crosshair className="h-3 w-3" />
        {followDrone ? 'Following' : 'Follow'}
      </button>

      {/* Compass */}
      <div className="absolute bottom-2 right-2 text-[9px] font-mono text-white/50 pointer-events-none z-10">
        N ↑
      </div>
    </div>
  );
}
