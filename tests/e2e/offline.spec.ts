import { expect, test } from '@playwright/test';

/**
 * Offline foundations — e2e contract.
 *
 * The full spec ("capture sample with photo, restore connection,
 * assert sample exists server-side") needs the IndexedDB + sync queue
 * slice that ships in a follow-up PR. Until those land, this test
 * pins the foundations slice we DO have:
 *   1. The Workbox service worker registers and reaches activated.
 *   2. The /api/healthcheck endpoint responds while online.
 *   3. Dropping the network surfaces the "you're offline" banner
 *      within 2 seconds of the heartbeat failing.
 *   4. Restoring the network clears the banner.
 *
 * This protects the foundations from regression while the upper
 * layers are being built.
 */

test.describe('offline foundations', () => {
  test('service worker activates and offline banner appears on disconnect', async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(60_000);

    await page.goto('/');

    // Wait for the SW to activate. Service workers don't always reach
    // the controller state on first load (depends on whether a prior
    // SW was already controlling the page); we accept either an
    // activated registration or an active controller.
    await page.waitForFunction(
      async () => {
        if (!('serviceWorker' in navigator)) return false;
        const reg = await navigator.serviceWorker.getRegistration();
        return Boolean(reg?.active || navigator.serviceWorker.controller);
      },
      undefined,
      { timeout: 30_000 }
    );

    // Sanity: heartbeat works while online.
    const onlineRes = await page.request.get(`${baseURL ?? ''}/api/healthcheck`);
    expect(onlineRes.ok()).toBeTruthy();

    // Banner must NOT be visible while online.
    await expect(page.getByTestId('offline-banner')).toHaveCount(0);

    // Drop the network. Heartbeat polls every 1s with a 1.5s timeout,
    // so the banner must appear within ~2.5s of the disconnect.
    await context.setOffline(true);

    await expect(page.getByTestId('offline-banner')).toBeVisible({
      timeout: 3_000,
    });

    // Restore connectivity — banner clears.
    await context.setOffline(false);
    await expect(page.getByTestId('offline-banner')).toBeHidden({
      timeout: 5_000,
    });
  });
});
