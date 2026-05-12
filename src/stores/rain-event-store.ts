/**
 * Block 5 — Rain event Zustand store.
 *
 * Holds the most-recent detected rain event for the active project plus
 * the auto-drafted inspection (if any). The dashboard mounts call
 * `checkRainEvents(projectId)` once per project change; the call is
 * idempotent server-side so re-mount spam is harmless.
 */

import { create } from 'zustand';
import type { DetectedRainEvent } from '@/lib/rain-event-detector';

interface DraftInspection {
  id: string;
  projectId: string;
  status: string;
  trigger: string;
  triggerEventId?: string;
  dueBy?: string;
  narrative?: string;
}

interface RainEventStore {
  rainEventByProject: Record<string, DetectedRainEvent | null>;
  draftInspectionByProject: Record<string, DraftInspection | null>;
  checkingProjectIds: Set<string>;
  /** Project ids the user has dismissed for the current session */
  dismissedProjectIds: Set<string>;
  checkRainEvents: (projectId: string) => Promise<void>;
  dismissForSession: (projectId: string) => void;
  isDismissed: (projectId: string) => boolean;
  getRainEvent: (projectId: string) => DetectedRainEvent | null;
  getDraftInspection: (projectId: string) => DraftInspection | null;
  isChecking: (projectId: string) => boolean;
}

export const useRainEventStore = create<RainEventStore>((set, get) => ({
  rainEventByProject: {},
  draftInspectionByProject: {},
  checkingProjectIds: new Set<string>(),
  dismissedProjectIds: new Set<string>(),

  async checkRainEvents(projectId: string) {
    const { checkingProjectIds } = get();
    if (checkingProjectIds.has(projectId)) return;

    const nextChecking = new Set(checkingProjectIds);
    nextChecking.add(projectId);
    set({ checkingProjectIds: nextChecking });

    try {
      const res = await fetch('/api/inspections/check-rain-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      if (!res.ok) {
        throw new Error(`check-rain-events ${res.status}`);
      }

      const data = (await res.json()) as {
        rainEvent: DetectedRainEvent | null;
        inspection: DraftInspection | null;
      };

      set((state) => ({
        rainEventByProject: {
          ...state.rainEventByProject,
          [projectId]: data.rainEvent,
        },
        draftInspectionByProject: {
          ...state.draftInspectionByProject,
          [projectId]: data.inspection,
        },
      }));
    } catch (err) {
      console.warn('checkRainEvents failed:', err);
      // Leave existing values untouched
    } finally {
      set((state) => {
        const next = new Set(state.checkingProjectIds);
        next.delete(projectId);
        return { checkingProjectIds: next };
      });
    }
  },

  dismissForSession(projectId: string) {
    set((state) => {
      const next = new Set(state.dismissedProjectIds);
      next.add(projectId);
      return { dismissedProjectIds: next };
    });
  },

  isDismissed(projectId: string) {
    return get().dismissedProjectIds.has(projectId);
  },

  getRainEvent(projectId: string) {
    return get().rainEventByProject[projectId] ?? null;
  },

  getDraftInspection(projectId: string) {
    return get().draftInspectionByProject[projectId] ?? null;
  },

  isChecking(projectId: string) {
    return get().checkingProjectIds.has(projectId);
  },
}));
