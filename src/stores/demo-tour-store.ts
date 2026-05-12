import { create } from 'zustand';

/**
 * Demo tour store — drives the bottom-right guided tour panel that appears
 * after a VC clicks "Try Live Demo" on /login or /signup.
 *
 * Persisted to localStorage key `sitecheck-demo-tour`. `startDemoSession()`
 * (in `src/lib/demo/start-demo.ts`) seeds this key before navigation so the
 * overlay can read it on first mount.
 */

const STORAGE_KEY = 'sitecheck-demo-tour';

interface DemoTourState {
  active: boolean;
  currentStep: number;
}

interface DemoTourStore extends DemoTourState {
  setStep: (step: number) => void;
  next: () => void;
  prev: () => void;
  endTour: () => void;
  exit: () => void;
}

function readPersisted(): DemoTourState {
  if (typeof window === 'undefined') return { active: false, currentStep: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { active: false, currentStep: 0 };
    const parsed = JSON.parse(raw) as Partial<DemoTourState>;
    return {
      active: Boolean(parsed.active),
      currentStep: typeof parsed.currentStep === 'number' ? parsed.currentStep : 0,
    };
  } catch {
    return { active: false, currentStep: 0 };
  }
}

function persist(state: Partial<DemoTourState>) {
  if (typeof window === 'undefined') return;
  try {
    const current = readPersisted();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        active: state.active ?? current.active,
        currentStep: state.currentStep ?? current.currentStep,
      })
    );
  } catch {
    // ignore
  }
}

export const useDemoTourStore = create<DemoTourStore>((set, get) => {
  const initial = readPersisted();
  return {
    ...initial,

    setStep: (step) => {
      set({ currentStep: step });
      persist({ currentStep: step });
    },

    next: () => {
      const next = get().currentStep + 1;
      set({ currentStep: next });
      persist({ currentStep: next });
    },

    prev: () => {
      const next = Math.max(0, get().currentStep - 1);
      set({ currentStep: next });
      persist({ currentStep: next });
    },

    /** End the tour panel but keep the demo cookie — VC keeps free-roaming. */
    endTour: () => {
      set({ active: false });
      persist({ active: false });
    },

    /** Full reset — used by `exitDemoSession()`. */
    exit: () => {
      set({ active: false, currentStep: 0 });
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    },
  };
});
