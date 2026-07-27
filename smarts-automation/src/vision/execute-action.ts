import type { Page } from "playwright";
import { HaltError, type VisionAction } from "./types.js";
import { setJsfSelectByText } from "../util/primefaces.js";

export const ACTION_SETTLE_MS = 500;

// ──────────────────────────────────────────────────────────────────────
// CERTIFICATION HARD-STOP (assertion-level guard, Stage 3).
//
// The scripted orchestrator never navigates past the certification
// screenshot (see the INVARIANT header in run-fill.ts), and the log
// parser rejects any run that claims a certified state (sync-job.ts).
// This guard closes the remaining hole: the vision loop executes
// model-generated actions at raw coordinates, so a hallucinated
// "click (x, y)" aimed at the Certify button or the attestation
// checkbox had nothing stopping it. Before ANY click/type/select, the
// element under the target point is inspected; if it looks like a
// certification control, the run halts hard.
//
// Fail-open on describe errors is deliberate: this is defense-in-depth
// behind two structural guards, and failing closed would halt benign
// runs on any transient evaluate error.
// ──────────────────────────────────────────────────────────────────────

export const CERTIFICATION_TARGET_PATTERN =
  /certif|attest|penalty of (law|perjury)/i;

/** Pure check, exported for tests. */
export function isForbiddenTarget(description: string): boolean {
  return CERTIFICATION_TARGET_PATTERN.test(description);
}

/**
 * Describe the interactive element under (x, y): tag, id, name, value,
 * type, own text, and enclosing label text — enough surface for the
 * pattern above to catch "Certify", "I certify under penalty of law…",
 * and attestation checkboxes reached via their labels.
 */
async function describeActionTarget(
  page: Page,
  x: number,
  y: number,
): Promise<string> {
  try {
    // NOTE: inline arrow only — a named function here gets tsx's
    // `__name` wrapper, which does not exist in the browser context.
    const result = await page.evaluate(
      (point) => {
        const el = document.elementFromPoint(point[0], point[1]);
        if (!el) return "";
        const control =
          el.closest("button, input, a, [role='button'], label, select") ?? el;
        const label = control.closest("label");
        return [
          control.tagName,
          control.getAttribute("id") ?? "",
          control.getAttribute("name") ?? "",
          control.getAttribute("value") ?? "",
          control.getAttribute("type") ?? "",
          (control.textContent ?? "").slice(0, 300),
          label ? (label.textContent ?? "").slice(0, 300) : "",
        ].join(" | ");
      },
      [x, y] as [number, number],
    );
    return typeof result === "string" ? result : "";
  } catch {
    return "";
  }
}

async function assertNotCertificationTarget(
  page: Page,
  x: number,
  y: number,
  actionType: string,
): Promise<void> {
  const description = await describeActionTarget(page, x, y);
  if (isForbiddenTarget(description)) {
    throw new HaltError(
      `CERTIFICATION HARD-STOP: refusing "${actionType}" on a certification control ` +
        `[${description.slice(0, 160)}]. The bot never certifies, never checks the ` +
        `attestation, never submits — a human must review and certify in SMARTS.`,
    );
  }
}

export async function executeAction(
  page: Page,
  action: VisionAction,
): Promise<void> {
  switch (action.type) {
    case "click": {
      await assertNotCertificationTarget(page, action.x, action.y, "click");
      await page.mouse.move(action.x, action.y);
      await page.mouse.click(action.x, action.y);
      await page.waitForTimeout(ACTION_SETTLE_MS);
      return;
    }
    case "type": {
      await assertNotCertificationTarget(page, action.x, action.y, "type");
      await page.mouse.move(action.x, action.y);
      await page.mouse.click(action.x, action.y);
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.press("Delete");
      await page.keyboard.type(action.value);
      await page.waitForTimeout(ACTION_SETTLE_MS);
      return;
    }
    case "select": {
      await assertNotCertificationTarget(page, action.x, action.y, "select");
      // SMARTS dropdowns are JSF/PrimeFaces selectOneMenus with a hidden native
      // <select> whose onchange="mojarra.ab(...)" drives the AJAX update. Set
      // the native value and dispatch "change" (find the matching <select>
      // nearest the vision point) rather than clicking the visual widget.
      const result = await setJsfSelectByText(page, action.optionText, undefined, {
        x: action.x,
        y: action.y,
      });
      if (!result.found || !result.optionFound) {
        throw new HaltError(
          `Could not set JSF <select> for "${action.optionText}" near (${action.x}, ${action.y}): found=${result.found}, optionFound=${result.optionFound}`,
        );
      }
      await page.waitForTimeout(ACTION_SETTLE_MS);
      return;
    }
    case "halt": {
      throw new HaltError(action.reason);
    }
    case "done": {
      return;
    }
  }
}
