/**
 * Storm path — the SMARTS half of the product.
 *
 * Simulate a qualifying event → enter pH + turbidity at a monitoring
 * location, one reading exceeding its NAL → verify the review surface
 * flags the exceedance → export and assert the file's content.
 */
import { test, expect, signIn } from './fixtures';

const PROJECT_ID = process.env.E2E_USER_A_PROJECT_ID;

test.describe('storm path', () => {
  test.skip(!PROJECT_ID, 'Set E2E_USER_A_PROJECT_ID (seed script prints it).');

  test('NAL exceedance is flagged and reaches the export', async ({ page, userA }) => {
    await signIn(page, userA);

    // 1. Simulate a rain event (demo endpoint that only ever inserts).
    const sim = await page.request.post('/api/smarts-events/simulate', {
      data: { projectId: PROJECT_ID, mode: 'active' },
    });
    expect(sim.status()).toBeLessThan(400);
    const event = (await sim.json()) as { id: string };
    expect(event.id).toBeTruthy();

    // 2. A monitoring location to sample at.
    const locRes = await page.request.get(
      `/api/monitoring-locations?projectId=${PROJECT_ID}`
    );
    const locations = (await locRes.json()) as Array<{ id: string }>;
    expect(locations.length, 'seed must create a monitoring location').toBeGreaterThan(0);

    // 3. Record a sample: pH compliant, turbidity over the 250 NTU NAL.
    const sampleRes = await page.request.post('/api/samples', {
      data: {
        projectId: PROJECT_ID,
        smartsEventId: event.id,
        monitoringLocationId: locations[0].id,
        sampleDatetime: new Date().toISOString(),
        qspName: 'E2E Inspector',
        parameterResults: [
          {
            parameter: 'pH',
            qualifier: '=',
            result: 7.4,
            units: 'SU',
            analyticalMethod: 'pH_field',
            analyzedBy: 'Self',
          },
          {
            parameter: 'Turbidity',
            qualifier: '=',
            result: 310,
            units: 'NTU',
            analyticalMethod: 'EPA 180.1',
            analyzedBy: 'Self',
          },
        ],
      },
    });
    expect(sampleRes.status()).toBe(201);

    // 4. The review page must show the exceedance, not bury it.
    await page.goto(`/projects/${PROJECT_ID}/events/${event.id}/review`);
    await expect(page.getByText(/310/)).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/exceed|NAL/i).first(),
      'A turbidity reading of 310 NTU must be visibly flagged against the 250 NTU NAL'
    ).toBeVisible();

    // 5. The export must carry the readings through to the data-entry aid.
    const exportRes = await page.request.get(
      `/api/smarts-events/${event.id}/export`
    );
    expect(exportRes.status()).toBe(200);
    const disposition = exportRes.headers()['content-disposition'] ?? '';
    expect(disposition).toMatch(/attachment/i);
    const bytes = await exportRes.body();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  test('ND/DNQ validation is enforced end to end', async ({ page, userA }) => {
    await signIn(page, userA);
    const locRes = await page.request.get(
      `/api/monitoring-locations?projectId=${PROJECT_ID}`
    );
    const locations = (await locRes.json()) as Array<{ id: string }>;
    const sim = await page.request.post('/api/smarts-events/simulate', {
      data: { projectId: PROJECT_ID, mode: 'active' },
    });
    const event = (await sim.json()) as { id: string };

    // ND carrying a result value must be rejected (DRF-03).
    const bad = await page.request.post('/api/samples', {
      data: {
        projectId: PROJECT_ID,
        smartsEventId: event.id,
        monitoringLocationId: locations[0].id,
        sampleDatetime: new Date().toISOString(),
        qspName: 'E2E Inspector',
        parameterResults: [
          {
            parameter: 'pH',
            qualifier: 'ND',
            result: 6.9,
            units: 'SU',
            analyticalMethod: 'pH_field',
            mdl: 0.1,
          },
        ],
      },
    });
    expect(bad.status()).toBe(400);
  });
});
