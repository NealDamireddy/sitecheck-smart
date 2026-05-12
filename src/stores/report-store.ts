import { create } from 'zustand';
import { ReportSection } from '@/types';
import type { QSPReviewEntry } from '@/types/drone';

interface ReportStore {
  reportId: string | null;
  sections: ReportSection[];
  signed: boolean;
  signedBy: string | null;
  signedDate: string | null;
  loading: boolean;
  error: string | null;
  setSections: (sections: ReportSection[]) => void;
  updateSection: (id: string, content: string) => void;
  sign: (name: string) => void;
  unsign: () => void;
  generateReport: () => Promise<void>;
  generateReportFromMission: (missionId: string, reviews: Record<string, QSPReviewEntry>) => Promise<void>;
  saveReport: () => Promise<void>;
  signReport: (name: string) => Promise<void>;
}

export const useReportStore = create<ReportStore>((set, get) => ({
  reportId: null,
  sections: [],
  signed: false,
  signedBy: null,
  signedDate: null,
  loading: false,
  error: null,
  setSections: (sections) => set({ sections }),
  updateSection: (id, content) =>
    set((state) => ({
      sections: state.sections.map((s) =>
        s.id === id ? { ...s, content, edited: true } : s
      ),
    })),
  sign: (name) =>
    set({ signed: true, signedBy: name, signedDate: new Date().toISOString() }),
  unsign: () => set({ signed: false, signedBy: null, signedDate: null }),
  generateReport: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/reports/generate', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate report');
      const data = await res.json();
      set({
        reportId: data.id,
        sections: data.sections,
        signed: data.signed,
        signedBy: data.signedBy,
        signedDate: data.signedDate,
        loading: false,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', loading: false });
    }
  },
  generateReportFromMission: async (missionId, reviews) => {
    set({ loading: true, error: null });
    try {
      // Collect override data from QSP reviews
      const overrides = Object.values(reviews)
        .filter((r) => r.decision === 'override')
        .map((r) => ({
          checkpointId: r.checkpointId,
          overrideStatus: r.overrideStatus,
          overrideNotes: r.overrideNotes,
        }));

      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId, overrides }),
      });
      if (!res.ok) throw new Error('Failed to generate report');
      const data = await res.json();
      set({
        reportId: data.id,
        sections: data.sections,
        signed: data.signed,
        signedBy: data.signedBy,
        signedDate: data.signedDate,
        loading: false,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', loading: false });
    }
  },
  saveReport: async () => {
    const { reportId, sections } = get();
    if (!reportId) return;
    try {
      await fetch(`/api/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections }),
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },
  signReport: async (name) => {
    const { reportId } = get();
    if (!reportId) {
      // Fall back to local signing if no report ID
      set({ signed: true, signedBy: name, signedDate: new Date().toISOString() });
      return;
    }
    try {
      const res = await fetch(`/api/reports/${reportId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedBy: name }),
      });
      if (!res.ok) throw new Error('Failed to sign report');
      const data = await res.json();
      set({
        signed: data.signed,
        signedBy: data.signedBy,
        signedDate: data.signedDate,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },
}));
