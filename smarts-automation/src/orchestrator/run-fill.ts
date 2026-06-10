// INVARIANT: This module NEVER clicks the Certification submit button.
// NEVER checks the attestation checkbox.
// NEVER submits the form.
// The human certifies. Always. This is non-negotiable.

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import type {
  SMARTSCredentials,
  SMARTSSession,
} from "../auth/types.js";
import { createSession } from "../auth/create-session.js";
import type { MonitoringRecord } from "../types/monitoring-record.js";
import type { HaltedResult } from "../types/run-result.js";
import { setJsfSelectByText } from "../util/primefaces.js";
import { fillEventInformation, EVENT_TYPE_OPTION } from "./event-information.js";
import { fillSampleDetails, fillSampleTable } from "./sample-form.js";
import type { DraftResumeKey } from "./find-existing-draft.js";
import { navigateToProject, navigateToTab } from "./navigate.js";
import {
  clickButtonByText,
  openNewSampleForm,
  waitForSampleInList,
} from "./structural-clicks.js";
import type {
  RunResult,
  OrchestratorFilledResult,
  ReviewPackage,
} from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = resolve(HERE, "..", "..");
const DEFAULT_ARTIFACTS_ROOT = resolve(MODULE_ROOT, "artifacts");

export interface RunFillOptions {
  artifactsDir?: string;
  headless?: boolean;
  closeSessionAfter?: boolean;
  /**
   * Facility/Site Name EXACTLY as displayed on the first line of the
   * Facility/Site Name & Address column in the SMARTS "Ad Hoc Reports -
   * Outstanding" table (e.g. "Equus Ct"; case-insensitive). When present
   * alongside event start/end on the records, runFill checks for an existing
   * draft for the same (siteName, reporting period, event type) and resumes it
   * instead of creating a new report. Without this, every run creates a new
   * draft (legacy behavior).
   */
  siteName?: string;
  /**
   * Event Type label as it appears in the outstanding table's "Event Type"
   * column. Defaults to {@link EVENT_TYPE_OPTION} ("Precipitation Event") —
   * the same constant `fillEventInformation` selects in the form, so the
   * guard and the fill cannot diverge.
   */
  eventType?: string;
}

export async function runFill(
  credentials: SMARTSCredentials,
  wdid: string,
  records: MonitoringRecord[],
  options: RunFillOptions = {},
): Promise<RunResult> {
  if (records.length === 0) {
    return halted("runFill: records array is empty", null, null);
  }

  const artifactsDir =
    options.artifactsDir ??
    resolve(DEFAULT_ARTIFACTS_ROOT, `run-${runStamp()}`);
  try {
    await mkdir(artifactsDir, { recursive: true });
  } catch (e) {
    return halted(
      `runFill: could not create artifacts dir: ${(e as Error).message}`,
      null,
      null,
    );
  }

  const sessionResult = await createSession(credentials, {
    headless: options.headless ?? true,
  });
  if (sessionResult.status !== "authenticated") {
    return sessionResult;
  }

  const session = sessionResult.session;
  const page = session.page;
  const closeAfter = options.closeSessionAfter ?? true;

  const sampleScreenshots: string[] = [];

  const finish = async (
    result: RunResult,
  ): Promise<RunResult> => {
    if (closeAfter) {
      try {
        await session.close();
      } catch {
        /* noop */
      }
    }
    return result;
  };

  try {
    const navResult = await navigateToProject(session, {
      wdid,
      resume: buildResumeKey(records[0]!, options),
    });
    if (navResult.status === "halted") {
      const path = await safeScreenshot(
        page,
        artifactsDir,
        "halt-nav-project.png",
      );
      return finish(stamp(navResult, path));
    }
    // When we resumed an existing draft, Event Information is already saved
    // (SMARTS preserves it; the user confirmed this against the live UI). Skip
    // the deterministic re-fill so we don't clobber the saved values.
    if (navResult.mode === "new") {
      const eventInfoHalt = await fillEventInformation(page, records[0]!);
      if (eventInfoHalt !== null) {
        const path = await safeScreenshot(
          page,
          artifactsDir,
          "halt-event-info.png",
        );
        return finish(stamp(eventInfoHalt, path));
      }
    } else {
      console.log(
        `orchestrator: resumed existing draft ${navResult.reportId ?? "?"} — skipping Event Information fill`,
      );
    }

    await navigateToTab(session, "Raw Data");

    for (let i = 0; i < records.length; i++) {
      const record = records[i]!;
      // Opens the sample form (clicks the button, not the instructional text)
      // and waits for the Monitoring Location field to render.
      await openNewSampleForm(page);

      // Read-only recon: SMARTS_DUMP_FORM=1 logs the sample form's control ids +
      // option lists once (first sample) so the Raw Data dropdowns can be driven
      // deterministically like the reporting-year field. No-op without the flag.
      if (i === 0 && process.env["SMARTS_DUMP_FORM"]) {
        await dumpSampleFormControls(page);
      }

      // Monitoring Location: deterministic (the report-year method). Match the
      // native <select> by its option TEXT (the location name) and dispatch
      // change — robust to the auto-generated id (j_idt###) and the numeric
      // option values both drifting.
      const locationSel = await setJsfSelectByText(
        page,
        record.monitoringLocationName,
      );
      if (!locationSel.found || !locationSel.optionFound) {
        const path = await safeScreenshot(
          page,
          artifactsDir,
          `halt-sample-${i + 1}-location.png`,
        );
        return finish(
          halted(
            `Monitoring Location "${record.monitoringLocationName}" is not an option in the sample form dropdown (found=${locationSel.found}, optionFound=${locationSel.optionFound})`,
            path,
            null,
          ),
        );
      }

      // Sample Date & Time + QSP: deterministic (set value + dispatch change).
      const detailsHalt = await fillSampleDetails(page, record);
      if (detailsHalt !== null) {
        const path = await safeScreenshot(
          page,
          artifactsDir,
          `halt-sample-${i + 1}-details.png`,
        );
        return finish(stamp(detailsHalt, path));
      }

      // pH + Turbidity table: deterministic per-row fills (Result, Analytical
      // Method, MDL, RL, Analyzed By). Replaces the previous two vision
      // fillFormSection passes — vision was hallucinating non-existent options
      // (e.g. "EPA 150.1" against the live A4500HB / E150.2 / pH_Field set,
      // and Result Qualifier "J" against the =/</> domain).
      const tableHalt = await fillSampleTable(page, record);
      if (tableHalt !== null) {
        const path = await safeScreenshot(
          page,
          artifactsDir,
          `halt-sample-${i + 1}-table.png`,
        );
        return finish(stamp(tableHalt, path));
      }

      await clickButtonByText(page, "Save Sample");
      await waitForSampleInList(page, record.monitoringLocationName);

      const sampleShot = await safeScreenshot(
        page,
        artifactsDir,
        `sample-${i + 1}.png`,
      );
      if (sampleShot) sampleScreenshots.push(sampleShot);
    }

    await navigateToTab(session, "Data Summary");
    const dataSummaryShot =
      (await safeScreenshot(page, artifactsDir, "data-summary.png")) ?? "";

    await navigateToTab(session, "Certification");
    const certificationShot =
      (await safeScreenshot(page, artifactsDir, "certification.png")) ?? "";

    const reviewPackage: ReviewPackage = {
      records,
      sampleScreenshots,
      dataSummaryScreenshot: dataSummaryShot,
      certificationScreenshot: certificationShot,
    };

    const filled: OrchestratorFilledResult = {
      status: "filled",
      records,
      filledAt: new Date(),
      reviewPackage,
    };
    return finish(filled);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const path = await safeScreenshot(page, artifactsDir, "halt-uncaught.png");
    return finish(halted(reason, path, null));
  }
}

