// Deterministic fills for the Raw Data sample form. Monitoring Location is
// selected separately (setJsfSelectByText in run-fill.ts); this module owns
// Sample Date & Time, Qualified SWPPP Practitioner, and the pH/Turbidity table.

import type { Page } from "playwright";
import type { MonitoringRecord } from "../types/monitoring-record.js";
import type { HaltedResult } from "../types/run-result.js";
import { formatForSmarts } from "../validation/smarts-datetime.js";
import { setJsfSelectByText } from "../util/primefaces.js";

const SAMPLE_FORM_TIMEOUT_MS = 30_000;

// Sample Date & Time has a stable, human-named id.
const SAMPLE_DATETIME_ID = "constAdhocForm:CGPAdhocRawData:sampleDateTime_input";
// Qualified SWPPP Practitioner has only an auto-generated name (no stable id);
// target it by name and expect to re-recon if SMARTS renumbers j_idt###.
const QSP_NAME = "constAdhocForm:CGPAdhocRawData:j_idt284";

// Parameter row indexes inside the sample table — pH first, Turbidity second.
// These come from the rendered <tr> order under #constAdhocForm:CGPAdhocRawData:j_idt288_data
// and are structural (not dependent on j_idt### auto-ids).
const PH_ROW = 0;
const TURBIDITY_ROW = 1;

// Per-cell j_idt suffix offsets inside each row. The row name pattern is
// `constAdhocForm:CGPAdhocRawData:j_idt288:<row>:j_idt<suffix>`. The suffixes
// (294, 298, 301, 303, 305) are JSF auto-generated and may drift when SMARTS
// updates the form layout — recon with SMARTS_DUMP_FORM=1 if a fill halts.
const CELL_SUFFIX = {
  result: 294,
  analyticalMethod: 298,
  mdl: 301,
  rl: 303,
  analyzedBy: 305,
} as const;

const TABLE_PREFIX = "constAdhocForm:CGPAdhocRawData:j_idt288";

function cellName(row: number, suffix: number): string {
  return `${TABLE_PREFIX}:${row}:j_idt${suffix}`;
}

/**
 * Fill Sample Date & Time and Qualified SWPPP Practitioner on an open sample
 * form. Returns null on success, or a {@link HaltedResult} naming the first
 * field that could not be filled. Never throws.
 */
