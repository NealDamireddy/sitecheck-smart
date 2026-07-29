/**
 * Shared E2E fixtures and the production tripwire.
 *
 * These specs sign in, create projects, upload files and generate
 * reports — all real writes. Two guards keep that safe:
 *
 *   1. refuseProduction(): the run aborts if the target host, or the
 *      configured Supabase URL, looks like production.
 *   2. The two test accounts must come from env (E2E_USER_A_EMAIL etc.)
 *      and be seeded by scripts/seed-test-db.ts against a disposable
 *      Supabase project.
 *
 * Without those env vars every spec skips with a clear message rather
 * than failing — a fresh clone's `npm run test:e2e` reports "not
 * configured", never a red suite.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
  label: 'A' | 'B';
}

const PRODUCTION_MARKERS = [
  'sitecheck.com',
  'sitecheck.app',
  'vercel.app', // preview and prod deployments alike — never E2E against these
];

export function refuseProduction(): void {
  const target = process.env.E2E_BASE_URL ?? '';
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  for (const marker of PRODUCTION_MARKERS) {
    if (target.includes(marker)) {
      throw new Error(
        `E2E refuses to run against "${target}" — it looks like a deployed environment. ` +
          `These specs create and delete real data. Point E2E_BASE_URL at localhost ` +
          `or a disposable staging host.`
      );
    }
  }
  if (process.env.E2E_ALLOW_ANY_SUPABASE !== '1' && supabase && !process.env.E2E_SUPABASE_URL) {
    throw new Error(
      `E2E requires E2E_SUPABASE_URL (a disposable test project). Refusing to use ` +
        `NEXT_PUBLIC_SUPABASE_URL="${supabase}", which may be production data. ` +
        `See scripts/seed-test-db.ts.`
    );
  }
}

export function userFromEnv(label: 'A' | 'B'): TestUser | null {
  const email = process.env[`E2E_USER_${label}_EMAIL`];
  const password = process.env[`E2E_USER_${label}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password, label };
}

/** True when the environment is fully configured for E2E. */
export function e2eConfigured(): boolean {
  return Boolean(userFromEnv('A') && userFromEnv('B') && process.env.E2E_BASE_URL);
}

/** Where auth.setup.ts saves each user's session. Gitignored. */
export function authStatePath(label: 'A' | 'B'): string {
  return resolve(__dirname, '.auth', `user-${label.toLowerCase()}.json`);
}

/**
 * Saved session for a user, or undefined when it hasn't been created
 * (unconfigured environment). Undefined means Playwright uses a fresh
 * context and the spec's own env gate skips it — never a hard failure on
 * a clean clone.
 */
export function authState(label: 'A' | 'B'): string | undefined {
  const p = authStatePath(label);
  return existsSync(p) ? p : undefined;
}

export const REQUIRES_ENV =
  'E2E not configured — set E2E_BASE_URL, E2E_USER_A_EMAIL/PASSWORD, ' +
  'E2E_USER_B_EMAIL/PASSWORD against a seeded test project (scripts/seed-test-db.ts).';

/**
 * Mark the product tour complete before the app renders.
 *
 * The onboarding overlay is a modal dialog that covers the dashboard on a
 * first visit, so every UI interaction after sign-in hits the overlay
 * instead of the page. Seeding the same localStorage key the store writes
 * is more robust than clicking "Skip": no dependence on the button's
 * label or on the tour's step count.
 *
 * Must run on the target origin, so call it after a navigation.
 */
export async function suppressOnboarding(page: Page): Promise<void> {
  // NOTE: seeding localStorage does NOT work. src/stores/onboarding-store.ts
  // getPersistedState() returns a hardcoded `hasCompleted: false` and never
  // reads storage, so the overlay reappears on EVERY page load (reported as
  // a product finding — an inspector dismisses the tour every time they
  // open the app). Dismissal therefore has to go through the UI.
  await dismissOnboarding(page);
}

/** Click through the onboarding modal if it is currently covering the page. */
export async function dismissOnboarding(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: /SiteCheck Onboarding/i });
  if (!(await dialog.isVisible().catch(() => false))) return;
  const skip = dialog.getByRole('button', { name: /^skip$/i });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 5_000 }).catch(() => {});
  }
  await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
}

export async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await suppressOnboarding(page);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  // Re-assert on the post-login origin (same origin, so the pre-login
  // write already carries over — this is belt-and-braces only).
  //
  // Deliberately NO page.reload() here: reloading immediately after the
  // redirect races the Supabase session cookie being written, and on
  // WebKit that intermittently bounced back to /login. Suppression does
  // not need a reload; the overlay reads localStorage on mount.
  await suppressOnboarding(page);
  // Wait for the app shell to settle so callers can interact immediately.
  await page.waitForLoadState('networkidle').catch(() => {});
}

/**
 * Animation-free pages.
 *
 * The app animates lists with Framer Motion. Playwright refuses to click
 * an element that is still moving ("element is not stable"), so a
 * perpetually-animating card list makes UI specs time out even though the
 * element is present and correct. Zeroing durations at document start is
 * the standard remedy and does not change behaviour, only timing.
 */
export const test = base.extend<{ userA: TestUser; userB: TestUser }>({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const css =
        '*,*::before,*::after{animation-duration:0s!important;' +
        'animation-delay:0s!important;transition-duration:0s!important;' +
        'transition-delay:0s!important;scroll-behavior:auto!important}';
      const inject = () => {
        const style = document.createElement('style');
        style.setAttribute('data-e2e-no-animation', '');
        style.textContent = css;
        document.head?.appendChild(style);
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject, { once: true });
      } else {
        inject();
      }
    });

    // The onboarding modal re-renders on every page load (see
    // suppressOnboarding). addLocatorHandler is Playwright's built-in
    // answer to overlays that appear unpredictably: it fires whenever the
    // dialog shows up, including mid-action, and retries the blocked
    // click afterwards.
    await page.addLocatorHandler(
      page.getByRole('dialog', { name: /SiteCheck Onboarding/i }),
      async (dialog) => {
        const skip = dialog.getByRole('button', { name: /^skip$/i });
        if (await skip.isVisible().catch(() => false)) {
          await skip.click({ timeout: 5_000 }).catch(() => {});
        }
      },
      { noWaitAfter: true }
    );

    await use(page);
  },
  userA: async ({}, use) => {
    refuseProduction();
    const u = userFromEnv('A');
    test.skip(!u, REQUIRES_ENV);
    await use(u!);
  },
  userB: async ({}, use) => {
    refuseProduction();
    const u = userFromEnv('B');
    test.skip(!u, REQUIRES_ENV);
    await use(u!);
  },
});

export { expect };