function halted(
  reason: string,
  screenshotPath: string | null,
  domSnapshotPath: string | null,
): HaltedResult {
  return {
    status: "halted",
    reason,
    record: null,
    screenshotPath,
    domSnapshotPath,
    haltedAt: new Date(),
  };
}

function stamp(existing: HaltedResult, screenshotPath: string | null): HaltedResult {
  if (existing.screenshotPath) return existing;
  return { ...existing, screenshotPath };
}

async function safeScreenshot(
  page: Page,
  artifactsDir: string,
  filename: string,
): Promise<string | null> {
  const out = resolve(artifactsDir, filename);
  try {
    await page.screenshot({ path: out, fullPage: false });
    return out;
  } catch {
    return null;
  }
}

// Read-only diagnostic. Inline anonymous arrow only (no named inner helpers) so
// tsx/esbuild's __name wrapper can't leak into the page context.
async function dumpSampleFormControls(page: Page): Promise<void> {
  const controls = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("select,input,textarea"))
      .filter(
        (el) =>
          (el.id || "").includes("constAdhocForm") ||
          ((el as HTMLInputElement).name || "").includes("constAdhocForm"),
      )
      .map((el) => {
        if (el.tagName === "SELECT") {
          const s = el as HTMLSelectElement;
          return {
            tag: "select",
            id: s.id,
            name: s.name,
            options: Array.from(s.options).map((o) => o.value + "=" + o.text.trim()),
          };
        }
        const f = el as HTMLInputElement;
        return { tag: el.tagName.toLowerCase(), id: f.id, name: f.name, type: f.type };
      });
  });
  console.log(
    `[dump] sample form controls (${controls.length}):\n${JSON.stringify(controls, null, 2)}`,
  );
}

function runStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Build the optional draft-resume key from the first record + run options. All
 * three pieces (siteName, reporting period, event type) must be present to
 * enable the duplicate check; if any are missing, returns undefined and the
 * bot falls back to always creating a new draft.
 */
function buildResumeKey(
  record: MonitoringRecord,
  options: RunFillOptions,
): DraftResumeKey | undefined {
  const siteName = options.siteName?.trim();
  const eventType = (options.eventType ?? EVENT_TYPE_OPTION).trim();
  const start = record.eventStartDate?.trim();
  const end = record.eventEndDate?.trim();
  if (!siteName || !start || !end) return undefined;
  return {
    siteName,
    reportingPeriod: `${start} - ${end}`,
    eventType,
  };
}

export type { SMARTSSession };
