import { create } from 'zustand';
import type { NoFlyZone } from '@/types/nofly-zone';

interface NoFlyZonesStore {
  zonesByProject: Record<string, NoFlyZone[]>;
  loading: boolean;
  error: string | null;
  selectedZoneId: string | null;
  /**
   * Fetch zones for a project. By default returns only active zones to match
   * the validation pipeline. Pass `{ includeInactive: true }` for the CRUD
   * page so admins can see and re-activate disabled zones.
   */
  fetchZones: (projectId: string, opts?: { includeInactive?: boolean }) => Promise<void>;
  createZone: (zone: Partial<NoFlyZone>) => Promise<NoFlyZone | null>;
  updateZone: (id: string, updates: Partial<NoFlyZone>) => Promise<void>;
  deleteZone: (id: string, projectId: string) => Promise<void>;
  toggleActive: (id: string, projectId: string) => Promise<void>;
  setSelected: (id: string | null) => void;
  getForProject: (projectId: string) => NoFlyZone[];
  getActiveForProject: (projectId: string) => NoFlyZone[];
}

export const useNoFlyZonesStore = create<NoFlyZonesStore>((set, get) => ({
  zonesByProject: {},
  loading: false,
  error: null,
  selectedZoneId: null,

  fetchZones: async (projectId: string, opts?: { includeInactive?: boolean }) => {
    set({ loading: true, error: null });
    try {
      const activeParam = opts?.includeInactive ? 'false' : 'true';
      const res = await fetch(
        `/api/nofly-zones?projectId=${encodeURIComponent(projectId)}&active=${activeParam}`
      );
      if (!res.ok) throw new Error(`Failed to fetch no-fly zones: ${res.status}`);
      const data = (await res.json()) as NoFlyZone[];
      set((state) => ({
        zonesByProject: { ...state.zonesByProject, [projectId]: data },
        loading: false,
      }));
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch no-fly zones',
      });
    }
  },

  createZone: async (zone: Partial<NoFlyZone>) => {
    try {
      const res = await fetch('/api/nofly-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zone),
      });
      if (!res.ok) throw new Error(`Failed to create no-fly zone: ${res.status}`);
      const created = (await res.json()) as NoFlyZone;
      const projectId = created.projectId;
      set((state) => ({
        zonesByProject: {
          ...state.zonesByProject,
          [projectId]: [...(state.zonesByProject[projectId] ?? []), created],
        },
      }));
      return created;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create no-fly zone' });
      return null;
    }
  },

  updateZone: async (id: string, updates: Partial<NoFlyZone>) => {
    try {
      const res = await fetch(`/api/nofly-zones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`Failed to update no-fly zone: ${res.status}`);
      const updated = (await res.json()) as NoFlyZone;
      set((state) => {
        const list = state.zonesByProject[updated.projectId] ?? [];
        return {
          zonesByProject: {
            ...state.zonesByProject,
            [updated.projectId]: list.map((z) => (z.id === id ? updated : z)),
          },
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update no-fly zone' });
    }
  },

  deleteZone: async (id: string, projectId: string) => {
    try {
      const res = await fetch(`/api/nofly-zones/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed to delete no-fly zone: ${res.status}`);
      set((state) => {
        const list = state.zonesByProject[projectId] ?? [];
        return {
          zonesByProject: {
            ...state.zonesByProject,
            [projectId]: list.filter((z) => z.id !== id),
          },
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete no-fly zone' });
    }
  },

  toggleActive: async (id: string, projectId: string) => {
    const list = get().zonesByProject[projectId] ?? [];
    const target = list.find((z) => z.id === id);
    if (!target) return;
    await get().updateZone(id, { active: !target.active });
  },

  setSelected: (id: string | null) => set({ selectedZoneId: id }),

  getForProject: (projectId: string) => get().zonesByProject[projectId] ?? [],

  getActiveForProject: (projectId: string) =>
    (get().zonesByProject[projectId] ?? []).filter((z) => z.active),
}));