export async function fillSampleDetails(
  page: Page,
  record: MonitoringRecord,
): Promise<HaltedResult | null> {
  try {
    const dateTime = formatForSmarts(record.sampleDateTime); // MM/DD/YYYY HH:MM
    await setInputValue(
      page,
      `[id="${SAMPLE_DATETIME_ID}"]`,
      dateTime,
      "Sample Date & Time",
    );
    await setInputValue(
      page,
      `[name="${QSP_NAME}"]`,
      record.qspName ?? "",
      "Qualified SWPPP Practitioner",
    );
    return null;
  } catch (e) {
    return halt(
      `Sample details fill failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Set a text input's value directly and dispatch input + change. We set the
 * value rather than simulate typing because the date field has an
 * onkeydown="FormatDateTime(...)" handler + jQuery datepicker that mangles
 * synthetic keystrokes. The pH/turbidity table inputs also have
 * onkeydown="formatDigit" / onblur="validateNumbExit" handlers — dispatching
 * input + change + blur keeps the validator path consistent. Inline anonymous
 * arrow only — no named inner helpers (tsx/esbuild's __name wrapper is
 * undefined in the browser).
 */
async function setInputValue(
  page: Page,
  selector: string,
  value: string,
  label: string,
): Promise<void> {
  const input = page.locator(selector);
  try {
    await input.waitFor({ state: "visible", timeout: SAMPLE_FORM_TIMEOUT_MS });
  } catch {
    throw new Error(`${label} input ${selector} not found / not visible`);
  }
  await input.evaluate((el, v) => {
    (el as HTMLInputElement).value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }, value);
}

/**
 * Fill the pH and Turbidity parameter rows on an open sample form. Returns null
 * on success, or a {@link HaltedResult} naming the first cell that could not be
 * filled. Never throws.
 *
 * Per-row fields (skipping Result Qualifier — defaults to "="):
 *  - Result            (text, required)
 *  - Analytical Method (select, required) — from phAnalyticalMethod /
 *                       turbidityAnalyticalMethod, falling back to the legacy
 *                       single `analyticalMethod`
 *  - MDL, RL           (text; required when lab-analyzed per the form note)
 *  - Analyzed By       (select; "Lab" when labName is set, otherwise "Self")
 */
export async function fillSampleTable(
  page: Page,
  record: MonitoringRecord,
): Promise<HaltedResult | null> {
  const analyzedBy = record.labName?.trim() ? "Lab" : "Self";

  const phMethod = record.phAnalyticalMethod ?? record.analyticalMethod ?? null;
  const turbidityMethod =
    record.turbidityAnalyticalMethod ?? record.analyticalMethod ?? null;

  const phResult = numberToText(record.phValue);
  const turbidityResult = numberToText(record.turbidityNtu);

  const phHalt = await fillParameterRow(page, {
    label: "pH",
    row: PH_ROW,
    result: phResult,
    method: phMethod,
    mdl: record.mdlPh,
    rl: record.rlPh,
    analyzedBy,
  });
  if (phHalt !== null) return phHalt;

  const turbidityHalt = await fillParameterRow(page, {
    label: "Turbidity",
    row: TURBIDITY_ROW,
    result: turbidityResult,
    method: turbidityMethod,
    mdl: record.mdlTurbidity,
    rl: record.rlTurbidity,
    analyzedBy,
  });
  if (turbidityHalt !== null) return turbidityHalt;

  return null;
}

interface ParameterRowFill {
  label: string;
  row: number;
  result: string | null;
  method: string | null;
  mdl: string | undefined;
  rl: string | undefined;
  analyzedBy: string;
}

async function fillParameterRow(
  page: Page,
  fill: ParameterRowFill,
): Promise<HaltedResult | null> {
  if (fill.result === null) {
    return halt(`${fill.label}: result value is missing from record`);
  }
  if (fill.method === null || fill.method.trim() === "") {
    return halt(
      `${fill.label}: analytical method is missing (set ${fill.label === "pH" ? "phAnalyticalMethod" : "turbidityAnalyticalMethod"} or analyticalMethod)`,
    );
  }

  try {
    await setInputValue(
      page,
      `[name="${cellName(fill.row, CELL_SUFFIX.result)}"]`,
      fill.result,
      `${fill.label} Result`,
    );

    const methodSel = await setJsfSelectByText(
      page,
      fill.method,
      undefined,
      undefined,
      cellName(fill.row, CELL_SUFFIX.analyticalMethod),
    );
    if (!methodSel.found || !methodSel.optionFound) {
      return halt(
        `${fill.label} Analytical Method "${fill.method}" did not match an option (found=${methodSel.found}, optionFound=${methodSel.optionFound})`,
      );
    }

    if (fill.mdl !== undefined && fill.mdl !== "") {
      await setInputValue(
        page,
        `[name="${cellName(fill.row, CELL_SUFFIX.mdl)}"]`,
        fill.mdl,
        `${fill.label} MDL`,
      );
    }

    if (fill.rl !== undefined && fill.rl !== "") {
      await setInputValue(
        page,
        `[name="${cellName(fill.row, CELL_SUFFIX.rl)}"]`,
        fill.rl,
        `${fill.label} RL`,
      );
    }

    const analyzedSel = await setJsfSelectByText(
      page,
      fill.analyzedBy,
      undefined,
      undefined,
      cellName(fill.row, CELL_SUFFIX.analyzedBy),
    );
    if (!analyzedSel.found || !analyzedSel.optionFound) {
      return halt(
        `${fill.label} Analyzed By "${fill.analyzedBy}" did not match an option (found=${analyzedSel.found}, optionFound=${analyzedSel.optionFound})`,
      );
    }

    return null;
  } catch (e) {
    return halt(
      `${fill.label} row fill failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function numberToText(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  return String(n);
}

function halt(reason: string): HaltedResult {
  return {
    status: "halted",
    reason,
    record: null,
    screenshotPath: null,
    domSnapshotPath: null,
    haltedAt: new Date(),
  };
}
