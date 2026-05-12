import { create } from 'zustand';
import { ONBOARDING_VERSION } from '@/components/onboarding/onboarding-steps';

const STORAGE_KEY = 'sitecheck-onboarding';

interface OnboardingState {
  hasCompleted: boolean;
  currentStep: number;
  completedVersion: number;
}

interface OnboardingStore extends OnboardingState {
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

function getPersistedState(): OnboardingState {
  // Always start fresh on page load — onboarding shows every time
  return { hasCompleted: false, currentStep: 0, completedVersion: 0 };
}

function persist(state: Partial<OnboardingState>) {
  if (typeof window === 'undefined') return;
  try {
    const current = getPersistedState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      hasCompleted: state.hasCompleted ?? current.hasCompleted,
      completedVersion: state.completedVersion ?? current.completedVersion,
    }));
  } catch { /* ignore */ }
}

export const useOnboardingStore = create<OnboardingStore>((set, get) => {
  const initial = getPersistedState();
  return {
    ...initial,

    setStep: (step) => set({ currentStep: step }),

    nextStep: () => set((s) => ({ currentStep: s.currentStep + 1 })),

    prevStep: () => set((s) => ({ currentStep: Math.max(0, s.currentStep - 1) })),

    completeOnboarding: () => {
      set({ hasCompleted: true, currentStep: 0, completedVersion: ONBOARDING_VERSION });
      persist({ hasCompleted: true, completedVersion: ONBOARDING_VERSION });
    },

    resetOnboarding: () => {
      set({ hasCompleted: false, currentStep: 0, completedVersion: 0 });
      persist({ hasCompleted: false, completedVersion: 0 });
    },
  };
});
