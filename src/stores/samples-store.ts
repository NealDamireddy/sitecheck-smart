/**
 * Samples store.
 *
 * Indexed by smarts_event_id because the capture and review screens
 * scope to one event at a time. parameter_results are nested on each
 * Sample (hydrated server-side) — no separate parameter_results store,
 * mirroring how inspection findings live on the inspection detail in
 * inspection-store.
 *
 * The DB enforces UNIQUE(smarts_event_id, monitoring_location_id), so
 * a "re-sample" at the same location during the same event is an upsert
 * server-side. The store handles the upsert echo by replacing any row
 * with a matching id OR a matching monitoring_location_id when the API
 * returns the new/updated record.
 */

import { create } from 'zustand';
import type { Sample, ParameterResult } from '@/types';

export const EMPTY_SAMPLES: Sample[] = [];

/**
 * Input shape for parameter results in a create payload — mirrors the
 * `parameterResultInput` private schema in src/lib/validations/sample.ts
 * and the body the POST /api/samples handler accepts. Distinct from the
 * full `ParameterResult` type, which is the hydrated DB row including
 * id, projectId, sampleId, createdAt, updatedAt that the server
 * populates.
 */
export interface ParameterResultInput {
  parameter: ParameterResult['parameter'];
  qualifier?: ParameterResult['qualifier'];
  result?: number | null;
  units: string;
  analyticalMethod: string;
  mdl?: number | null;
  rl?: number | null;
  analyzedBy?: ParameterResult['analyzedBy'];
}

interface SamplesStore {
  byEvent: Record<string, Sample[]>;
  loadingEvents: Set<string>;
  error: string | null;

  fetchForEvent: (smartsEventId: string) => Promise<void>;
  create: (
    payload: Omit<Partial<Sample>, 'parameterResults'> & {
      projectId: string;
      smartsEventId: string;
      monitoringLocationId: string;
      qspName: string;
      parameterResults?: ParameterResultInput[];
    },
  ) => Promise<Sample | null>;
  update: (
    sampleId: string,
    smartsEventId: string,
    patch: Partial<Sample>,
  ) => Promise<void>;
  remove: (sampleId: string, smartsEventId: string) => Promise<void>;
}

export const useSamplesStore = create<SamplesStore>((set, get) => ({
  byEvent: {},
  loadingEvents: new Set(),
  error: null,

  fetchForEvent: async (smartsEventId) => {
    const loading = new Set(get().loadingEvents);
    if (loading.has(smartsEventId)) return;
    loading.add(smartsEventId);
    set({ loadingEvents: loading, error: null });
    try {
      const url = new URL('/api/samples', window.location.origin);
      url.searchParams.set('smartsEventId', smartsEventId);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Failed to fetch samples (${res.status})`);
      const list = (await res.json()) as Sample[];
      set((state) => ({
        byEvent: { ...state.byEvent, [smartsEventId]: list },
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      const next = new Set(get().loadingEvents);
      next.delete(smartsEventId);
      set({ loadingEvents: next });
    }
  },

  create: async (payload) => {
    try {
      const res = await fetch('/api/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Failed to create sample (${res.status})`);
      const created = (await res.json()) as Sample;
      set((state) => {
        const current = state.byEvent[payload.smartsEventId] ?? [];
        // Upsert echo: drop any row that collides on id or location.
        const filtered = current.filter(
          (s) =>
            s.id !== created.id &&
            s.monitoringLocationId !== created.monitoringLocationId,
        );
        return {
          byEvent: {
            ...state.byEvent,
            [payload.smartsEventId]: [created, ...filtered],
          },
        };
      });
      return created;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
      return null;
    }
  },

  update: async (sampleId, smartsEventId, patch) => {
    try {
      const res = await fetch(`/api/samples/${sampleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`Failed to update sample (${res.status})`);
      const updated = (await res.json()) as Sample;
      set((state) => {
        const current = state.byEvent[smartsEventId] ?? [];
        return {
          byEvent: {
            ...state.byEvent,
            [smartsEventId]: current.map((s) => (s.id === sampleId ? updated : s)),
          },
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  remove: async (sampleId, smartsEventId) => {
    try {
      const res = await fetch(`/api/samples/${sampleId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`Failed to delete sample (${res.status})`);
      set((state) => {
        const current = state.byEvent[smartsEventId] ?? [];
        return {
          byEvent: {
            ...state.byEvent,
            [smartsEventId]: current.filter((s) => s.id !== sampleId),
          },
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },
}));
