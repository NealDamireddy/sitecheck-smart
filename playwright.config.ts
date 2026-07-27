import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end config.
 *
 * SAFETY: these specs create and destroy real rows. They run ONLY when
 * E2E_BASE_URL is set AND it does not point at a production host — see
 * e2e/fixtures.ts, which refuses to run against anything that looks
 * like production, and scripts/seed-test-db.ts for provisioning a
 * disposable Supabase project.
 *
 *   npm run test:e2e            # against E2E_BASE_URL
 *   npx playwright install      # one-time browser download (~500 MB)
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

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
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    // The real inspector is on a phone in a muddy field — the field
    // walkthrough specs must pass at this viewport too.
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
  // Only auto-start a server for a local run; a remote E2E_BASE_URL is
  // assumed already up.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
