'use client';

import { useEffect, useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useGeofenceStore } from '@/stores/geofence-store';
import { useNoFlyZonesStore } from '@/stores/nofly-zones-store';
import { validateFlightPath, type ValidatableWaypoint } from '@/lib/geofence';
import { NOFLY_CATEGORY_LABELS } from '@/types/nofly-zone';
import { cn } from '@/lib/utils';
import type { Checkpoint } from '@/types/checkpoint';

interface MissionAirspaceCheckProps {
  /** The project the wizard is operating against */
  projectId: string | undefined;
  /** Checkpoints currently selected in the wizard */
  selectedCheckpoints: Checkpoint[];
  /** Mission altitude (feet) — used as default for the validation pass */
  altitudeFeet: number;
  /** Optional callback so the parent can disable Generate when invalid */
  onValidityChange?: (valid: boolean) => void;
  /** Optional callback exposing the violating waypoint numbers (for the route-editor red ring) */
  onViolatingWaypointsChange?: (numbers: number[]) => void;
}

/**
 * Live in-wizard airspace validation panel.
 *
 * Mirrors the server-side check in `/api/generate-mission` and `/api/missions`,
 * but runs in the browser against the same `validateFlightPath()` library so
 * users see violations *before* they click Generate.
 *
 * Approximates the future flight path as the polyline connecting selected
 * checkpoints in their current order. This is sufficient for catching the
 * common case (a checkpoint sitting inside a NFZ or outside the geofence) and
 * many of the segment-crossing cases. The authoritative validation still
 * happens server-side at generation time.
 */
export function MissionAirspaceCheck({
  projectId,
  selectedCheckpoints,
  altitudeFeet,
  onValidityChange,
  onViolatingWaypointsChange,
}: MissionAirspaceCheckProps) {
  const fetchGeofences = useGeofenceStore((s) => s.fetchGeofences);
  const fetchZones = useNoFlyZonesStore((s) => s.fetchZones);
  const geofencesByProject = useGeofenceStore((s) => s.geofencesByProject);
  const zonesByProject = useNoFlyZonesStore((s) => s.zonesByProject);
  const loading = useGeofenceStore((s) => s.loading) || useNoFlyZonesStore((s) => s.loading);

  // Fetch on mount + whenever the project changes
  useEffect(() => {
    if (!projectId) return;
    fetchGeofences(projectId);
    fetchZones(projectId);
  }, [projectId, fetchGeofences, fetchZones]);

  const geofence = projectId
    ? (geofencesByProject[projectId] ?? [])[0]
    : undefined;
  const zones = projectId ? (zonesByProject[projectId] ?? []) : [];
  const activeZones = useMemo(() => zones.filter((z) => z.active), [zones]);

  // Run validation against the polyline of selected checkpoints
  const result = useMemo(() => {
    if (selectedCheckpoints.length === 0) {
      return { valid: true, violations: [] };
    }
    const waypoints: ValidatableWaypoint[] = selectedCheckpoints.map((cp, i) => ({
      number: i + 1,
      lat: cp.lat ?? cp.location.lat,
      lng: cp.lng ?? cp.location.lng,
      altitudeFeet,
    }));
    const flightPath: [number, number][] = waypoints.map((wp) => [wp.lng, wp.lat]);
    return validateFlightPath(flightPath, waypoints, geofence, activeZones, {
      defaultAltitudeFeet: altitudeFeet,
    });
  }, [selectedCheckpoints, geofence, activeZones, altitudeFeet]);

  // Notify parent of validity changes
  useEffect(() => {
    onValidityChange?.(result.valid);
  }, [result.valid, onValidityChange]);

  // Notify parent of violating waypoint numbers
  useEffect(() => {
    if (!onViolatingWaypointsChange) return;
    const nums = Array.from(
      new Set(
        result.violations
          .map((v) => v.waypointNumber)
          .filter((n): n is number => typeof n === 'number')
      )
    );
    onViolatingWaypointsChange(nums);
  }, [result.violations, onViolatingWaypointsChange]);

  // Empty state — no project or no checkpoints
  if (!projectId || selectedCheckpoints.length === 0) {
    return null;
  }

  // Loading state
  if (loading && !geofence && activeZones.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface px-3 py-2.5 flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Checking airspace…</span>
      </div>
    );
  }

  // No fence and no zones — nothing to check against
  if (!geofence && activeZones.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface px-3 py-2.5 flex items-center gap-2">
        <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          No geofence or no-fly zones configured for this project.
        </span>
      </div>
    );
  }

  // Valid — green confirmation
  if (result.valid) {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2.5 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-green-300">Airspace clear</p>
          <p className="text-[10px] text-green-300/70">
            All {selectedCheckpoints.length} checkpoint
            {selectedCheckpoints.length === 1 ? '' : 's'} are within the operating
            boundary
            {activeZones.length > 0 &&
              ` and clear of ${activeZones.length} active no-fly zone${
                activeZones.length === 1 ? '' : 's'
              }`}
            .
          </p>
        </div>
      </div>
    );
  }

  // Invalid — red violation list
  // Group violations by zone to keep the panel compact
  const grouped = new Map<
    string,
    {
      zoneName: string;
      kind: string;
      waypointNumbers: Set<number>;
      messages: Set<string>;
    }
  >();
  for (const v of result.violations) {
    const key = `${v.kind}::${v.zoneId ?? v.zoneName ?? 'unknown'}`;
    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        zoneName: v.zoneName ?? 'Unknown',
        kind: v.kind,
        waypointNumbers: new Set<number>(),
        messages: new Set<string>(),
      };
      grouped.set(key, entry);
    }
    if (typeof v.waypointNumber === 'number') {
      entry.waypointNumbers.add(v.waypointNumber);
    }
    entry.messages.add(v.message);
  }

  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-red-400 flex-shrink-0" />
        <p className="text-xs font-semibold text-red-300 uppercase tracking-wider">
          Airspace Violations ({result.violations.length})
        </p>
      </div>

      <ul className="space-y-1.5">
        {Array.from(grouped.values()).map((g, i) => {
          const wps = Array.from(g.waypointNumbers).sort((a, b) => a - b);
          const kindLabel = describeKind(g.kind);
          return (
            <li
              key={i}
              className={cn(
                'rounded border border-red-500/20 bg-red-500/5 px-2.5 py-1.5',
                'text-[11px] text-red-200'
              )}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <AlertTriangle className="h-3 w-3 text-red-400" />
                <span className="font-medium">{g.zoneName}</span>
                <span className="text-red-300/60 text-[10px]">· {kindLabel}</span>
              </div>
              {wps.length > 0 && (
                <p className="text-[10px] text-red-200/80 font-mono">
                  Waypoint{wps.length === 1 ? '' : 's'}: {wps.join(', ')}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-[10px] text-red-300/70">
        Adjust your checkpoint selection to clear these violations, or update the
        no-fly zones from the airspace settings.
      </p>
    </div>
  );
}

function describeKind(kind: string): string {
  switch (kind) {
    case 'outside-geofence':
      return 'outside operating boundary';
    case 'inside-nofly-zone':
      return NOFLY_CATEGORY_LABELS.airport ? 'inside no-fly zone' : 'inside no-fly zone';
    case 'altitude-ceiling':
      return 'altitude above ceiling';
    default:
      return kind;
  }
}
