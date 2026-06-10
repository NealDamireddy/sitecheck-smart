import type { Page } from "playwright";

export const STRUCTURAL_TIMEOUT_MS = 30_000;

export async function clickButtonByText(
  page: Page,
  text: string,
  timeoutMs: number = STRUCTURAL_TIMEOUT_MS,
): Promise<void> {
  await page
    .getByText(text, { exact: false })
    .first()
    .click({ timeout: timeoutMs });
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

/**
 * Open the "Create New Sample" form on the Raw Data tab and wait for it to
 * render. The list page contains the words "Create New Sample" in BOTH an
 * instructional sentence and the actual button, so a loose getByText().first()
 * clicks the sentence (no-op) and the form never opens. Target the button/link
 * by ROLE + accessible name, then confirm the form rendered via its "Monitoring
 * Location" label.
 */
export async function openNewSampleForm(
  page: Page,
  timeoutMs: number = STRUCTURAL_TIMEOUT_MS,
): Promise<void> {
  await page
    .getByRole("button", { name: "Create New Sample" })
    .or(page.getByRole("link", { name: "Create New Sample" }))
    .first()
    .click({ timeout: timeoutMs });
  await page
    .getByText("Monitoring Location", { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs });
}

export async function waitForSampleInList(
  page: Page,
  locationName: string,
  timeoutMs: number = STRUCTURAL_TIMEOUT_MS,
): Promise<void> {
  await page
    .getByText(locationName, { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs });
}
