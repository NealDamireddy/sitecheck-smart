import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — entry point for the offline foundations e2e
 * test. Reuses the dev server (`next dev`) with NEXT_PUBLIC_OFFLINE_SW_DEV
 * set so the service worker registers in development mode. We pick
 * port 3000 (Next default) and let Playwright spin the server up
 * itself if it isn't already running.
 *
 * Subsequent offline-mode PRs (sync queue, photo capture) extend this
 * config with extra projects rather than forking it.
 */

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_OFFLINE_SW_DEV: '1',
        },
      },
});
