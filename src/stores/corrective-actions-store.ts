/**
 * Block 5 — Corrective actions store.
 *
 * Reads from `/api/corrective-actions` and supports the basic
 * create / patch / resolve flow used by the inspection detail page,
 * the dashboard summary tile, and (future) the review-panel
 * "Create Corrective Action" affordance.
 */

import { create } from 'zustand';
import type { CorrectiveAction } from '@/types';

export const EMPTY_CORRECTIVE_ACTIONS: CorrectiveAction[] = [];

interface CorrectiveActionsStore {
  byProject: Record<string, CorrectiveAction[]>;
  loadingProjects: Set<string>;
  error: string | null;

  fetchForProject: (projectId: string, status?: string) => Promise<void>;
  fetchForInspection: (projectId: string, inspectionId: string) => Promise<CorrectiveAction[]>;
  create: (payload: Partial<CorrectiveAction> & { projectId: string; description: string; dueDate: string }) => Promise<CorrectiveAction | null>;
  patch: (id: string, projectId: string, patch: Partial<CorrectiveAction>) => Promise<void>;
  markResolved: (
    id: string,
    projectId: string,
    resolution: { resolvedBy: string; resolutionNotes?: string; resolutionPhotoUrl?: string }
  ) => Promise<void>;
}

export const useCorrectiveActionsStore = create<CorrectiveActionsStore>((set, get) => ({
  byProject: {},
  loadingProjects: new Set(),
  error: null,

  fetchForProject: async (projectId, status) => {
    const loading = new Set(get().loadingProjects);
    if (loading.has(projectId)) return;
    loading.add(projectId);
    set({ loadingProjects: loading, error: null });
    try {
      const url = new URL('/api/corrective-actions', window.location.origin);
      url.searchParams.set('projectId', projectId);
      if (status) url.searchParams.set('status', status);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const list = (await res.json()) as CorrectiveAction[];
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

  fetchForInspection: async (projectId, inspectionId) => {
    try {
      const url = new URL('/api/corrective-actions', window.location.origin);
      url.searchParams.set('projectId', projectId);
      url.searchParams.set('inspectionId', inspectionId);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      return (await res.json()) as CorrectiveAction[];
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
      return [];
    }
  },

  create: async (payload) => {
    try {
      const res = await fetch('/api/corrective-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const created = (await res.json()) as CorrectiveAction;
      set((state) => {
        const current = state.byProject[payload.projectId] ?? [];
        return {
          byProject: {
            ...state.byProject,
            [payload.projectId]: [created, ...current],
          },
        };
      });
      return created;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
      return null;
    }
  },

  patch: async (id, projectId, patch) => {
    try {
      const res = await fetch(`/api/corrective-actions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const updated = (await res.json()) as CorrectiveAction;
      set((state) => {
        const current = state.byProject[projectId] ?? [];
        return {
          byProject: {
            ...state.byProject,
            [projectId]: current.map((ca) => (ca.id === id ? updated : ca)),
          },
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  markResolved: async (id, projectId, resolution) => {
    await get().patch(id, projectId, {
      status: 'resolved',
      resolvedBy: resolution.resolvedBy,
      resolutionNotes: resolution.resolutionNotes,
      resolutionPhotoUrl: resolution.resolutionPhotoUrl,
      resolvedAt: new Date().toISOString(),
    });
  },
}));
