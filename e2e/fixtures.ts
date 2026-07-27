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

export const REQUIRES_ENV =
  'E2E not configured — set E2E_BASE_URL, E2E_USER_A_EMAIL/PASSWORD, ' +
  'E2E_USER_B_EMAIL/PASSWORD against a seeded test project (scripts/seed-test-db.ts).';

export async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

export const test = base.extend<{ userA: TestUser; userB: TestUser }>({
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
