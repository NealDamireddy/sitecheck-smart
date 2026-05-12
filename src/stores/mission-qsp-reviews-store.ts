/**
 * Block 4 — Persisted QSP review decisions for mission waypoints.
 *
 * Replaces the in-memory `checkpointReviews` map in `useDroneStore`. Each row
 * is `(mission_id, waypoint_number) -> ReviewEntry` and is fetched/persisted
 * via `/api/missions/[id]/reviews`.
 *
 * Selector convention: stable-ref `EMPTY_MAP` constant to avoid React error
 * #185 on missions that have no reviews yet.
 */

import { create } from 'zustand';
import type { CheckpointStatus } from '@/types/checkpoint';
import type { QSPReviewDecision } from '@/types/drone';

export interface PersistedReview {
  id: string;
  missionId: string;
  waypointNumber: number;
  checkpointId: string;
  decision: QSPReviewDecision;
  overrideStatus?: CheckpointStatus;
  overrideNotes?: string;
  aiAnalysisId?: string;
  reviewedAt?: string;
}

const EMPTY_MAP: Readonly<Record<number, PersistedReview>> = Object.freeze({});

interface MissionQSPReviewsStore {
  reviewsByMission: Record<string, Record<number, PersistedReview>>;
  loadingMissionIds: Set<string>;
  error: string | null;

  fetchForMission: (missionId: string) => Promise<void>;
  setDecision: (
    missionId: string,
    waypointNumber: number,
    checkpointId: string,
    decision: QSPReviewDecision,
    overrideStatus?: CheckpointStatus,
    overrideNotes?: string,
    aiAnalysisId?: string
  ) => Promise<void>;

  getForMission: (missionId: string) => Readonly<Record<number, PersistedReview>>;
  getForWaypoint: (
    missionId: string,
    waypointNumber: number
  ) => PersistedReview | undefined;
}

export const useMissionQSPReviewsStore = create<MissionQSPReviewsStore>(
  (set, get) => ({
    reviewsByMission: {},
    loadingMissionIds: new Set(),
    error: null,

    fetchForMission: async (missionId: string) => {
      if (get().loadingMissionIds.has(missionId)) return;
      set((state) => {
        const next = new Set(state.loadingMissionIds);
        next.add(missionId);
        return { loadingMissionIds: next, error: null };
      });
      try {
        const res = await fetch(`/api/missions/${missionId}/reviews`);
        if (!res.ok) throw new Error(`fetch reviews failed: ${res.status}`);
        const data = (await res.json()) as PersistedReview[];
        const map: Record<number, PersistedReview> = {};
        for (const r of data) {
          map[r.waypointNumber] = r;
        }
        set((state) => ({
          reviewsByMission: { ...state.reviewsByMission, [missionId]: map },
        }));
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'fetch failed' });
      } finally {
        set((state) => {
          const next = new Set(state.loadingMissionIds);
          next.delete(missionId);
          return { loadingMissionIds: next };
        });
      }
    },

    setDecision: async (
      missionId,
      waypointNumber,
      checkpointId,
      decision,
      overrideStatus,
      overrideNotes,
      aiAnalysisId
    ) => {
      try {
        const res = await fetch(`/api/missions/${missionId}/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            waypointNumber,
            checkpointId,
            decision,
            overrideStatus,
            overrideNotes,
            aiAnalysisId,
          }),
        });
        if (!res.ok) throw new Error(`set decision failed: ${res.status}`);
        const persisted = (await res.json()) as PersistedReview;
        set((state) => {
          const cur = state.reviewsByMission[missionId] ?? {};
          return {
            reviewsByMission: {
              ...state.reviewsByMission,
              [missionId]: { ...cur, [waypointNumber]: persisted },
            },
          };
        });
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'set decision failed' });
      }
    },

    getForMission: (missionId: string) =>
      get().reviewsByMission[missionId] ?? EMPTY_MAP,

    getForWaypoint: (missionId, waypointNumber) =>
      (get().reviewsByMission[missionId] ?? {})[waypointNumber],
  })
);
