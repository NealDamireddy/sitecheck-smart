/**
 * Monitoring locations store.
 *
 * Locations are project fixtures, not per-event. The capture screen
 * reads `byProject[projectId]` filtered to `status='active'`.
 *
 * Convention matches corrective-actions-store: byProject for lists,
 * loadingProjects gates concurrent fetches, stable EMPTY constant
 * lives outside selectors.
 */

import { create } from 'zustand';
import type { MonitoringLocation } from '@/types';

export const EMPTY_MONITORING_LOCATIONS: MonitoringLocation[] = [];

interface MonitoringLocationsStore {
  byProject: Record<string, MonitoringLocation[]>;
  loadingProjects: Set<string>;
  error: string | null;

  fetchForProject: (projectId: string) => Promise<void>;
  create: (
    payload: Partial<MonitoringLocation> & {
      projectId: string;
      name: string;
      drainageArea: string;
      dischargePointType: MonitoringLocation['dischargePointType'];
    },
  ) => Promise<MonitoringLocation | null>;
  update: (
    id: string,
    projectId: string,
    patch: Partial<MonitoringLocation>,
  ) => Promise<void>;
  remove: (id: string, projectId: string) => Promise<void>;
}

export const useMonitoringLocationsStore = create<MonitoringLocationsStore>((set, get) => ({
  byProject: {},
  loadingProjects: new Set(),
  error: null,

  fetchForProject: async (projectId) => {
    const loading = new Set(get().loadingProjects);
    if (loading.has(projectId)) return;
    loading.add(projectId);
    set({ loadingProjects: loading, error: null });
    try {
      const url = new URL('/api/monitoring-locations', window.location.origin);
      url.searchParams.set('projectId', projectId);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Failed to fetch monitoring locations (${res.status})`);
      const list = (await res.json()) as MonitoringLocation[];
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

  create: async (payload) => {
    try {
      const res = await fetch('/api/monitoring-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Failed to create monitoring location (${res.status})`);
      const created = (await res.json()) as MonitoringLocation;
      set((state) => {
        const current = state.byProject[payload.projectId] ?? [];
        return {
          byProject: {
            ...state.byProject,
            [payload.projectId]: [...current, created],
          },
        };
      });
      return created;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
      return null;
    }
  },

  update: async (id, projectId, patch) => {
    try {
      const res = await fetch(`/api/monitoring-locations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`Failed to update monitoring location (${res.status})`);
      const updated = (await res.json()) as MonitoringLocation;
      set((state) => {
        const current = state.byProject[projectId] ?? [];
        return {
          byProject: {
            ...state.byProject,
            [projectId]: current.map((m) => (m.id === id ? updated : m)),
          },
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  remove: async (id, projectId) => {
    try {
      const res = await fetch(`/api/monitoring-locations/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`Failed to delete monitoring location (${res.status})`);
      set((state) => {
        const current = state.byProject[projectId] ?? [];
        return {
          byProject: {
            ...state.byProject,
            [projectId]: current.filter((m) => m.id !== id),
          },
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },
}));
