'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Square,
  Home,
  AlertOctagon,
  Gamepad2,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FlightStatusIndicator } from './flight-status-indicator';
import { ManualOverrideBar } from './manual-override-bar';
import { getDroneProvider } from '@/lib/drone-provider';
import { useDroneStore } from '@/stores/drone-store';
import type { DroneMission, MissionStatus, FlightControlAction } from '@/types/drone';

interface FlightControlPanelProps {
  mission: DroneMission;
}

export function FlightControlPanel({ mission }: FlightControlPanelProps) {
  const { updateMission, currentWaypointIndex } = useDroneStore();
  const [loading, setLoading] = useState<FlightControlAction | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completing, setCompleting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = mission.status === 'in-progress';
  const isPaused = mission.status === 'paused';
  const isReturning = mission.status === 'returning-home';
  const isManual = mission.manualOverrideActive === true;

  // Block 4 — manual Complete Mission button. Visible only while the mission
  // is in flight AND at least one waypoint has been captured. Idempotent on
  // the server side.
  const hasAnyCapture = mission.waypoints.some(
    (wp) => wp.captureStatus === 'captured'
  );
  const canComplete =
    (isActive || isPaused || isReturning) && hasAnyCapture;

  const handleCompleteMission = useCallback(async () => {
    const confirmed = window.confirm(
      'Mark this mission complete? Captured photos will be analyzed by Claude. Uncaptured waypoints will be left as skipped.'
    );
    if (!confirmed) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/missions/${mission.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'manual' }),
      });
      if (res.ok) {
        const data = await res.json();
        updateMission(mission.id, {
          status: 'completed',
          completedAt: data?.completedAt,
          totalFlightSeconds: data?.totalFlightSeconds,
          actualFlightPath: Array.isArray(data?.actualFlightPath)
            ? data.actualFlightPath
            : undefined,
        });

        await fetch('/api/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'drone',
            title: `Mission completed (manual)`,
            description: `Mission "${mission.name}" — manually completed`,
            severity: 'info',
            linkedEntityId: mission.id,
            linkedEntityType: 'mission',
            metadata: {
              action: 'mission-completed',
              trigger: 'manual',
              missionId: mission.id,
              timestamp: new Date().toISOString(),
            },
          }),
        }).catch(() => {});
      }
    } catch {
      // Network failure — leave the mission in its current status.
    } finally {
      setCompleting(false);
    }
  }, [mission.id, mission.name, updateMission]);

  // Elapsed time counter
  useEffect(() => {
    if (isActive || isReturning) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, isReturning]);

  const executeAction = useCallback(
    async (action: FlightControlAction) => {
      setLoading(action);
      const provider = getDroneProvider();

      try {
        let newStatus: MissionStatus = mission.status;
        let manualOverride = mission.manualOverrideActive ?? false;

        switch (action) {
          case 'start':
            await provider.startMission(mission.id);
            newStatus = 'in-progress';
            setElapsedSeconds(0);
            break;
          case 'pause':
            await provider.pauseMission(mission.id);
            newStatus = 'paused';
            break;
          case 'resume':
            await provider.resumeMission(mission.id);
            newStatus = 'in-progress';
            break;
          case 'stop':
            await provider.stopMission(mission.id);
            newStatus = 'aborted';
            break;
          case 'return-home':
            await provider.returnHome(mission.id);
            newStatus = 'returning-home';
            break;
          case 'emergency-hold':
            await provider.emergencyHold(mission.id);
            newStatus = 'paused';
            break;
          case 'manual-takeover':
            await provider.manualTakeover(mission.id);
            manualOverride = true;
            break;
          case 'resume-mission':
            await provider.resumeFromManual(mission.id);
            manualOverride = false;
            newStatus = 'in-progress';
            break;
        }

        // Update local store
        updateMission(mission.id, {
          status: newStatus,
          manualOverrideActive: manualOverride,
          lastCompletedWaypoint: currentWaypointIndex,
        });

        // Persist to API
        await fetch(`/api/missions/${mission.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: newStatus,
            manualOverrideActive: manualOverride,
            lastCompletedWaypoint: currentWaypointIndex,
          }),
        }).catch((err) => console.warn('Failed to persist flight action:', err));

        // Log audit event
        await fetch('/api/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'drone',
            title: `Flight: ${action.replace(/-/g, ' ')}`,
            description: `Mission "${mission.name}" — ${action.replace(/-/g, ' ')}`,
            severity: ['emergency-hold', 'stop'].includes(action) ? 'critical'
              : ['pause', 'return-home', 'manual-takeover'].includes(action) ? 'warning'
              : 'info',
            linkedEntityId: mission.id,
            linkedEntityType: 'mission',
            metadata: {
              action,
              missionId: mission.id,
              previousStatus: mission.status,
              newStatus,
              waypointIndex: currentWaypointIndex,
              timestamp: new Date().toISOString(),
            },
          }),
        }).catch((err) => console.warn('Failed to log audit event:', err));
      } finally {
        setLoading(null);
      }
    },
    [mission, currentWaypointIndex, updateMission]
  );

  const isLoading = (action: FlightControlAction) => loading === action;

  return (
    <Card className="border-border bg-surface">
      <CardContent className="pt-4 space-y-3">
        {/* Status bar */}
        <FlightStatusIndicator
          mission={mission}
          elapsedSeconds={elapsedSeconds}
          currentWaypointIndex={currentWaypointIndex}
        />

        {/* Manual override banner */}
        {isManual && (
          <ManualOverrideBar
            missionId={mission.id}
            currentWaypointNumber={mission.waypoints[currentWaypointIndex]?.number ?? 1}
            onResumeMission={() => executeAction('resume-mission')}
            disabled={loading !== null}
          />
        )}

        {/* Control buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Start button (only for planned missions) */}
          {mission.status === 'planned' && (
            <Button
              size="sm"
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => executeAction('start')}
              disabled={loading !== null}
            >
              {isLoading('start') ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Launch Mission
            </Button>
          )}

          {/* Pause / Resume */}
          {(isActive || isPaused) && !isManual && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => executeAction(isActive ? 'pause' : 'resume')}
              disabled={loading !== null}
            >
              {isLoading('pause') || isLoading('resume') ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isActive ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {isActive ? 'Pause' : 'Resume'}
            </Button>
          )}

          {/* Stop */}
          {(isActive || isPaused || isReturning) && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={() => executeAction('stop')}
              disabled={loading !== null}
            >
              {isLoading('stop') ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              Abort
            </Button>
          )}

          {/* Return Home — prominent */}
          {(isActive || isPaused) && (
            <Button
              size="sm"
              className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => executeAction('return-home')}
              disabled={loading !== null}
            >
              {isLoading('return-home') ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Home className="h-3.5 w-3.5" />
              )}
              Return Home
            </Button>
          )}

          {/* Block 4 — manual Complete Mission */}
          {canComplete && (
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleCompleteMission}
              disabled={completing || loading !== null}
              title="Mark this mission complete and trigger Claude analysis on captured photos"
            >
              {completing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Complete Mission
            </Button>
          )}

          {/* Emergency Hold */}
          {isActive && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={() => executeAction('emergency-hold')}
              disabled={loading !== null}
            >
              {isLoading('emergency-hold') ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <AlertOctagon className="h-3.5 w-3.5" />
              )}
              Emergency Hold
            </Button>
          )}

          {/* Manual Takeover */}
          {isActive && !isManual && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
              onClick={() => executeAction('manual-takeover')}
              disabled={loading !== null}
            >
              {isLoading('manual-takeover') ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Gamepad2 className="h-3.5 w-3.5" />
              )}
              Manual Control
            </Button>
          )}
        </div>

        {/* Resume from breakpoint info */}
        {isPaused && mission.lastCompletedWaypoint != null && mission.lastCompletedWaypoint > 0 && (
          <p className="text-[10px] text-muted-foreground">
            Will resume from waypoint {mission.lastCompletedWaypoint + 1} of{' '}
            {mission.waypoints.length}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
