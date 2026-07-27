import { create } from 'zustand';
import type { Project } from '@/types/project';
import { project as demoProject } from '@/data/project';
import { isDemoSession } from '@/lib/demo/start-demo';

/**
 * Project list is sourced strictly from /api/projects, which is
 * RLS-filtered by the caller's org membership. There is intentionally
 * NO static fallback for signed-in users — that would leak demo projects
 * to QSPs who shouldn't see them and undermine per-user site isolation.
 *
 * The one exception is a demo session (sitecheck_demo cookie): the API
 * 401s there, and the tour promises a pre-loaded sample site, so we fall
 * back to the bundled demo project — the same demo gate every other
 * store uses (see checkpoint-store).
 */

const STORAGE_KEY = 'sitecheck-current-project';

function getPersistedProjectId(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

interface ProjectStore {
  projects: Project[];
  currentProjectId: string;
  loading: boolean;
  /** True once fetchProjects has completed at least once. */
  loaded: boolean;
  error: string | null;
  currentProject: () => Project | undefined;
  setCurrentProject: (id: string) => void;
  fetchProjects: () => Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  currentProjectId: getPersistedProjectId(),
  loading: false,
  loaded: false,
  error: null,

  currentProject: () => {
    const { projects, currentProjectId } = get();
    return projects.find((p) => p.id === currentProjectId);
  },

  setCurrentProject: (id: string) => {
    set({ currentProjectId: id });
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // localStorage unavailable
      }
    }
  },

  fetchProjects: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) {
        if (isDemoSession()) {
          set({
            projects: [demoProject],
            currentProjectId: demoProject.id,
            loading: false,
            loaded: true,
          });
          return;
        }
        throw new Error('Failed to fetch projects');
      }
      const data = await res.json();
      const projects: Project[] = Array.isArray(data) ? data : [];

      // Auto-select the first project if the persisted id is no longer
      // valid (e.g. user switched orgs, or first sign-in with no choice
      // ever made). Leaves an empty store if the user has no sites.
      const { currentProjectId } = get();
      const stillValid = projects.some((p) => p.id === currentProjectId);
      const nextId =
        stillValid ? currentProjectId : projects[0]?.id ?? '';

      set({
        projects,
        currentProjectId: nextId,
        loading: false,
        loaded: true,
      });

      if (typeof window !== 'undefined' && nextId) {
        try {
          localStorage.setItem(STORAGE_KEY, nextId);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      if (isDemoSession()) {
        set({
          projects: [demoProject],
          currentProjectId: demoProject.id,
          loading: false,
          loaded: true,
        });
        return;
      }
      set({
        loading: false,
        loaded: true,
        error: err instanceof Error ? err.message : 'Failed to fetch projects',
      });
    }
  },
}));
