import { create } from 'zustand';
import type { DroneMission, DroneTelemetry, DroneTelemetrySample, QSPReviewDecision, QSPReviewEntry, ReportReadiness } from '@/types';
import type { CheckpointStatus } from '@/types/checkpoint';
import { droneMissions as staticMissions } from '@/data/drone-missions';

const TELEMETRY_HISTORY_LIMIT = 60; // ~1 minute at 1 Hz

// Block 4: stable-ref empty array for selectors that read actualFlightPathByMission
const EMPTY_SAMPLES: readonly DroneTelemetrySample[] = Object.freeze([]);

interface DroneStore {
  missions: DroneMission[];
  selectedMissionId: string | null;
  playbackState: 'idle' | 'playing' | 'paused';
  playbackSpeed: 1 | 2 | 4;
  currentWaypointIndex: number;
  playbackProgress: number;
  loading: boolean;
  error: string | null;
  // Mission Control: live telemetry
  telemetry: DroneTelemetry | null;
  telemetryHistory: DroneTelemetry[];
  // Mission Control: QSP checkpoint reviews
  // @deprecated Block 4 — use useMissionQSPReviewsStore instead. Kept here for
  // back-compat with components that haven't migrated yet (ReportReadinessGate).
  checkpointReviews: Record<string, QSPReviewEntry>;
  // Block 4: persisted actual flight track per mission
  actualFlightPathByMission: Record<string, DroneTelemetrySample[]>;
  // Existing actions
  setSelectedMission: (id: string | null) => void;
  setPlaybackState: (state: 'idle' | 'playing' | 'paused') => void;
  setPlaybackSpeed: (speed: 1 | 2 | 4) => void;
  setCurrentWaypointIndex: (index: number) => void;
  setPlaybackProgress: (progress: number) => void;
  resetPlayback: () => void;
  addMission: (mission: DroneMission) => void;
  updateMission: (id: string, updates: Partial<DroneMission>) => void;
  fetchMissions: () => Promise<void>;
  // Mission Control actions
  setTelemetry: (t: DroneTelemetry) => void;
  clearTelemetry: () => void;
  setReviewDecision: (
    checkpointId: string,
    waypointNumber: number,
    aiAnalysis: QSPReviewEntry['aiAnalysis'],
    decision: QSPReviewDecision,
    overrideStatus?: CheckpointStatus,
    overrideNotes?: string
  ) => void;
  clearReviews: () => void;
  getReportReadiness: (missionId: string) => ReportReadiness;
  // Block 4: actual flight track persistence
  setActualFlightPath: (missionId: string, samples: DroneTelemetrySample[]) => void;
  getActualFlightPath: (missionId: string) => readonly DroneTelemetrySample[];
  loadCompletedMissionTrack: (missionId: string) => Promise<void>;
}

