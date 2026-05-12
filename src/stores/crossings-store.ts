import { create } from 'zustand';
import type { Crossing } from '@/types/crossing';

interface CrossingsStore {
  crossingsByProject: Record<string, Crossing[]>;
  loading: boolean;
  error: string | null;
  selectedCrossingId: string | null;
  fetchCrossings: (projectId: string) => Promise<void>;
  createCrossing: (crossing: Partial<Crossing>) => Promise<Crossing | null>;
  updateCrossing: (id: string, updates: Partial<Crossing>) => Promise<void>;
  deleteCrossing: (id: string, projectId: string) => Promise<void>;
  setSelected: (id: string | null) => void;
  getForProject: (projectId: string) => Crossing[];
}

export const useCrossingsStore = create<CrossingsStore>((set, get) => ({
  crossingsByProject: {},
  loading: false,
  error: null,
  selectedCrossingId: null,

  fetchCrossings: async (projectId: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/crossings?projectId=${encodeURIComponent(projectId)}`);
      if (!res.ok) throw new Error(`Failed to fetch crossings: ${res.status}`);
      const data = (await res.json()) as Crossing[];
      set((state) => ({
        crossingsByProject: { ...state.crossingsByProject, [projectId]: data },
        loading: false,
      }));
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch crossings',
      });
    }
  },

  createCrossing: async (crossing: Partial<Crossing>) => {
    try {
      const res = await fetch('/api/crossings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(crossing),
      });
      if (!res.ok) throw new Error(`Failed to create crossing: ${res.status}`);
      const created = (await res.json()) as Crossing;
      const projectId = created.projectId;
      set((state) => ({
        crossingsByProject: {
          ...state.crossingsByProject,
          [projectId]: [...(state.crossingsByProject[projectId] ?? []), created],
        },
      }));
      return created;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create crossing' });
      return null;
    }
  },

  updateCrossing: async (id: string, updates: Partial<Crossing>) => {
    try {
      const res = await fetch(`/api/crossings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`Failed to update crossing: ${res.status}`);
      const updated = (await res.json()) as Crossing;
      set((state) => {
        const list = state.crossingsByProject[updated.projectId] ?? [];
        return {
          crossingsByProject: {
            ...state.crossingsByProject,
            [updated.projectId]: list.map((c) => (c.id === id ? updated : c)),
          },
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update crossing' });
    }
  },

  deleteCrossing: async (id: string, projectId: string) => {
    try {
      const res = await fetch(`/api/crossings/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed to delete crossing: ${res.status}`);
      set((state) => {
        const list = state.crossingsByProject[projectId] ?? [];
        return {
          crossingsByProject: {
            ...state.crossingsByProject,
            [projectId]: list.filter((c) => c.id !== id),
          },
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete crossing' });
    }
  },

  setSelected: (id: string | null) => set({ selectedCrossingId: id }),

  getForProject: (projectId: string) => get().crossingsByProject[projectId] ?? [],
}));
