'use client';

import { useState, useCallback, useMemo } from 'react';
import { RotateCcw, Save, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteEditorMap } from './route-editor-map';
import { WaypointEditor } from './waypoint-editor';
import { generateFlightPath } from '@/lib/flight-path';
import { useAppMode } from '@/hooks/use-app-mode';
import { useProjectStore } from '@/stores/project-store';
import { useAirspace } from '@/hooks/use-airspace';
import { validateFlightPath, type ValidatableWaypoint } from '@/lib/geofence';
import { cn } from '@/lib/utils';
import type { DroneMission, Waypoint } from '@/types/drone';

interface RouteEditorProps {
  mission: DroneMission;
  onSave: (waypoints: Waypoint[], editedFlightPath: [number, number][]) => Promise<void>;
}

export function RouteEditor({ mission, onSave }: RouteEditorProps) {
  const { isApp } = useAppMode();
  const project = useProjectStore((s) => s.currentProject());
  const { geofence, noFlyZones } = useAirspace(project?.id);

  const siteCenter = {
    lat: project?.coordinates.lat ?? 36.7801,
    lng: project?.coordinates.lng ?? -119.4161,
  };

  const [waypoints, setWaypoints] = useState<Waypoint[]>(mission.waypoints);
  const [flightPath, setFlightPath] = useState<[number, number][]>(
    mission.editedFlightPath || mission.flightPath
  );
  const [selectedWp, setSelectedWp] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Block 3 — Live airspace validation while editing
  const validation = useMemo(() => {
    const enabled = waypoints.filter((w) => w.enabled !== false);
    if (enabled.length === 0) {
      return { valid: true, violations: [] };
    }
    const validatable: ValidatableWaypoint[] = enabled.map((w) => ({
      number: w.number,
      lat: w.lat,
      lng: w.lng,
      altitudeFeet:
        typeof w.altitudeOverride === 'number'
          ? w.altitudeOverride
          : mission.altitude,
    }));
    return validateFlightPath(flightPath, validatable, geofence, noFlyZones, {
      defaultAltitudeFeet: mission.altitude,
    });
  }, [waypoints, flightPath, geofence, noFlyZones, mission.altitude]);

  const violatingWaypointNumbers = useMemo(
    () =>
      Array.from(
        new Set(
          validation.violations
            .map((v) => v.waypointNumber)
            .filter((n): n is number => typeof n === 'number')
        )
      ),
    [validation.violations]
  );

  // Regenerate flight path from current enabled waypoints
  const regeneratePath = useCallback((wps: Waypoint[]) => {
    const enabledWps = wps.filter((w) => w.enabled !== false);
    if (enabledWps.length === 0) {
      setFlightPath([[siteCenter.lng, siteCenter.lat]]);
      return;
    }
    const newPath = generateFlightPath(enabledWps, siteCenter);
    setFlightPath(newPath);
    setDirty(true);
  }, [siteCenter]);

  // Toggle a waypoint's enabled state
  const handleToggle = useCallback(
    (waypointNumber: number) => {
      setWaypoints((prev) => {
        const next = prev.map((wp) =>
          wp.number === waypointNumber
            ? { ...wp, enabled: wp.enabled === false ? true : false }
            : wp
        );
        regeneratePath(next);
        return next;
      });
    },
    [regeneratePath]
  );

  // Reorder waypoints
  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      setWaypoints((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        // Renumber
        const renumbered = next.map((wp, i) => ({ ...wp, number: i + 1, sortOrder: i }));
        regeneratePath(renumbered);
        return renumbered;
      });
    },
    [regeneratePath]
  );

  // Drag waypoint to new position
  const handleDrag = useCallback(
    (waypointNumber: number, lat: number, lng: number) => {
      setWaypoints((prev) => {
        const next = prev.map((wp) =>
          wp.number === waypointNumber ? { ...wp, lat, lng } : wp
        );
        regeneratePath(next);
        return next;
      });
    },
    [regeneratePath]
  );

  // Update waypoint settings (altitude, hover time, capture mode, notes)
  const handleUpdateWaypoint = useCallback(
    (waypointNumber: number, updates: Partial<Waypoint>) => {
      setWaypoints((prev) =>
        prev.map((wp) =>
          wp.number === waypointNumber ? { ...wp, ...updates } : wp
        )
      );
      setDirty(true);
    },
    []
  );

  // Reset to original mission data
  const handleReset = useCallback(() => {
    setWaypoints(mission.waypoints);
    setFlightPath(mission.editedFlightPath || mission.flightPath);
    setDirty(false);
    setSelectedWp(null);
  }, [mission]);

  // Save changes
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(waypoints, flightPath);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [waypoints, flightPath, onSave]);

  return (
    <div className="space-y-4">
      {/* Map + Editor grid */}
      <div
        className={cn(
          'grid gap-4',
          isApp ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-5'
        )}
      >
        {/* Map — takes more space */}
        <div className={cn(!isApp && 'lg:col-span-3')}>
          <RouteEditorMap
            waypoints={waypoints}
            flightPath={flightPath}
            onWaypointDrag={handleDrag}
            onWaypointToggle={handleToggle}
            selectedWaypoint={selectedWp}
            onSelectWaypoint={setSelectedWp}
            violatingWaypointNumbers={violatingWaypointNumbers}
          />
        </div>

        {/* Waypoint editor sidebar */}
        <div className={cn(!isApp && 'lg:col-span-2')}>
          <WaypointEditor
            waypoints={waypoints}
            selectedWaypoint={selectedWp}
            onSelectWaypoint={setSelectedWp}
            onToggle={handleToggle}
            onReorder={handleReorder}
            onUpdateWaypoint={handleUpdateWaypoint}
          />
        </div>
      </div>

      {/* Block 3 — Live airspace warning */}
      {!validation.valid && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-red-300">
              {validation.violations.length} airspace violation
              {validation.violations.length === 1 ? '' : 's'} on this route
            </p>
            <p className="text-[11px] text-red-200/80 mt-0.5">
              Waypoint{violatingWaypointNumbers.length === 1 ? '' : 's'}{' '}
              <span className="font-mono">{violatingWaypointNumbers.join(', ')}</span>{' '}
              violate the operating boundary or an active no-fly zone. Drag them out
              of the red areas before saving.
            </p>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          disabled={!dirty}
          onClick={handleReset}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to Original
        </Button>

        <Button
          size="sm"
          className="gap-1.5"
          disabled={!dirty || saving || !validation.valid}
          onClick={handleSave}
          title={
            !validation.valid
              ? 'Resolve airspace violations before saving'
              : undefined
          }
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" />
              Save Route
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
