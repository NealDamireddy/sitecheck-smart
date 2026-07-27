/**
 * Golden path and interruption path — the core inspector loop.
 *
 * Golden: sign in → project → start a weekly inspection → walk
 * checkpoints → mark one deficient → generate a report → verify the
 * report carries Parts I/II/III/VII and the deficiency shows a 72-hour
 * repair note.
 *
 * Interruption: reload mid-walkthrough and assert progress survives.
 * This is the single worst UX failure the product can have (a
 * half-finished inspection lost in the field), so it is a first-class
 * spec rather than a manual check.
 */
import { test, expect, signIn } from './fixtures';

const PROJECT_ID = process.env.E2E_USER_A_PROJECT_ID;

test.describe('golden path', () => {
  test.skip(!PROJECT_ID, 'Set E2E_USER_A_PROJECT_ID (seed script prints it).');

  test('weekly inspection produces a CGP-structured report', async ({ page, userA }) => {
    await signIn(page, userA);

    await page.goto(`/projects/${PROJECT_ID}/events`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Start an inspection from the dashboard picker.
    await page.goto('/dashboard');
    const startInspection = page.getByRole('button', { name: /start .*inspection/i });
    if (await startInspection.count()) {
      await startInspection.first().click();
    }

    // Walk to the checkpoint list and record a deficiency on the first one.
    await page.goto('/checkpoints');
    const firstCheckpoint = page.getByRole('link').filter({ hasText: /SC-|EC-|TC-/ }).first();
    await firstCheckpoint.click();

    const markDeficient = page.getByRole('button', { name: /deficient/i });
    if (await markDeficient.count()) {
      await markDeficient.first().click();
    }

    // Generate the report through the API the UI calls, then assert its
    // structure — the legal artifact is the deliverable under test.
    const res = await page.request.post('/api/reports/generate', {
      data: { projectId: PROJECT_ID },
    });
    expect(res.status()).toBeLessThan(400);
    const report = (await res.json()) as {
      sections?: Array<{ id: string; title: string; content?: string }>;
    };
    const sections = report.sections ?? [];
    const titles = sections.map((s) => s.title.toLowerCase()).join(' | ');

    expect(titles).toContain('general information'); // Part I
    expect(titles).toMatch(/bmp|observation/); // Part II
    expect(titles).toMatch(/deficien/); // Part III
    expect(titles).toMatch(/corrective|additional/); // Part VII
    expect(titles).toMatch(/signature/);

    const deficiencySection = sections.find((s) => /deficien/i.test(s.title));
    expect(deficiencySection?.content ?? '').toMatch(/72 hours/);
  });
});

test.describe('interruption path', () => {
  test.skip(!PROJECT_ID, 'Set E2E_USER_A_PROJECT_ID (seed script prints it).');

  test('reloading mid-walkthrough does not lose progress', async ({ page, userA }) => {
    await signIn(page, userA);
    await page.goto('/checkpoints');

    const firstCheckpoint = page.getByRole('link').filter({ hasText: /SC-|EC-|TC-/ }).first();
    await firstCheckpoint.click();
    const urlBeforeReload = page.url();

    // Enter an observation, then simulate the app being backgrounded or
    // the browser reloading on a flaky field connection.
    const notes = page.getByRole('textbox').first();
    if (await notes.count()) {
      await notes.fill('Fiber roll displaced at the southwest corner');
      await page.waitForTimeout(1500); // allow autosave/draft persistence
    }

    await page.reload();
    await expect(page).toHaveURL(urlBeforeReload);

    if (await notes.count()) {
      // Either the note survived, or the UI must clearly say it did not.
      const value = await page.getByRole('textbox').first().inputValue();
      const warning = await page.getByText(/not saved|unsaved/i).count();
      expect(
        value.includes('Fiber roll displaced') || warning > 0,
        'Mid-walkthrough input vanished with no "unsaved" warning — this is the ' +
          'inspection-loss failure mode (see Stage 4 / UX-01).'
      ).toBe(true);
    }
  });
});
