'use client';

import { useEffect, useCallback, useRef, useMemo } from 'react';
import { Play, Pause, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { useDroneStore } from '@/stores/drone-store';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { useMissionAIAnalysesStore } from '@/stores/mission-ai-analyses-store';
import { MissionMap } from '@/components/missions/mission-map';
import { DroneMission } from '@/types/drone';

interface FlightReplayProps {
  mission: DroneMission;
}

export function FlightReplay({ mission }: FlightReplayProps) {
  const {
    playbackState,
    playbackSpeed,
    currentWaypointIndex,
    playbackProgress,
    setPlaybackState,
    setPlaybackSpeed,
    setCurrentWaypointIndex,
    setPlaybackProgress,
    resetPlayback,
  } = useDroneStore();

  const checkpoints = useCheckpointStore((s) => s.checkpoints);
  const fetchCheckpoints = useCheckpointStore((s) => s.fetchCheckpoints);

  // Block 4 — read AI analyses for this mission from the persisted store.
  const aiAnalyses = useMissionAIAnalysesStore((s) => s.getForMission(mission.id));
  const fetchAnalyses = useMissionAIAnalysesStore((s) => s.fetchForMission);
  const loadCompletedTrack = useDroneStore((s) => s.loadCompletedMissionTrack);
  const actualSamples = useDroneStore((s) => s.getActualFlightPath(mission.id));
  const hasActualTrack = actualSamples.length >= 2;

  useEffect(() => {
    if (checkpoints.length === 0) fetchCheckpoints();
  }, [checkpoints.length, fetchCheckpoints]);

  // Block 4 — fetch persisted analyses + completed-mission track on mount.
  useEffect(() => {
    fetchAnalyses(mission.id);
    if (mission.status === 'completed') {
      loadCompletedTrack(mission.id);
    }
  }, [mission.id, mission.status, fetchAnalyses, loadCompletedTrack]);

  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Block 4 — when an actual track is available, drive waypoint progress
  // from the recorded samples (so the playhead pauses at the *actual* moment
  // the drone reached each waypoint). Otherwise fall back to the planned path.
  const waypointProgresses = useMemo(() => {
    if (hasActualTrack) {
      const total = actualSamples.length;
      return mission.waypoints.map((wp) => {
        let closestIdx = 0;
        let closestDist = Infinity;
        actualSamples.forEach((s, idx) => {
          const d = Math.abs(s.lng - wp.lng) + Math.abs(s.lat - wp.lat);
          if (d < closestDist) {
            closestDist = d;
            closestIdx = idx;
          }
        });
        return total > 1 ? closestIdx / (total - 1) : 0;
      });
    }
    const totalPathLength = mission.flightPath.length;
    return mission.waypoints.map((wp) => {
      let closestIdx = 0;
      let closestDist = Infinity;
      mission.flightPath.forEach(([lng, lat], idx) => {
        const dist = Math.abs(lng - wp.lng) + Math.abs(lat - wp.lat);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = idx;
        }
      });
      return totalPathLength > 1 ? closestIdx / (totalPathLength - 1) : 0;
    });
  }, [mission.waypoints, mission.flightPath, actualSamples, hasActualTrack]);

  // Block 4 — total flight time string for the scrub-bar tooltip. When an
  // actual track is present, derive from first/last sample timestamps.
  const totalSeconds = useMemo(() => {
    if (!hasActualTrack) return null;
    const first = new Date(actualSamples[0].timestamp).getTime();
    const last = new Date(actualSamples[actualSamples.length - 1].timestamp).getTime();
    return Math.max(0, Math.round((last - first) / 1000));
  }, [actualSamples, hasActualTrack]);

  const animate = useCallback(
    (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const delta = time - lastTimeRef.current;
      lastTimeRef.current = time;

      // Base: complete path in ~20 seconds at 1x
      const baseSpeed = 1 / 20000;
      const speed = baseSpeed * playbackSpeed;
      const newProgress = Math.min(playbackProgress + delta * speed, 1);

      setPlaybackProgress(newProgress);

      // Check if we passed a waypoint
      const nextWpIdx = currentWaypointIndex + 1;
      if (nextWpIdx < waypointProgresses.length) {
        if (newProgress >= waypointProgresses[nextWpIdx]) {
          setCurrentWaypointIndex(nextWpIdx);
          // Brief pause at waypoint (auto-resume after 500ms)
          setPlaybackState('paused');
          setTimeout(() => {
            setPlaybackState('playing');
          }, 800 / playbackSpeed);
          return;
        }
      }

      if (newProgress >= 1) {
        setPlaybackState('idle');
        return;
      }

      animRef.current = requestAnimationFrame(animate);
    },
    [
      playbackProgress,
      playbackSpeed,
      currentWaypointIndex,
      waypointProgresses,
      setPlaybackProgress,
      setCurrentWaypointIndex,
      setPlaybackState,
    ]
  );

  useEffect(() => {
    if (playbackState === 'playing') {
      lastTimeRef.current = 0;
      animRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [playbackState, animate]);

  const currentWaypoint = mission.waypoints[currentWaypointIndex];
  const currentCp = currentWaypoint
    ? checkpoints.find((c) => c.id === currentWaypoint.checkpointId)
    : null;
  // Block 4 — match the persisted analysis by waypoint number (not checkpoint
  // id) so two waypoints visiting the same checkpoint don't collide.
  const currentAnalysis = currentWaypoint
    ? aiAnalyses.find((a) => a.waypointNumber === currentWaypoint.number)
    : null;

  function handlePlayPause() {
    if (playbackState === 'playing') {
      setPlaybackState('paused');
    } else {
      if (playbackProgress >= 1) resetPlayback();
      setPlaybackState('playing');
    }
  }

  function handlePrevWaypoint() {
    const newIdx = Math.max(0, currentWaypointIndex - 1);
    setCurrentWaypointIndex(newIdx);
    setPlaybackProgress(waypointProgresses[newIdx]);
  }

  function handleNextWaypoint() {
    const newIdx = Math.min(mission.waypoints.length - 1, currentWaypointIndex + 1);
    setCurrentWaypointIndex(newIdx);
    setPlaybackProgress(waypointProgresses[newIdx]);
  }

  function handleSelectWaypoint(index: number) {
    setCurrentWaypointIndex(index);
    setPlaybackProgress(waypointProgresses[index]);
    setPlaybackState('paused');
  }

  return (
    <div className="space-y-4">
      {/* Map */}
      <div className="h-[400px] w-full rounded-lg border border-white/5 overflow-hidden">
        <MissionMap
          mission={mission}
          currentWaypointIndex={currentWaypointIndex}
          playbackProgress={playbackProgress}
          onSelectWaypoint={handleSelectWaypoint}
        />
      </div>

      {/* Playback Controls */}
      <Card className="border-border bg-surface">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Play/Pause */}
            <Button
              variant="outline"
              size="icon"
              onClick={handlePlayPause}
              className="shrink-0"
            >
              {playbackState === 'playing' ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>

            {/* Prev / Next */}
            <Button variant="ghost" size="icon-xs" onClick={handlePrevWaypoint}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={handleNextWaypoint}>
              <ChevronRight className="h-4 w-4" />
            </Button>

            {/* Progress bar */}
            <div className="relative min-w-0 flex-1 basis-32 h-2 rounded-full bg-white/5 cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                setPlaybackProgress(Math.max(0, Math.min(1, pct)));
                // Find closest waypoint
                let closest = 0;
                let closestDist = Infinity;
                waypointProgresses.forEach((wp, i) => {
                  if (Math.abs(wp - pct) < closestDist) {
                    closestDist = Math.abs(wp - pct);
                    closest = i;
                  }
                });
                setCurrentWaypointIndex(closest);
                setPlaybackState('paused');
              }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-amber-500"
                style={{ width: `${playbackProgress * 100}%` }}
              />
              {/* Waypoint markers on bar */}
              {waypointProgresses.map((p, i) => (
                <div
                  key={i}
                  className="absolute top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-white/30"
                  style={{ left: `${p * 100}%` }}
                />
              ))}
            </div>

            {/* Speed */}
            <div className="flex items-center gap-1">
              {([1, 2, 4] as const).map((s) => (
                <Button
                  key={s}
                  variant={playbackSpeed === s ? 'default' : 'ghost'}
                  size="xs"
                  onClick={() => setPlaybackSpeed(s)}
                  className="font-mono text-[10px] h-6 px-2"
                >
                  {s}x
                </Button>
              ))}
            </div>

            {/* Reset */}
            <Button variant="ghost" size="icon-xs" onClick={resetPlayback}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Current waypoint info */}
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/5 pt-3 text-xs">
            <span className="text-muted-foreground">
              Waypoint {currentWaypointIndex + 1} of {mission.waypoints.length}
            </span>
            {currentCp && (
              <>
                <span className="font-mono text-foreground">{currentCp.id}</span>
                <span className="text-foreground truncate">{currentCp.name}</span>
                <StatusBadge status={currentCp.status} />
              </>
            )}
            {hasActualTrack && totalSeconds != null && (
              <span className="font-mono text-pink-300/80">
                {actualSamples.length} samples · {totalSeconds}s total
              </span>
            )}
            {currentAnalysis && (
              <span className="ml-auto font-mono text-muted-foreground">
                Claude · {currentAnalysis.confidence}% confidence
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
