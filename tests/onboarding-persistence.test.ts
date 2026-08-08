import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'sitecheck-onboarding';

function fakeStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: vi.fn(() => values.clear()),
  };
}

describe('onboarding completion persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores a completed onboarding version after a hard reload', async () => {
    const storage = fakeStorage({
      [STORAGE_KEY]: JSON.stringify({
        hasCompleted: true,
        completedVersion: 1,
      }),
    });
    vi.stubGlobal('localStorage', storage);

    const { useOnboardingStore } = await import(
      '@/stores/onboarding-store'
    );

    expect(useOnboardingStore.getState()).toMatchObject({
      hasCompleted: true,
      completedVersion: 1,
      currentStep: 0,
    });
  });

  it('writes completion and version when the user skips onboarding', async () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);

    const { useOnboardingStore } = await import(
      '@/stores/onboarding-store'
    );
    const { ONBOARDING_VERSION } = await import(
      '@/components/onboarding/onboarding-steps'
    );

    useOnboardingStore.getState().completeOnboarding();

    const persisted = JSON.parse(
      storage.setItem.mock.calls.at(-1)?.[1] ?? '{}'
    );
    expect(persisted).toEqual({
      hasCompleted: true,
      completedVersion: ONBOARDING_VERSION,
    });
  });

  it('fails safely when the saved value is corrupt', async () => {
    vi.stubGlobal(
      'localStorage',
      fakeStorage({ [STORAGE_KEY]: '{not-json' })
    );

    const { useOnboardingStore } = await import(
      '@/stores/onboarding-store'
    );

    expect(useOnboardingStore.getState()).toMatchObject({
      hasCompleted: false,
      completedVersion: 0,
      currentStep: 0,
    });
  });
});
