import { create } from 'zustand';
import type { Geofence } from '@/types/geofence';

interface GeofenceStore {
  geofencesByProject: Record<string, Geofence[]>;
  loading: boolean;
  error: string | null;
  fetchGeofences: (projectId: string) => Promise<void>;
  createGeofence: (geofence: Partial<Geofence>) => Promise<Geofence | null>;
  updateGeofence: (id: string, updates: Partial<Geofence>) => Promise<void>;
  deleteGeofence: (id: string, projectId: string) => Promise<void>;
  getForProject: (projectId: string) => Geofence[];
  /** Convenience: returns the first geofence for a project (single-fence model). */
  getPrimary: (projectId: string) => Geofence | undefined;
}

export const useGeofenceStore = create<GeofenceStore>((set, get) => ({
  geofencesByProject: {},
  loading: false,
  error: null,

  fetchGeofences: async (projectId: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/geofences?projectId=${encodeURIComponent(projectId)}`);
      if (!res.ok) throw new Error(`Failed to fetch geofences: ${res.status}`);
      const data = (await res.json()) as Geofence[];
      set((state) => ({
        geofencesByProject: { ...state.geofencesByProject, [projectId]: data },
        loading: false,
      }));
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch geofences',
      });
    }
  },

  createGeofence: async (geofence: Partial<Geofence>) => {
    try {
      const res = await fetch('/api/geofences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geofence),
      });
      if (!res.ok) throw new Error(`Failed to create geofence: ${res.status}`);
      const created = (await res.json()) as Geofence;
      const projectId = created.projectId;
      set((state) => ({
        geofencesByProject: {
          ...state.geofencesByProject,
          [projectId]: [...(state.geofencesByProject[projectId] ?? []), created],
        },
      }));
      return created;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create geofence' });
      return null;
    }
  },

  updateGeofence: async (id: string, updates: Partial<Geofence>) => {
    try {
      const res = await fetch(`/api/geofences/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`Failed to update geofence: ${res.status}`);
      const updated = (await res.json()) as Geofence;
      set((state) => {
        const list = state.geofencesByProject[updated.projectId] ?? [];
        return {
          geofencesByProject: {
            ...state.geofencesByProject,
            [updated.projectId]: list.map((g) => (g.id === id ? updated : g)),
          },
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update geofence' });
    }
  },

  deleteGeofence: async (id: string, projectId: string) => {
    try {
      const res = await fetch(`/api/geofences/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed to delete geofence: ${res.status}`);
      set((state) => {
        const list = state.geofencesByProject[projectId] ?? [];
        return {
          geofencesByProject: {
            ...state.geofencesByProject,
            [projectId]: list.filter((g) => g.id !== id),
          },
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete geofence' });
    }
  },

  getForProject: (projectId: string) => get().geofencesByProject[projectId] ?? [],

  getPrimary: (projectId: string) => {
    const list = get().geofencesByProject[projectId];
    return list && list.length > 0 ? list[0] : undefined;
  },
}));
