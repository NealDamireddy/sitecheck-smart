import type { Page } from "playwright";
import { HaltError, type VisionAction } from "./types.js";
import { setJsfSelectByText } from "../util/primefaces.js";

export const ACTION_SETTLE_MS = 500;

export async function executeAction(
  page: Page,
  action: VisionAction,
): Promise<void> {
  switch (action.type) {
    case "click": {
      await page.mouse.move(action.x, action.y);
      await page.mouse.click(action.x, action.y);
      await page.waitForTimeout(ACTION_SETTLE_MS);
      return;
    }
    case "type": {
      await page.mouse.move(action.x, action.y);
      await page.mouse.click(action.x, action.y);
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.press("Delete");
      await page.keyboard.type(action.value);
      await page.waitForTimeout(ACTION_SETTLE_MS);
      return;
    }
    case "select": {
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
