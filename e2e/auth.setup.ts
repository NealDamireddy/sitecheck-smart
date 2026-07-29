/**
 * Sign in each test inspector ONCE and save the session to disk.
 *
 * Why: every spec previously called signIn(), which meant ~18 sign-ins
 * per run (9 specs x 2 browser projects). Supabase rate-limits its auth
 * endpoint, so later specs got bounced back to /login and failed — which
 * looked exactly like a WebKit auth bug and was not one. Reusing a saved
 * session cuts that to 2 logins, removes the rate-limit pressure, and
 * makes the suite substantially faster.
 *
 * The saved state carries cookies AND localStorage, so the onboarding
 * suppression persists too and no spec has to dismiss the tour.
 *
 * Runs as a Playwright `setup` project that the browser projects depend
 * on. Skips cleanly when E2E is unconfigured, in which case the state
 * files are absent and specs fall back to a fresh context (and their own
 * env gate skips them).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { test as setup, expect } from '@playwright/test';
import { authStatePath, suppressOnboarding, userFromEnv } from './fixtures';

for (const label of ['A', 'B'] as const) {
  setup(`authenticate user ${label}`, async ({ page }) => {
    const user = userFromEnv(label);
    setup.skip(!user, `E2E_USER_${label}_EMAIL/PASSWORD not set`);

    const statePath = authStatePath(label);
    mkdirSync(dirname(statePath), { recursive: true });

    await page.goto('/login');
    // Set before signing in: the onboarding overlay is a modal that
    // otherwise covers the sign-in button on first visit.
    await suppressOnboarding(page);

    await page.getByLabel('Email').fill(user!.email);
    await page.getByLabel('Password', { exact: true }).fill(user!.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await suppressOnboarding(page);

    await page.context().storageState({ path: statePath });
  });
}
