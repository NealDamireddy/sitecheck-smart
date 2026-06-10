import { create } from 'zustand';

/**
 * Lightweight client-side tracker for the inspection the QSP is currently
 * performing. The persisted inspection row lives in `inspections` —
 * this store is just enough state to show the "inspection in progress"
 * banner, count how many checkpoints have been touched since the
 * inspection started, and surface the Generate Report CTA.
 *
 * Reviewed-checkpoint ids are persisted to localStorage so a hard refresh
 * mid-walkthrough doesn't reset the count. The set is keyed per
 * inspection id, so switching projects or starting a new inspection
 * starts fresh.
 */

type ActiveVisit =
  | 'weekly'
  | 'monthly'
  | 'pre-storm'
  | 'post-storm'
  | 'during-storm';

const VISIT_LABELS: Record<ActiveVisit, string> = {
  weekly: 'Weekly inspection',
  monthly: 'Monthly inspection',
  'pre-storm': 'Pre-precipitation inspection',
  'post-storm': 'Post-precipitation inspection',
  'during-storm': 'During-precipitation inspection',
};

const STORAGE_KEY = 'sitecheck-active-inspection';

interface PersistedState {
  inspectionId: string;
  projectId: string;
  visit: ActiveVisit;
  startedAt: string;
  reviewedIds: string[];
  markedComplete: boolean;
}

function loadPersisted(): PersistedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed?.inspectionId || !parsed?.projectId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersisted(state: PersistedState | null) {
  if (typeof window === 'undefined') return;
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable — banner just won't survive a refresh.
  }
}

interface ActiveInspectionStore {
  inspectionId: string | null;
  projectId: string | null;
  visit: ActiveVisit | null;
  startedAt: string | null;
  reviewedIds: Set<string>;
  markedComplete: boolean;

  start: (params: {
    inspectionId: string;
    projectId: string;
    visit: ActiveVisit;
  }) => void;
  markReviewed: (checkpointId: string) => void;
  markComplete: () => void;
  clear: () => void;
  visitLabel: () => string;
}

function hydrate(): Pick<
  ActiveInspectionStore,
  'inspectionId' | 'projectId' | 'visit' | 'startedAt' | 'reviewedIds' | 'markedComplete'
> {
  const persisted = loadPersisted();
  if (!persisted) {
    return {
      inspectionId: null,
      projectId: null,
      visit: null,
      startedAt: null,
      reviewedIds: new Set<string>(),
      markedComplete: false,
    };
  }
  return {
    inspectionId: persisted.inspectionId,
    projectId: persisted.projectId,
    visit: persisted.visit,
    startedAt: persisted.startedAt,
    reviewedIds: new Set(persisted.reviewedIds ?? []),
    markedComplete: !!persisted.markedComplete,
  };
}

function persist(state: ActiveInspectionStore) {
  if (!state.inspectionId || !state.projectId || !state.visit || !state.startedAt) {
    savePersisted(null);
    return;
  }
  savePersisted({
    inspectionId: state.inspectionId,
    projectId: state.projectId,
    visit: state.visit,
    startedAt: state.startedAt,
    reviewedIds: Array.from(state.reviewedIds),
    markedComplete: state.markedComplete,
  });
}

export const useActiveInspectionStore = create<ActiveInspectionStore>(
  (set, get) => ({
    ...hydrate(),

    start: ({ inspectionId, projectId, visit }) => {
      const next: Partial<ActiveInspectionStore> = {
        inspectionId,
        projectId,
        visit,
        startedAt: new Date().toISOString(),
        reviewedIds: new Set<string>(),
        markedComplete: false,
      };
      set(next);
      persist(get());
    },

    markReviewed: (checkpointId) => {
      const current = get();
      if (!current.inspectionId) return;
      if (current.reviewedIds.has(checkpointId)) return;
      const next = new Set(current.reviewedIds);
      next.add(checkpointId);
      set({ reviewedIds: next });
      persist(get());
    },

    markComplete: () => {
      if (!get().inspectionId) return;
      set({ markedComplete: true });
      persist(get());
    },

    clear: () => {
      set({
        inspectionId: null,
        projectId: null,
        visit: null,
        startedAt: null,
        reviewedIds: new Set<string>(),
        markedComplete: false,
      });
      savePersisted(null);
    },

    visitLabel: () => {
      const visit = get().visit;
      return visit ? VISIT_LABELS[visit] : 'Inspection';
    },
  })
);

export type { ActiveVisit };
export { VISIT_LABELS };
