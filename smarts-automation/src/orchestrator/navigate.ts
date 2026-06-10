import type { Locator, Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SMARTSSession } from "../auth/types.js";
import type { HaltedResult } from "../types/run-result.js";
import {
  findExistingDraft,
  type DraftResumeKey,
} from "./find-existing-draft.js";

const NAV_TIMEOUT_MS = 30_000;

/** Inputs for {@link navigateToProject}. */
export interface NavigateKey {
  /** Required for the new-report path (step 6 matches the row by WDID text). */
  wdid: string;
  /**
   * Optional resume key — when present and a single matching draft exists in
   * the Ad Hoc Reports - Outstanding table, the bot opens that draft instead
   * of creating a new one. When ANY field is missing, the bot falls through to
   * the current "always create new" behavior. Multi-match halts (one draft per
   * event is the rule; multi-match means SMARTS state needs human cleanup).
   */
  resume?: DraftResumeKey;
}

/**
 * Discriminated success result from {@link navigateToProject}. `mode` tells the
 * orchestrator whether it should still fill the Event Information tab (`new`)
 * or skip it because the resumed draft already has it filled (`resumed`).
 */
export interface NavigatedResult {
  status: "navigated";
  mode: "new" | "resumed";
  /** Populated when `mode === "resumed"`. */
  reportId: string | null;
}

export type NavigateResult = NavigatedResult | HaltedResult;

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = resolve(HERE, "..", "..", "artifacts");

export const SMARTS_HOME_URL =
  "https://smarts.waterboards.ca.gov/smarts/faces/SwSmartsMainMenuRd.xhtml";

export const REPORTING_YEAR = "2025 - 2026";
// The <option> value for the "2025 - 2026" reporting period is "2025" (NOT
// "2026", the future period starting July 2026). We drive the select by value
// because it is stable regardless of the display text's exact whitespace.
export const REPORTING_YEAR_VALUE = "2025";
export const REPORTING_YEAR_SELECT_ID = "noiReadyForm:selectedReportingYearId_input";
// Selecting a year does not navigate; the JSF AJAX response injects this panel
// into the existing page. Its appearance is our success signal for step 5.
export const NEW_ADHOC_PANEL_ID = "noiReadyForm:newAdhocPanel";

