import { create } from 'zustand';
import type { Project } from '@/types/project';
import { project as riversideProject } from '@/data/project';
import { linearProject } from '@/data/linear-project';

const STORAGE_KEY = 'sitecheck-current-project';

function getPersistedProjectId(): string {
  if (typeof window === 'undefined') return riversideProject.id;
  try {
    return localStorage.getItem(STORAGE_KEY) || riversideProject.id;
  } catch {
    return riversideProject.id;
  }
}

interface ProjectStore {
  projects: Project[];
  currentProjectId: string;
  loading: boolean;
  error: string | null;
  currentProject: () => Project | undefined;
  setCurrentProject: (id: string) => void;
  fetchProjects: () => Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [riversideProject, linearProject],
  currentProjectId: getPersistedProjectId(),
  loading: false,
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
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        set({ projects: data, loading: false });
      } else {
        // Fall back to static data if API returns empty
        set({ loading: false });
      }
    } catch {
      // Keep static data on error
      set({ loading: false });
    }
  },
}));
