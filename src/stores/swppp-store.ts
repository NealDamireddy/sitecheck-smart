import { create } from 'zustand';
import type { ExtractedCheckpoint, SiteInfo } from '@/types/swppp';
import type { DroneMission } from '@/types/drone';

export type ProcessingStep =
  | 'idle'
  | 'uploading'
  | 'extracting'
  | 'cross-referencing'
  | 'generating-mission'
  | 'complete'
  | 'error';

interface SwpppStore {
  // Upload state
  file: File | null;
  processingStep: ProcessingStep;
  progress: number;
  error: string | null;

  // Extracted data
  siteInfo: SiteInfo | null;
  extractedCheckpoints: ExtractedCheckpoint[];

  // Generated mission
  generatedMission: DroneMission | null;

  // Selective page parsing
  selectedPages: number[] | null;

  // Actions
  setFile: (file: File | null) => void;
  setProcessingStep: (step: ProcessingStep) => void;
  setProgress: (progress: number) => void;
  setError: (error: string | null) => void;
  setSiteInfo: (info: SiteInfo) => void;
  setExtractedCheckpoints: (checkpoints: ExtractedCheckpoint[]) => void;
  setGeneratedMission: (mission: DroneMission | null) => void;
  setSelectedPages: (pages: number[] | null) => void;
  reset: () => void;
}

export const useSwpppStore = create<SwpppStore>((set) => ({
  file: null,
  processingStep: 'idle',
  progress: 0,
  error: null,
  siteInfo: null,
  extractedCheckpoints: [],
  generatedMission: null,
  selectedPages: null,

  setFile: (file) => set({ file }),
  setProcessingStep: (processingStep) => set({ processingStep }),
  setProgress: (progress) => set({ progress }),
  setError: (error) => set({ error, processingStep: 'error' }),
  setSiteInfo: (siteInfo) => set({ siteInfo }),
  setExtractedCheckpoints: (extractedCheckpoints) => set({ extractedCheckpoints }),
  setGeneratedMission: (generatedMission) => set({ generatedMission }),
  setSelectedPages: (selectedPages) => set({ selectedPages }),
  reset: () =>
    set({
      file: null,
      processingStep: 'idle',
      progress: 0,
      error: null,
      siteInfo: null,
      extractedCheckpoints: [],
      generatedMission: null,
      selectedPages: null,
    }),
}));