export async function navigateToProject(
  session: SMARTSSession,
  key: NavigateKey,
): Promise<NavigateResult> {
  const wdid = key.wdid;
  if (!wdid || wdid.trim() === "") {
    throw new Error("navigateToProject: wdid is required");
  }

  const page = session.page;
  await mkdir(ARTIFACTS_DIR, { recursive: true }).catch(() => undefined);

  // SMARTS fires a JSF "navigating away will lose unsaved data" confirm()
  // dialog on several links. Auto-accept so navigation is never blocked.
  page.on("dialog", (dialog) => {
    console.log(`[nav] dialog auto-accepted: ${dialog.message()}`);
    void dialog.accept().catch(() => undefined);
  });

  // The dashboard renders "File Reports" twice: a top-nav menu item and a
  // body tile. Scope to the nav menubar so we always click the menu item.
  const fileReportsNavAll = (): Locator =>
    page
      .locator(".smarts-main-menubar")
      .locator("a.ui-menuitem-link", { hasText: "File Reports" });
  const fileReportsNav = (): Locator => fileReportsNavAll().first();

  // Step 1: load the dashboard and confirm the nav "File Reports" rendered.
  try {
    console.log(`[nav] step 1: opening dashboard ${SMARTS_HOME_URL}`);
    await page.goto(SMARTS_HOME_URL, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
    await fileReportsNav().waitFor({ state: "visible", timeout: NAV_TIMEOUT_MS });
    await trace(page, 1, "dashboard loaded");
    await logLocation(page);
  } catch (e) {
    await trace(page, 1, "dashboard load failed");
    return haltAt(
      1,
      `dashboard did not load / nav "File Reports" not visible at ${SMARTS_HOME_URL} (${reasonOf(e)})`,
    );
  }

  // Step 2: click the nav File Reports; the reports menu is confirmed by the
  // presence of "Ad Hoc Monitoring Reports" (JSF postback, no clean URL load).
  try {
    const navCount = await fileReportsNavAll()
      .count()
      .catch(() => -1);
    const pageCount = await page
      .getByText("File Reports", { exact: false })
      .count()
      .catch(() => -1);
    console.log(
      `[nav] step 2: "File Reports" found=${navCount > 0} — nav-menubar matches=${navCount}, page-wide matches=${pageCount} (body tile + nav); clicking the first nav-menubar match`,
    );
    await trace(page, 2, "clicking File Reports");
    await fileReportsNav().click({ timeout: NAV_TIMEOUT_MS });
    await page
      .getByText("Ad Hoc Monitoring Reports", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: NAV_TIMEOUT_MS });
    await trace(page, 2, "reports menu loaded");
    await logLocation(page);
  } catch (e) {
    await trace(page, 2, "File Reports click failed");
    return haltAt(
      2,
      `after clicking File Reports, "Ad Hoc Monitoring Reports" did not appear on the reports menu (${reasonOf(e)})`,
    );
  }

  // Step 3: click Ad Hoc Monitoring Reports; the ad hoc list page is confirmed
  // by the "Ad Hoc Reports - Outstanding" header or the "Start Ad Hoc Report"
  // button becoming visible.
  try {
    await trace(page, 3, "clicking Ad Hoc Monitoring Reports");
    await page
      .getByText("Ad Hoc Monitoring Reports", { exact: false })
      .first()
      .click({ timeout: NAV_TIMEOUT_MS });
    await waitForAnyVisible(
      [
        page.getByText("Ad Hoc Reports - Outstanding", { exact: false }).first(),
        page.getByText("Start Ad Hoc Report", { exact: false }).first(),
      ],
      NAV_TIMEOUT_MS,
    );
    await trace(page, 3, "ad hoc reports list loaded");
    await logLocation(page);
  } catch (e) {
    await trace(page, 3, "ad hoc reports list failed");
    return haltAt(
      3,
      `after clicking Ad Hoc Monitoring Reports, the ad hoc list ("Ad Hoc Reports - Outstanding" / "Start Ad Hoc Report") did not appear (${reasonOf(e)})`,
    );
  }

  // Step 3.5: if the caller passed a resume key, scan the Ad Hoc Reports -
  // Outstanding table for a matching draft. Exactly one match -> click into
  // that draft (skip steps 4-6 entirely; Event Information is already filled
  // and SMARTS preserves it across resumes). Zero matches -> fall through to
  // step 4 (current "create new" path). Multi-match -> halt; SMARTS has
  // accumulated duplicate drafts for this event and needs human cleanup.
  if (key.resume) {
    try {
      const matches = await findExistingDraft(page, key.resume);
      if (matches.length > 1) {
        const ids = matches.map((m) => m.reportId).join(", ");
        return haltAt(
          3,
          `multiple existing drafts (${matches.length}) match site="${key.resume.siteName}" ` +
            `period="${key.resume.reportingPeriod}" type="${key.resume.eventType}": [${ids}]. ` +
            `Per "one draft per event", delete the duplicates in SMARTS and re-run.`,
        );
      }
      if (matches.length === 1) {
        const match = matches[0]!;
        console.log(
          `[nav] step 3.5: resuming existing draft reportId=${match.reportId} (${match.linkElementId})`,
        );
        await trace(page, 3, "resuming existing draft");
        try {
          await page
            .locator(`[id="${match.linkElementId}"]`)
            .click({ timeout: NAV_TIMEOUT_MS });
          await page
            .getByText("Event Information", { exact: false })
            .first()
            .waitFor({ state: "visible", timeout: NAV_TIMEOUT_MS });
          await trace(page, 3, "existing draft loaded (Event Information visible)");
          await logLocation(page);
          return {
            status: "navigated",
            mode: "resumed",
            reportId: match.reportId,
          };
        } catch (e) {
          await trace(page, 3, "resume click / load failed");
          return haltAt(
            3,
            `clicked existing draft ${match.reportId} but did not land on the report form (${reasonOf(e)})`,
          );
        }
      }
      console.log(`[nav] step 3.5: no matching existing drafts; creating new`);
    } catch (e) {
      // findExistingDraft itself never throws, but defensively handle it.
      console.log(
        `[nav] step 3.5: resume scan failed (${reasonOf(e)}); falling through to create new`,
      );
    }
  }

  // Step 4: click "Start Ad Hoc Report". Success = the reporting-year dropdown
  // (noiReadyForm:selectedReportingYearId_input) appears. We wait on the select
  // itself, NOT on helper text like "Click the Start Report link..." — that text
  // only shows up after a year is chosen, so waiting for it here hangs. The
  // select is also exactly what step 5 drives next.
  try {
    await trace(page, 4, "clicking Start Ad Hoc Report");
    await page
      .getByText("Start Ad Hoc Report", { exact: false })
      .first()
      .click({ timeout: NAV_TIMEOUT_MS });
    await page
      .locator(`[id="${REPORTING_YEAR_SELECT_ID}"]`)
      .waitFor({ state: "attached", timeout: NAV_TIMEOUT_MS });
    await trace(page, 4, "reporting year dropdown present");
    await logLocation(page);
  } catch (e) {
    await trace(page, 4, "reporting year dropdown not found");
    return haltAt(
      4,
      `"Start Ad Hoc Report" did not reveal the reporting-year dropdown [id="${REPORTING_YEAR_SELECT_ID}"] (${reasonOf(e)})`,
    );
  }

  // Step 5: set the reporting year by driving the hidden native JSF <select>
  // directly. The visible PrimeFaces widget is a decoy; the real control is a
  // hidden <select id="noiReadyForm:selectedReportingYearId_input">. Its id
  // contains a ":", so target it with an [id="..."] attribute selector (a "#"
  // CSS selector would mis-parse the colon). Set value "2025" (= "2025 - 2026")
  // and dispatch "change" to fire its onchange="mojarra.ab(...)" JSF AJAX.
  // Selecting a year does NOT navigate; success is the AJAX-injected panel
  // noiReadyForm:newAdhocPanel becoming visible — wait on that, never on
  // navigation/networkidle.
  try {
    console.log(
      `[nav] step 5: setting reporting year "${REPORTING_YEAR}" (value "${REPORTING_YEAR_VALUE}") via [id="${REPORTING_YEAR_SELECT_ID}"]`,
    );
    // The select is already attached (step 4 waited for it). INLINE ANONYMOUS
    // ARROW ONLY (a named function would get tsx/esbuild's __name wrapper, which
    // is undefined in the browser). Set the hidden native <select> value and
    // dispatch a bubbling "change" — that fires the select's inline
    // onchange="mojarra.ab('noiReadyForm:selectedReportingYearId', event,
    // 'valueChange', 0, 'noiReadyForm:newAdhocPanel')", the JSF partial-postback
    // that injects newAdhocPanel. (Verified by hand in the page console.)
    const yearSelect = page.locator(`[id="${REPORTING_YEAR_SELECT_ID}"]`);
    await yearSelect.evaluate((node, value) => {
      const sel = node as HTMLSelectElement;
      sel.value = value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }, REPORTING_YEAR_VALUE);
    await trace(page, 5, "reporting year change dispatched");

    await page
      .locator(`[id="${NEW_ADHOC_PANEL_ID}"]`)
      .waitFor({ state: "visible", timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(500); // let the AJAX-injected DOM settle
    console.log(
      `[nav] step 5: "${NEW_ADHOC_PANEL_ID}" injected; reporting year applied`,
    );
    await trace(page, 5, "newAdhocPanel visible");
    await logLocation(page);
  } catch (e) {
    await trace(page, 5, "reporting year selection failed");
    return haltAt(
      5,
      `could not select reporting year "${REPORTING_YEAR}" (value "${REPORTING_YEAR_VALUE}") via [id="${REPORTING_YEAR_SELECT_ID}"] / panel [id="${NEW_ADHOC_PANEL_ID}"] did not appear (${reasonOf(e)})`,
    );
  }

  // Step 6: find the row for this WDID and click its "Start New Report" link.
  try {
    console.log(`[nav] step 6: locating WDID row "${wdid}"`);
    const row = page
      .locator("tr", {
        has: page.getByText(wdid, { exact: false }),
      })
      .first();
    await row.waitFor({ state: "visible", timeout: NAV_TIMEOUT_MS });
    await trace(page, 6, "clicking Start New Report for WDID");
    await row
      .getByText("Start New Report", { exact: true })
      .first()
      .click({ timeout: NAV_TIMEOUT_MS });
    await trace(page, 6, "Start New Report clicked");
    await logLocation(page);
  } catch (e) {
    await trace(page, 6, "WDID row / Start New Report failed");
    return haltAt(
      6,
      `WDID ${wdid} row or its "Start New Report" link not found on the Select the Reporting Year page (${reasonOf(e)})`,
    );
  }

  // Step 7 (final): confirm arrival on the report form via the sidebar text.
  // Any "navigating away" confirm() is auto-accepted by the dialog handler.
  try {
    await page
      .getByText("Event Information", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: NAV_TIMEOUT_MS });
    await trace(page, 7, "report form loaded (Event Information visible)");
    await logLocation(page);
  } catch (e) {
    await trace(page, 7, "report form not reached");
    return haltAt(
      7,
      `"Event Information" sidebar not visible on the Ad Hoc report form (${reasonOf(e)})`,
    );
  }

  return { status: "navigated", mode: "new", reportId: null };
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "step"
  );
}

