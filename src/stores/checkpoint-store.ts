import { create } from 'zustand';
import { Checkpoint, BMPCategory, CheckpointStatus, Zone } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { checkpoints as staticCheckpoints } from '@/data/checkpoints';
import { isDemoSession } from '@/lib/demo/start-demo';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Static demo data only stands in for a real backend during a demo
 * session. For a genuine authenticated account an empty API response
 * means "this user has no checkpoints yet" — show nothing, not the
 * bundled demo BMPs.
 */
function demoFallback(): Checkpoint[] {
  return isDemoSession() ? staticCheckpoints : [];
}

interface CheckpointFilters {
  status: CheckpointStatus | 'all';
  bmpType: BMPCategory | 'all';
  zone: Zone | 'all';
  segment: string | 'all';
  search: string;
}

// Transform snake_case DB row to camelCase Checkpoint
function transformRealtimeCheckpoint(row: Record<string, unknown>): Checkpoint {
  return {
    id: row.id as string,
    name: row.name as string,
    bmpType: row.bmp_type as BMPCategory,
    status: row.status as CheckpointStatus,
    priority: row.priority as Checkpoint['priority'],
    zone: row.zone as Zone,
    description: row.description as string,
    cgpSection: row.cgp_section as string,
    lat: row.lat as number,
    lng: row.lng as number,
    location: { lat: row.lat as number, lng: row.lng as number },
    lastInspectionDate: row.last_inspection_date as string,
    lastInspectionPhoto: row.last_inspection_photo as string,
    previousPhoto: row.previous_photo as string | undefined,
    installDate: row.install_date as string,
    swpppPage: row.swppp_page as number,
  };
}

interface CheckpointStore {
  checkpoints: Checkpoint[];
  selectedCheckpointId: string | null;
  filters: CheckpointFilters;
  loading: boolean;
  error: string | null;
  setSelectedCheckpoint: (id: string | null) => void;
  setFilter: <K extends keyof CheckpointFilters>(key: K, value: CheckpointFilters[K]) => void;
  resetFilters: () => void;
  filteredCheckpoints: () => Checkpoint[];
  setCheckpoints: (checkpoints: Checkpoint[]) => void;
  fetchCheckpoints: () => Promise<void>;
  updateCheckpoint: (id: string, data: Partial<Checkpoint>) => Promise<void>;
  subscribeRealtime: () => () => void;
}

const defaultFilters: CheckpointFilters = {
  status: 'all',
  bmpType: 'all',
  zone: 'all',
  segment: 'all',
  search: '',
};

export const useCheckpointStore = create<CheckpointStore>((set, get) => ({
  // Start empty for a deterministic SSR/hydration match. fetchCheckpoints
  // (called from an effect, post-mount) fills in DB data, or the demo
  // fallback when in a demo session.
  checkpoints: [],
  selectedCheckpointId: null,
  filters: defaultFilters,
  loading: false,
  error: null,
  setSelectedCheckpoint: (id) => set({ selectedCheckpointId: id }),
  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),
  resetFilters: () => set({ filters: defaultFilters }),
  setCheckpoints: (checkpoints) => set({ checkpoints }),
  filteredCheckpoints: () => {
    const { checkpoints, filters } = get();
    return checkpoints.filter((cp) => {
      if (filters.status !== 'all' && cp.status !== filters.status) return false;
      if (filters.bmpType !== 'all' && cp.bmpType !== filters.bmpType) return false;
      if (filters.zone !== 'all' && cp.zone !== filters.zone) return false;
      if (filters.segment !== 'all' && cp.linearRef?.segmentId !== filters.segment) return false;
      if (filters.search) {
        const search = filters.search.toLowerCase();
        return (
          cp.name.toLowerCase().includes(search) ||
          cp.id.toLowerCase().includes(search) ||
          cp.description.toLowerCase().includes(search)
        );
      }
      return true;
    });
  },
  fetchCheckpoints: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const { useProjectStore } = await import('./project-store');
      const projectId = useProjectStore.getState().currentProjectId;
      const res = await fetch(`/api/checkpoints?projectId=${projectId}`);
      if (!res.ok) throw new Error('Failed to fetch checkpoints');
      const data = await res.json();
      // Real account + empty result = genuinely no checkpoints. Only fall
      // back to bundled demo data inside a demo session.
      set({
        checkpoints:
          Array.isArray(data) && data.length > 0 ? data : demoFallback(),
        loading: false,
      });
    } catch {
      // API unavailable (demo mode, offline). Demo fallback or empty.
      set({ checkpoints: demoFallback(), loading: false, error: null });
    }
  },
  updateCheckpoint: async (id, data) => {
    try {
      const res = await fetch(`/api/checkpoints/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update checkpoint');
      const updated = await res.json();
      set((state) => ({
        checkpoints: state.checkpoints.map((cp) =>
          cp.id === id ? { ...cp, ...updated } : cp
        ),
      }));
      // Status changes during an active inspection count toward the
      // reviewed-progress banner. Dynamic import keeps this store from
      // taking a hard dependency on the active-inspection store, which
      // can be mounted later in the boot order.
      if (data.status) {
        try {
          const { useActiveInspectionStore } = await import(
            './active-inspection-store'
          );
          useActiveInspectionStore.getState().markReviewed(id);
        } catch {
          // active-inspection store unavailable — banner will still
          // count from a hard reload because reviewed ids are persisted.
        }
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  subscribeRealtime: () => {
    try {
      const supabase = createClient();

      const channel = supabase
        .channel('checkpoints-realtime')
        .on(
          'postgres_changes' as 'system',
          { event: 'INSERT', schema: 'public', table: 'checkpoints' },
          (payload: { new: Record<string, unknown> }) => {
            const checkpoint = transformRealtimeCheckpoint(payload.new);
            const existing = get().checkpoints.find((cp) => cp.id === checkpoint.id);
            if (!existing) {
              set((state) => ({
                checkpoints: [...state.checkpoints, checkpoint],
              }));
            }
          }
        )
        .on(
          'postgres_changes' as 'system',
          { event: 'UPDATE', schema: 'public', table: 'checkpoints' },
          (payload: { new: Record<string, unknown> }) => {
            const updated = transformRealtimeCheckpoint(payload.new);
            set((state) => ({
              checkpoints: state.checkpoints.map((cp) =>
                cp.id === updated.id ? updated : cp
              ),
            }));
          }
        )
        .on(
          'postgres_changes' as 'system',
          { event: 'DELETE', schema: 'public', table: 'checkpoints' },
          (payload: { old: Record<string, unknown> }) => {
            const deletedId = payload.old.id as string;
            set((state) => ({
              checkpoints: state.checkpoints.filter((cp) => cp.id !== deletedId),
            }));
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn('Checkpoint realtime subscription failed:', err);
      return () => {};
    }
  },
}));
