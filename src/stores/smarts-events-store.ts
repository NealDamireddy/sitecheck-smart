/**
 * SMARTS rain event store.
 *
 * Powers:
 *   - dashboard simulate buttons (`simulate`)
 *   - capture screen (`fetchById` + `byId[eventId]`)
 *   - review screen (same)
 *   - any project-scoped list view (`fetchForProject`)
 *
 * Convention reused from inspection-store / corrective-actions-store:
 *   * byProject indexes lists per project
 *   * byId caches the single-event detail
 *   * loading sets gate concurrent fetches
 *   * stable EMPTY constant lives outside selectors so consumers can
 *     `useSmartsEventsStore((s) => s.byProject[id] ?? EMPTY_SMARTS_EVENTS)`
 *     without tripping React error #185.
 */

import { create } from 'zustand';
import type { SmartsEvent, SmartsEventStatus } from '@/types';

export const EMPTY_SMARTS_EVENTS: SmartsEvent[] = [];

type SimulateMode = 'forecast' | 'starting';

interface SmartsEventsStore {
  byProject: Record<string, SmartsEvent[]>;
  byId: Record<string, SmartsEvent>;
  loadingProjects: Set<string>;
  loadingIds: Set<string>;
  error: string | null;

  fetchForProject: (projectId: string, status?: SmartsEventStatus) => Promise<void>;
  fetchById: (eventId: string) => Promise<void>;
  simulate: (projectId: string, mode: SimulateMode) => Promise<SmartsEvent | null>;
  update: (
    eventId: string,
    projectId: string,
    patch: Partial<
      Pick<SmartsEvent, 'status' | 'startedAt' | 'endedAt' | 'precipitationInches' | 'notes'>
    >,
  ) => Promise<void>;
}

export const useSmartsEventsStore = create<SmartsEventsStore>((set, get) => ({
  byProject: {},
  byId: {},
  loadingProjects: new Set(),
  loadingIds: new Set(),
  error: null,

  fetchForProject: async (projectId, status) => {
    const loading = new Set(get().loadingProjects);
    if (loading.has(projectId)) return;
    loading.add(projectId);
    set({ loadingProjects: loading, error: null });
    try {
      const url = new URL('/api/smarts-events', window.location.origin);
      url.searchParams.set('projectId', projectId);
      if (status) url.searchParams.set('status', status);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Failed to fetch smarts events (${res.status})`);
      const list = (await res.json()) as SmartsEvent[];
      set((state) => {
        const nextById = { ...state.byId };
        for (const evt of list) nextById[evt.id] = evt;
        return {
          byProject: { ...state.byProject, [projectId]: list },
          byId: nextById,
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      const next = new Set(get().loadingProjects);
      next.delete(projectId);
      set({ loadingProjects: next });
    }
  },

  fetchById: async (eventId) => {
    const loading = new Set(get().loadingIds);
    if (loading.has(eventId)) return;
    loading.add(eventId);
    set({ loadingIds: loading, error: null });
    try {
      const res = await fetch(`/api/smarts-events/${eventId}`);
      if (!res.ok) throw new Error(`Failed to fetch smarts event (${res.status})`);
      const event = (await res.json()) as SmartsEvent;
      set((state) => ({
        byId: { ...state.byId, [event.id]: event },
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      const next = new Set(get().loadingIds);
      next.delete(eventId);
      set({ loadingIds: next });
    }
  },

  simulate: async (projectId, mode) => {
    try {
      const res = await fetch('/api/smarts-events/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, mode }),
      });
      if (!res.ok) throw new Error(`Simulate failed (${res.status})`);
      const event = (await res.json()) as SmartsEvent;
      set((state) => {
        const current = state.byProject[projectId] ?? [];
        return {
          byProject: {
            ...state.byProject,
            [projectId]: [event, ...current.filter((e) => e.id !== event.id)],
          },
          byId: { ...state.byId, [event.id]: event },
        };
      });
      return event;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
      return null;
    }
  },

  update: async (eventId, projectId, patch) => {
    try {
      const res = await fetch(`/api/smarts-events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`Failed to update smarts event (${res.status})`);
      const updated = (await res.json()) as SmartsEvent;
      set((state) => {
        const current = state.byProject[projectId] ?? [];
        return {
          byProject: {
            ...state.byProject,
            [projectId]: current.map((e) => (e.id === eventId ? updated : e)),
          },
          byId: { ...state.byId, [eventId]: updated },
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },
}));
