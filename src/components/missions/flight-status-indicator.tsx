'use client';

import { Battery, Clock, MapPin, Radio } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MISSION_STATUS_LABELS, MISSION_STATUS_COLORS } from '@/lib/constants';
import { useDroneStore } from '@/stores/drone-store';
import type { DroneMission } from '@/types/drone';

interface FlightStatusIndicatorProps {
  mission: DroneMission;
  elapsedSeconds: number;
  currentWaypointIndex: number;
}

export function FlightStatusIndicator({
  mission,
  elapsedSeconds,
  currentWaypointIndex,
}: FlightStatusIndicatorProps) {
  const statusColors = MISSION_STATUS_COLORS[mission.status];
  const statusLabel = MISSION_STATUS_LABELS[mission.status];
  const telemetry = useDroneStore((s) => s.telemetry);

  // Use live telemetry battery when available, fall back to estimated
  const totalWaypoints = mission.waypoints.length;
  const progress = totalWaypoints > 0 ? currentWaypointIndex / totalWaypoints : 0;
  const fallbackBattery = Math.round(
    mission.batteryStart - (mission.batteryStart - mission.batteryEnd) * progress
  );
  const estimatedBattery = telemetry?.batteryPercent ?? fallbackBattery;

  // Format elapsed time
  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  const elapsedStr = `${mins}:${String(secs).padStart(2, '0')}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Mission status */}
      <Badge
        variant="outline"
        className={`${statusColors.bg} ${statusColors.text} ${statusColors.border} text-[10px]`}
      >
        <Radio className="mr-1 h-3 w-3" />
        {statusLabel}
      </Badge>

      {/* Waypoint progress */}
      <Badge variant="secondary" className="text-[10px] gap-1 bg-muted text-muted-foreground">
        <MapPin className="h-3 w-3" />
        {currentWaypointIndex + 1} / {totalWaypoints}
      </Badge>

      {/* Battery */}
      <Badge
        variant="secondary"
        className={`text-[10px] gap-1 bg-muted ${
          estimatedBattery > 30
            ? 'text-green-400'
            : estimatedBattery > 15
              ? 'text-amber-400'
              : 'text-red-400'
        }`}
      >
        <Battery className="h-3 w-3" />
        {estimatedBattery}%
      </Badge>

      {/* Elapsed time */}
      <Badge variant="secondary" className="text-[10px] gap-1 bg-muted text-muted-foreground">
        <Clock className="h-3 w-3" />
        {elapsedStr}
      </Badge>

      {/* Manual override indicator */}
      {mission.manualOverrideActive && (
        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse">
          MANUAL
        </Badge>
      )}
    </div>
  );
}