export const useDroneStore = create<DroneStore>((set, get) => ({
  // Seed with static demo missions so /missions and /missions/[id] render
  // immediately and stay populated when /api/missions is unavailable.
  missions: staticMissions,
  selectedMissionId: staticMissions.length > 0 ? staticMissions[0].id : null,
  playbackState: 'idle',
  playbackSpeed: 1,
  currentWaypointIndex: 0,
  playbackProgress: 0,
  loading: false,
  error: null,
  telemetry: null,
  telemetryHistory: [],
  checkpointReviews: {},
  actualFlightPathByMission: {},
  setSelectedMission: (id) => set({ selectedMissionId: id }),
  setPlaybackState: (playbackState) => set({ playbackState }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setCurrentWaypointIndex: (currentWaypointIndex) => set({ currentWaypointIndex }),
  setPlaybackProgress: (playbackProgress) => set({ playbackProgress }),
  resetPlayback: () =>
    set({ playbackState: 'idle', currentWaypointIndex: 0, playbackProgress: 0 }),
  addMission: (mission) =>
    set((state) => ({
      missions: [mission, ...state.missions.filter((m) => m.id !== mission.id)],
      selectedMissionId: mission.id,
    })),
  updateMission: (id, updates) =>
    set((state) => ({
      missions: state.missions.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),
  fetchMissions: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const { useProjectStore } = await import('./project-store');
      const projectId = useProjectStore.getState().currentProjectId;
      const res = await fetch(`/api/missions?projectId=${projectId}`);
      if (!res.ok) throw new Error('Failed to fetch missions');
      const data = await res.json();
      // Keep static demo missions visible if the API has no data (unseeded DB).
      const next = Array.isArray(data) && data.length > 0 ? data : staticMissions;
      set({
        missions: next,
        selectedMissionId: next.length > 0 ? next[0].id : null,
        loading: false,
      });
    } catch {
      // Fall back to static demo missions when the API is unavailable.
      set({
        missions: staticMissions,
        selectedMissionId: staticMissions.length > 0 ? staticMissions[0].id : null,
        loading: false,
        error: null,
      });
    }
  },

  // --- Mission Control: telemetry ---

  setTelemetry: (t) =>
    set((state) => ({
      telemetry: t,
      telemetryHistory: [
        ...state.telemetryHistory.slice(-(TELEMETRY_HISTORY_LIMIT - 1)),
        t,
      ],
    })),
  clearTelemetry: () => set({ telemetry: null, telemetryHistory: [] }),

  // --- Mission Control: QSP reviews ---

  setReviewDecision: (checkpointId, waypointNumber, aiAnalysis, decision, overrideStatus, overrideNotes) =>
    set((state) => ({
      checkpointReviews: {
        ...state.checkpointReviews,
        [checkpointId]: {
          checkpointId,
          waypointNumber,
          aiAnalysis,
          decision,
          overrideStatus: decision === 'override' ? overrideStatus : undefined,
          overrideNotes: decision === 'override' ? overrideNotes : undefined,
          reviewedAt: decision !== 'pending' ? new Date().toISOString() : undefined,
        },
      },
    })),
  clearReviews: () => set({ checkpointReviews: {} }),
  getReportReadiness: (missionId) => {
    const state = get();
    const mission = state.missions.find((m) => m.id === missionId);
    if (!mission) return 'not-ready';

    const enabledWaypoints = mission.waypoints.filter((wp) => wp.enabled !== false);
    if (enabledWaypoints.length === 0) return 'not-ready';

    const reviewed = enabledWaypoints.filter(
      (wp) => {
        const review = state.checkpointReviews[wp.checkpointId];
        return review && review.decision !== 'pending';
      }
    );

    if (reviewed.length === 0) return 'not-ready';
    if (reviewed.length < enabledWaypoints.length) return 'partially-reviewed';
    return 'ready';
  },

  // --- Block 4: persisted actual flight track ---

  setActualFlightPath: (missionId, samples) =>
    set((state) => ({
      actualFlightPathByMission: {
        ...state.actualFlightPathByMission,
        [missionId]: samples,
      },
    })),

  getActualFlightPath: (missionId) =>
    get().actualFlightPathByMission[missionId] ?? EMPTY_SAMPLES,

  loadCompletedMissionTrack: async (missionId) => {
    if (get().actualFlightPathByMission[missionId]) return;
    try {
      const res = await fetch(`/api/missions/${missionId}`);
      if (!res.ok) return;
      const data = await res.json();
      const samples: DroneTelemetrySample[] = Array.isArray(data?.actualFlightPath)
        ? data.actualFlightPath
        : [];
      set((state) => ({
        actualFlightPathByMission: {
          ...state.actualFlightPathByMission,
          [missionId]: samples,
        },
        // Mirror the new fields onto the in-memory mission record so other
        // components reading mission.actualFlightPath stay in sync.
        missions: state.missions.map((m) =>
          m.id === missionId
            ? {
                ...m,
                actualFlightPath: samples,
                completedAt: data?.completedAt ?? m.completedAt,
                totalFlightSeconds: data?.totalFlightSeconds ?? m.totalFlightSeconds,
              }
            : m
        ),
      }));
    } catch {
      // Mock fallback — leave the store empty so the UI just hides the overlay
    }
  },
}));
