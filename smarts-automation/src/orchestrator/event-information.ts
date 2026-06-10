// Piece 1: deterministic automation of the Event Information tab on the SMARTS
// Construction Ad Hoc report (ConstructionAdhocMain.xhtml). The bot starts once
// the report form is loaded with the sidebar visible; it fills every field and
// confirms the save succeeded. It NEVER certifies or submits — a human does that.

import type { Page } from "playwright";
import type { MonitoringRecord } from "../types/monitoring-record.js";
import type { HaltedResult } from "../types/run-result.js";
import { clickButtonByText } from "./structural-clicks.js";
import { setJsfSelectByText } from "../util/primefaces.js";

const EVENT_INFO_TIMEOUT_MS = 30_000;

// Event Type is a JSF selectOneMenu whose id is AUTO-GENERATED (e.g. j_idt127)
// and drifts between page versions — a live run proved the recon'd id was stale.
// So we select it by its OPTION text ("Precipitation Event", value "5" in the
// recon HTML) rather than by id; this is resilient to id drift.
// Exported: the duplicate-draft guard defaults its Event Type match to this
// same constant so the value the form fills and the value the guard scans for
// can never silently diverge.
export const EVENT_TYPE_OPTION = "Precipitation Event";

// The date/time/precip inputs have stable, human-named ids (not j_idt###). JSF
// ids contain ":", so in a CSS selector they need an [id="..."] attribute
// selector (a "#id" would mis-parse the colon).
const EVENT_START_DATE_ID = "constAdhocForm:CGPAdhocEventInfo:eventStartDate_input";
const EVENT_START_TIME_ID = "constAdhocForm:CGPAdhocEventInfo:eventStartTime";
const EVENT_END_DATE_ID = "constAdhocForm:CGPAdhocEventInfo:eventEndDate_input";
const EVENT_END_TIME_ID = "constAdhocForm:CGPAdhocEventInfo:eventEndTime";
const PRECIP_AMOUNT_ID = "constAdhocForm:CGPAdhocEventInfo:rainFallAmount";

/**
 * Fill and save the Event Information tab from `record`.
 *
 * Returns `null` on success, or a {@link HaltedResult} describing the first step
 * that failed (so the orchestrator can screenshot and stop). Never throws —
 * unexpected errors are converted to a HaltedResult.
 */
export async function fillEventInformation(
  page: Page,
  record: MonitoringRecord,
): Promise<HaltedResult | null> {
  try {
    // 1. Open the Event Information sidebar tab; confirm the form rendered by
    //    waiting for the visible "Event Type" label.
    await page
      .getByText("Event Information", { exact: true })
      .first()
      .click({ timeout: EVENT_INFO_TIMEOUT_MS });
    await page
      .getByText("Event Type", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: EVENT_INFO_TIMEOUT_MS });

    // 2. Event Type: pick the "Precipitation Event" option. setJsfSelectByText
    //    finds the <select> that has that option (no fragile id), sets its value,
    //    and dispatches "change" to fire the onchange JSF AJAX. It runs an inline
    //    arrow inside page.evaluate, so it's free of the tsx/esbuild __name issue.
    const eventType = await setJsfSelectByText(page, EVENT_TYPE_OPTION);
    if (!eventType.found || !eventType.optionFound) {
      return halt(
        `Event Type <select> not usable: no dropdown with a "${EVENT_TYPE_OPTION}" ` +
          `option was found (found=${eventType.found}, optionFound=${eventType.optionFound}, ` +
          `id=${eventType.selectId ?? "none"})`,
      );
    }

    // 3-7. Fill the date / time / precipitation text inputs. Each is cleared
    //      first, then typed, so a JSF-prefilled value cannot bleed through.
    await clearAndType(page, "Event Start Date", EVENT_START_DATE_ID, record.eventStartDate ?? "");
    await clearAndType(page, "Event Start Time", EVENT_START_TIME_ID, record.eventStartTime ?? "");
    await clearAndType(page, "Event End Date", EVENT_END_DATE_ID, record.eventEndDate ?? "");
    await clearAndType(page, "Event End Time", EVENT_END_TIME_ID, record.eventEndTime ?? "");
    await clearAndType(page, "Precipitation Amount", PRECIP_AMOUNT_ID, record.precipitationInches ?? "");

    // 8. Save, then confirm: re-query the Event Start Date input — it must still
    //    hold a value. A blank field after save means the save did not take.
    await clickButtonByText(page, "Save Event Information");

    const startDateAfter = await page
      .locator(`[id="${EVENT_START_DATE_ID}"]`)
      .inputValue({ timeout: EVENT_INFO_TIMEOUT_MS })
      .catch(() => "");
    if (startDateAfter.trim() === "") {
      return halt(
        `Save Event Information did not confirm: Event Start Date is blank after save (expected "${
          record.eventStartDate ?? ""
        }")`,
      );
    }

    return null;
  } catch (e) {
    return halt(
      `Event Information automation failed: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}

/**
 * Focus a text input by its (colon-containing) JSF id, clear it, then type
 * `value`. Uses select-all + delete so the field is empty before typing.
 */
async function clearAndType(
  page: Page,
  label: string,
  id: string,
  value: string,
): Promise<void> {
  const input = page.locator(`[id="${id}"]`);
  try {
    await input.waitFor({ state: "visible", timeout: EVENT_INFO_TIMEOUT_MS });
  } catch {
    throw new Error(`${label} input [id="${id}"] not found / not visible`);
  }
  await input.click({ timeout: EVENT_INFO_TIMEOUT_MS });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
  if (value !== "") await page.keyboard.type(value);
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
