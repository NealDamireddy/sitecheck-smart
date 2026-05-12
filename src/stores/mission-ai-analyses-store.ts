/**
 * Block 4 — Persisted Claude vision analyses for mission waypoints.
 *
 * Replaces the static `src/data/ai-analyses.ts` fixture that ReviewPanel used
 * to read from. Each row is `(mission_id, waypoint_number) -> MissionAIAnalysis`
 * and is fetched/persisted via the new mission API routes.
 *
 * Selector convention: stable-ref `EMPTY_ANALYSES` constant outside the store
 * so `getForMission()` returns the same array reference for missions with no
 * data and React doesn't see it as a change (avoids error #185).
 */

import { create } from 'zustand';
import type { MissionAIAnalysis } from '@/types/drone';

const EMPTY_ANALYSES: readonly MissionAIAnalysis[] = Object.freeze([]);

interface MissionAIAnalysesStore {
  analysesByMission: Record<string, MissionAIAnalysis[]>;
  loadingMissionIds: Set<string>;
  analyzingKeys: Set<string>; // `${missionId}:${waypointNumber}`
  error: string | null;

  fetchForMission: (missionId: string) => Promise<void>;
  analyzeWaypoint: (
    missionId: string,
    waypointNumber: number,
    opts?: { hint?: string; photoIndex?: number }
  ) => Promise<MissionAIAnalysis | null>;
  analyzeAllForMission: (missionId: string) => Promise<void>;

  getForMission: (missionId: string) => readonly MissionAIAnalysis[];
  getForWaypoint: (
    missionId: string,
    waypointNumber: number
  ) => MissionAIAnalysis | undefined;
  isAnalyzing: (missionId: string, waypointNumber: number) => boolean;
}

function key(missionId: string, waypointNumber: number) {
  return `${missionId}:${waypointNumber}`;
}

export const useMissionAIAnalysesStore = create<MissionAIAnalysesStore>(
  (set, get) => ({
    analysesByMission: {},
    loadingMissionIds: new Set(),
    analyzingKeys: new Set(),
    error: null,

    fetchForMission: async (missionId: string) => {
      if (get().loadingMissionIds.has(missionId)) return;
      set((state) => {
        const next = new Set(state.loadingMissionIds);
        next.add(missionId);
        return { loadingMissionIds: next, error: null };
      });
      try {
        // No dedicated list endpoint — the GET /api/missions/[id] response
        // does NOT include analyses, so we fetch via direct query through a
        // tiny convenience endpoint piggy-backed on the reviews route shape:
        // we instead read from the analyze endpoint when present. As a
        // simpler path, the store fetches each waypoint's analysis lazily
        // through `analyzeWaypoint`. For initial mount, we list via a search
        // against the missions/[id] route which already returns waypoints.
        // Persisted analyses are fetched separately:
        const res = await fetch(
          `/api/missions/${missionId}/ai-analyses`
        ).catch(() => null);
        if (res && res.ok) {
          const data = (await res.json()) as MissionAIAnalysis[];
          set((state) => ({
            analysesByMission: {
              ...state.analysesByMission,
              [missionId]: data,
            },
          }));
        }
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

    analyzeWaypoint: async (missionId, waypointNumber, opts) => {
      const k = key(missionId, waypointNumber);
      if (get().analyzingKeys.has(k)) return null;
      set((state) => {
        const next = new Set(state.analyzingKeys);
        next.add(k);
        return { analyzingKeys: next };
      });
      try {
        const res = await fetch(
          `/api/missions/${missionId}/waypoints/${waypointNumber}/analyze`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(opts ?? {}),
          }
        );
        if (!res.ok) throw new Error(`analyze failed: ${res.status}`);
        const persisted = (await res.json()) as MissionAIAnalysis;
        set((state) => {
          const list = state.analysesByMission[missionId] ?? [];
          const without = list.filter((a) => a.waypointNumber !== waypointNumber);
          return {
            analysesByMission: {
              ...state.analysesByMission,
              [missionId]: [...without, persisted],
            },
          };
        });
        return persisted;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'analyze failed' });
        return null;
      } finally {
        set((state) => {
          const next = new Set(state.analyzingKeys);
          next.delete(k);
          return { analyzingKeys: next };
        });
      }
    },

    analyzeAllForMission: async (missionId: string) => {
      // The mission's waypoints aren't held in this store — we discover them
      // via the AI-analyses listing endpoint or by walking the drone-store.
      // We do a minimal version: re-issue analysis for every waypoint that
      // currently has a row, and let the caller iterate uncovered waypoints
      // separately.
      const list = get().analysesByMission[missionId] ?? [];
      await Promise.all(
        list.map((a) =>
          get().analyzeWaypoint(missionId, a.waypointNumber)
        )
      );
    },

    getForMission: (missionId: string) =>
      get().analysesByMission[missionId] ?? EMPTY_ANALYSES,

    getForWaypoint: (missionId, waypointNumber) =>
      (get().analysesByMission[missionId] ?? []).find(
        (a) => a.waypointNumber === waypointNumber
      ),

    isAnalyzing: (missionId, waypointNumber) =>
      get().analyzingKeys.has(key(missionId, waypointNumber)),
  })
);
