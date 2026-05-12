import { create } from 'zustand';
import type { SegmentPermit } from '@/types/permit';

interface PermitsStore {
  permitsByProject: Record<string, SegmentPermit[]>;
  loading: boolean;
  error: string | null;
  fetchPermits: (projectId: string) => Promise<void>;
  getForProject: (projectId: string) => SegmentPermit[];
  expiringCount: (projectId: string) => number;
}

export const usePermitsStore = create<PermitsStore>((set, get) => ({
  permitsByProject: {},
  loading: false,
  error: null,

  fetchPermits: async (projectId: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/permits?projectId=${encodeURIComponent(projectId)}`);
      if (!res.ok) throw new Error(`Failed to fetch permits: ${res.status}`);
      const data = (await res.json()) as SegmentPermit[];
      set((state) => ({
        permitsByProject: { ...state.permitsByProject, [projectId]: data },
        loading: false,
      }));
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch permits',
      });
    }
  },

  getForProject: (projectId: string) => get().permitsByProject[projectId] ?? [],

  expiringCount: (projectId: string) => {
    const list = get().permitsByProject[projectId] ?? [];
    return list.filter((p) => p.status === 'expiring' || p.status === 'expired').length;
  },
}));
