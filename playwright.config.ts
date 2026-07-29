import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

/**
 * End-to-end config.
 *
 * SAFETY: these specs create and destroy real rows. They run ONLY when
 * the E2E_* variables are set AND the target does not look like
 * production — see e2e/fixtures.ts, which refuses to run against a
 * deployed host, and scripts/seed-test-db.ts, which refuses to seed a
 * database containing data it did not create.
 *
 *   npm run db:seed:test        # provision the throwaway project
 *   npm run test:e2e
 *   npx playwright install      # one-time browser download
 */

// Playwright does NOT read .env files on its own. Without this the
// E2E_USER_* variables are undefined at spec time and every test skips
// itself — a silently green run that proves nothing.
loadEnv({ path: resolve(__dirname, '.env.test'), quiet: true });

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // shared seed data
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Signs in each user once and saves the session; see e2e/auth.setup.ts.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    // The real inspector is on a phone in a muddy field — the field
    // walkthrough specs must pass at this viewport too.
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
      dependencies: ['setup'],
    },
  ],
  // Start a dev server only when the target IS this machine. A remote
  // baseURL is assumed already running. (Keyed on the URL, not on
  // whether E2E_BASE_URL happens to be set — setting it to localhost is
  // the normal local case and must still bring the server up.)
  webServer: isLocal
    ? {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
});
