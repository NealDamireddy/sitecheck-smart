/**
 * Isolation path — the spec that proves RLS to a customer.
 *
 * Unlike the route-layer isolation tests (which run against a fake DB),
 * this exercises the real policies in Postgres: User B signs in and
 * tries to reach User A's project by URL and by direct API call.
 */
import { test, expect, signIn } from './fixtures';

const USER_A_PROJECT = process.env.E2E_USER_A_PROJECT_ID;

test.describe('tenant isolation (live RLS)', () => {
  test.skip(
    !USER_A_PROJECT,
    'Set E2E_USER_A_PROJECT_ID to a project owned by user A (seed script prints it).'
  );

  test('User B cannot open User A project by direct URL', async ({ page, userB }) => {
    await signIn(page, userB);
    await page.goto(`/projects/${USER_A_PROJECT}/events`);
    // Either denied outright or shown an empty shell — never A's data.
    const body = await page.textContent('body');
    expect(body ?? '').not.toContain('User A Test Site');
  });

  test("User B's API calls cannot read User A's project", async ({ page, userB }) => {
    await signIn(page, userB);
    const res = await page.request.get(`/api/projects`);
    expect(res.status()).toBe(200);
    const projects = (await res.json()) as Array<{ id: string }>;
    expect(projects.some((p) => p.id === USER_A_PROJECT)).toBe(false);
  });

  test("User B cannot read User A's checkpoints via the collection route", async ({
    page,
    userB,
  }) => {
    await signIn(page, userB);
    const res = await page.request.get(
      `/api/checkpoints?projectId=${USER_A_PROJECT}`
    );
    const body = await res.json().catch(() => []);
    const rows = Array.isArray(body) ? body : [];
    expect(rows).toHaveLength(0);
  });

  test("User B cannot mutate User A's project", async ({ page, userB }) => {
    await signIn(page, userB);
    const res = await page.request.patch(`/api/projects/${USER_A_PROJECT}`, {
      data: { wdid: 'HACKED-BY-B' },
    });
    expect(res.status()).not.toBe(200);
  });

  test('unauthenticated browser is redirected to login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
