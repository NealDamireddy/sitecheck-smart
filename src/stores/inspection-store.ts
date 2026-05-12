/**
 * Block 5 — Inspection records store.
 *
 * Powers the new /inspections list + /inspections/[id] detail pages.
 * Reads from `/api/inspections` (Block 1 + Block 5 fields blended) and
 * supports the Block 5 patch / submit / link-mission actions.
 *
 * Convention reused from drone-store / corrective-actions-store / etc:
 * stable empty constants live outside React selectors so consumers don't
 * trip React error #185.
 */

import { create } from 'zustand';
import type { Inspection } from '@/types';

export const EMPTY_INSPECTION_LIST: Inspection[] = [];

interface InspectionDetail {
  inspection: Inspection | null;
  findings: unknown[];
  aiAnalyses: unknown[];
  qspReviews: unknown[];
  correctiveActions: unknown[];
}

interface InspectionStore {
  byProject: Record<string, Inspection[]>;
  detailById: Record<string, InspectionDetail>;
  loadingProjects: Set<string>;
  loadingDetails: Set<string>;
  error: string | null;

  fetchForProject: (projectId: string, status?: string) => Promise<void>;
  fetchById: (inspectionId: string) => Promise<void>;
  patchInspection: (
    inspectionId: string,
    patch: Partial<Pick<Inspection, 'narrative' | 'inspector' | 'status' | 'dueBy' | 'reportId'>>
  ) => Promise<void>;
  submitInspection: (inspectionId: string, reportId?: string | null) => Promise<void>;
  addMission: (inspectionId: string, missionId: string) => Promise<void>;
  removeMission: (inspectionId: string, missionId: string) => Promise<void>;
}

export const useInspectionStore = create<InspectionStore>((set, get) => ({
  byProject: {},
  detailById: {},
  loadingProjects: new Set(),
  loadingDetails: new Set(),
  error: null,

  fetchForProject: async (projectId, status) => {
    const loading = new Set(get().loadingProjects);
    if (loading.has(projectId)) return;
    loading.add(projectId);
    set({ loadingProjects: loading, error: null });
    try {
      const url = new URL('/api/inspections', window.location.origin);
      url.searchParams.set('projectId', projectId);
      if (status) url.searchParams.set('status', status);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Failed to fetch inspections (${res.status})`);
      const list = (await res.json()) as Inspection[];
      set((state) => ({
        byProject: { ...state.byProject, [projectId]: list },
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      const next = new Set(get().loadingProjects);
      next.delete(projectId);
      set({ loadingProjects: next });
    }
  },

  fetchById: async (inspectionId) => {
    const loading = new Set(get().loadingDetails);
    if (loading.has(inspectionId)) return;
    loading.add(inspectionId);
    set({ loadingDetails: loading, error: null });
    try {
      const res = await fetch(`/api/inspections/${inspectionId}`);
      if (!res.ok) throw new Error(`Failed to fetch inspection (${res.status})`);
      const data = await res.json();
      set((state) => ({
        detailById: {
          ...state.detailById,
          [inspectionId]: {
            inspection: data.inspection ?? data,
            findings: data.findings ?? [],
            aiAnalyses: data.aiAnalyses ?? [],
            qspReviews: data.qspReviews ?? [],
            correctiveActions: data.correctiveActions ?? [],
          },
        },
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      const next = new Set(get().loadingDetails);
      next.delete(inspectionId);
      set({ loadingDetails: next });
    }
  },

  patchInspection: async (inspectionId, patch) => {
    try {
      const res = await fetch(`/api/inspections/${inspectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`Failed to patch inspection (${res.status})`);
      // Refresh detail.
      await get().fetchById(inspectionId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  submitInspection: async (inspectionId, reportId) => {
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportId ? { reportId } : {}),
      });
      if (!res.ok) throw new Error(`Failed to submit inspection (${res.status})`);
      await get().fetchById(inspectionId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  addMission: async (inspectionId, missionId) => {
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/missions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId }),
      });
      if (!res.ok) throw new Error(`Failed to add mission (${res.status})`);
      await get().fetchById(inspectionId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  removeMission: async (inspectionId, missionId) => {
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/missions/${missionId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error(`Failed to remove mission (${res.status})`);
      await get().fetchById(inspectionId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },
}));