async function trace(page: Page, step: number, action: string): Promise<void> {
  console.log(`[nav] step ${step}: ${action}`);
  const file = resolve(ARTIFACTS_DIR, `step-${step}-${slug(action)}.png`);
  try {
    await page.screenshot({ path: file, fullPage: false });
  } catch (e) {
    console.log(`[nav] step ${step}: screenshot failed (${reasonOf(e)})`);
  }
}

async function logLocation(page: Page): Promise<void> {
  let url = "";
  let title = "";
  try {
    url = page.url();
  } catch {
    /* best-effort */
  }
  try {
    title = await page.title();
  } catch {
    /* best-effort */
  }
  console.log(`[nav] now at: ${url} | title: ${title}`);
}

async function waitForAnyVisible(
  locators: Locator[],
  timeoutMs: number,
): Promise<void> {
  const waits = locators.map((l) =>
    l.waitFor({ state: "visible", timeout: timeoutMs }),
  );
  // Attach catch handlers so the slower/never-resolving wait does not surface
  // as an unhandled rejection once Promise.any settles on the first success.
  for (const w of waits) void w.catch(() => undefined);
  await Promise.any(waits);
}

export async function navigateToTab(
  session: SMARTSSession,
  tabName: string,
): Promise<void> {
  if (!tabName || tabName.trim() === "") {
    throw new Error("navigateToTab: tabName is required");
  }
  const page = session.page;
  await page
    .getByText(tabName, { exact: true })
    .first()
    .click({ timeout: NAV_TIMEOUT_MS });
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

function haltAt(step: number, description: string): HaltedResult {
  return {
    status: "halted",
    reason: `Navigation failed at step ${step}: ${description}`,
    record: null,
    screenshotPath: null,
    domSnapshotPath: null,
    haltedAt: new Date(),
  };
}

function reasonOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
