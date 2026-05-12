'use client';

/**
 * Block 4 — MissionDeviationPanel
 *
 * Renders a 6-tile metric grid summarizing how closely the recorded actual
 * flight track matched the planned path: total flight time, max horizontal
 * deviation, max altitude deviation, captured/planned waypoints, mean ground
 * speed, and total sample count.
 *
 * Color coding for the deviation tile follows {@link deviationSeverity}:
 *   green ≤ 30 ft, amber 30–100 ft, red > 100 ft.
 *
 * Hidden entirely (returns null) for missions without a persisted actual
 * track, so older / in-progress missions still render normally without an
 * empty panel taking up space.
 */

import { useMemo, useEffect } from 'react';
import {
  Clock,
  Compass,
  Mountain,
  CheckCircle2,
  Gauge,
  Sigma,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useDroneStore } from '@/stores/drone-store';
import {
  computeDeviationStats,
  deviationSeverity,
} from '@/lib/mission-deviation';
import type { DroneMission } from '@/types/drone';
import { cn } from '@/lib/utils';

interface MissionDeviationPanelProps {
  mission: DroneMission;
}

const SEVERITY_CLASS: Record<'good' | 'warn' | 'bad', string> = {
  good: 'text-green-400',
  warn: 'text-amber-400',
  bad: 'text-red-400',
};

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '—';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function MissionDeviationPanel({ mission }: MissionDeviationPanelProps) {
  const samples = useDroneStore((s) => s.getActualFlightPath(mission.id));
  const loadCompletedTrack = useDroneStore((s) => s.loadCompletedMissionTrack);

  // Lazy-load the persisted track on mount if the mission is completed and
  // we haven't yet hydrated it. Avoids a flash of the panel for completed
  // missions when the user navigates straight to a deep link.
  useEffect(() => {
    if (mission.status === 'completed' && samples.length === 0) {
      loadCompletedTrack(mission.id);
    }
  }, [mission.id, mission.status, samples.length, loadCompletedTrack]);

  const stats = useMemo(() => {
    const captured = mission.waypoints.filter(
      (w) => w.captureStatus === 'captured'
    ).length;
    return computeDeviationStats(
      mission.flightPath,
      [...samples],
      mission.altitude,
      mission.waypoints.length,
      captured
    );
  }, [mission.flightPath, mission.altitude, mission.waypoints, samples]);

  // Hide for missions with no recorded track at all (older completed missions
  // pre-Block 4, in-progress missions before any sample lands, etc.).
  if (samples.length === 0) return null;

  const horizSeverity = deviationSeverity(stats.maxDeviationFeet);
  const altSeverity = deviationSeverity(stats.maxAltitudeDeviationFeet);

  return (
    <Card className="border-border bg-surface">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-foreground">
            Flight Quality
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/10 px-2 py-0.5 text-[10px] font-medium text-pink-300">
            <span className="h-1.5 w-1.5 rounded-full bg-pink-400" />
            Replay
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {/* Total flight time */}
          <div className="rounded-md border border-border bg-background/50 p-2">
            <div className="flex items-center gap-1 mb-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                Total time
              </span>
            </div>
            <p className="font-mono text-sm font-semibold text-foreground">
              {formatDuration(stats.totalFlightSeconds)}
            </p>
          </div>

          {/* Max horizontal deviation */}
          <div className="rounded-md border border-border bg-background/50 p-2">
            <div className="flex items-center gap-1 mb-1">
              <Compass className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                Max deviation
              </span>
            </div>
            <p
              className={cn(
                'font-mono text-sm font-semibold',
                SEVERITY_CLASS[horizSeverity]
              )}
            >
              {stats.maxDeviationFeet}
              <span className="text-[10px] font-normal text-muted-foreground">
                {' '}
                ft
              </span>
            </p>
          </div>

          {/* Max altitude deviation */}
          <div className="rounded-md border border-border bg-background/50 p-2">
            <div className="flex items-center gap-1 mb-1">
              <Mountain className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                Max altitude Δ
              </span>
            </div>
            <p
              className={cn(
                'font-mono text-sm font-semibold',
                SEVERITY_CLASS[altSeverity]
              )}
            >
              {stats.maxAltitudeDeviationFeet}
              <span className="text-[10px] font-normal text-muted-foreground">
                {' '}
                ft
              </span>
            </p>
          </div>

          {/* Captured / Planned */}
          <div className="rounded-md border border-border bg-background/50 p-2">
            <div className="flex items-center gap-1 mb-1">
              <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                Captured
              </span>
            </div>
            <p className="font-mono text-sm font-semibold text-foreground">
              {stats.capturedWaypointCount}
              <span className="text-[10px] font-normal text-muted-foreground">
                {' '}
                / {stats.plannedWaypointCount}
              </span>
            </p>
          </div>

          {/* Mean ground speed */}
          <div className="rounded-md border border-border bg-background/50 p-2">
            <div className="flex items-center gap-1 mb-1">
              <Gauge className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                Mean speed
              </span>
            </div>
            <p className="font-mono text-sm font-semibold text-foreground">
              {stats.meanGroundSpeedMph}
              <span className="text-[10px] font-normal text-muted-foreground">
                {' '}
                mph
              </span>
            </p>
          </div>

          {/* Sample count */}
          <div className="rounded-md border border-border bg-background/50 p-2">
            <div className="flex items-center gap-1 mb-1">
              <Sigma className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                Samples
              </span>
            </div>
            <p className="font-mono text-sm font-semibold text-foreground">
              {stats.sampleCount}
            </p>
          </div>
        </div>

        <p className="mt-2 text-[10px] text-muted-foreground">
          Deviation thresholds: <span className="text-green-400">≤ 30 ft</span>{' '}
          · <span className="text-amber-400">30–100 ft</span> ·{' '}
          <span className="text-red-400">&gt; 100 ft</span>
        </p>
      </CardContent>
    </Card>
  );
}
