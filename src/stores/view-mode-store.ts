import { create } from 'zustand';

type ViewMode = 'website' | 'app';

const STORAGE_KEY = 'sitecheck-view-mode';

function getPersistedViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'website';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'website' || stored === 'app') return stored;
  } catch { /* ignore */ }
  return 'website';
}

interface ViewModeStore {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export const useViewModeStore = create<ViewModeStore>((set) => ({
  viewMode: getPersistedViewMode(),
  setViewMode: (mode) => {
    set({ viewMode: mode });
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
    }
  },
}));
