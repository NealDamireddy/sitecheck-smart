import type { Page } from "playwright";
import type { MonitoringRecord } from "../types/monitoring-record.js";
import type { HaltedResult } from "../types/run-result.js";
import { interpretScreen } from "./interpret-screen.js";
import { executeAction } from "./execute-action.js";
import { verifyField } from "./verify-field.js";
import { HaltError, type VisionAction } from "./types.js";

export const DEFAULT_MAX_STEPS = 20;

export interface FillFormSectionCompleted {
  status: "completed";
  steps: number;
  reason: string;
}

export type FillFormSectionResult = FillFormSectionCompleted | HaltedResult;

export async function fillFormSection(
  page: Page,
  task: string,
  data: Partial<MonitoringRecord>,
  maxSteps: number = DEFAULT_MAX_STEPS,
): Promise<FillFormSectionResult> {
  for (let step = 1; step <= maxSteps; step++) {
    let action: VisionAction;
    try {
      const buf = await page.screenshot({ type: "png" });
      const b64 = buf.toString("base64");
      action = await interpretScreen(b64, task, data);
    } catch (e) {
      return halted(
        `screenshot/interpret failed: ${(e as Error).message}`,
      );
    }

    if (action.type === "halt") {
      return halted(action.reason);
    }
    if (action.type === "done") {
      return {
        status: "completed",
        steps: step,
        reason: action.reason,
      };
    }

    try {
      await executeAction(page, action);
    } catch (e) {
      if (e instanceof HaltError) return halted(e.haltReason);
      return halted(`executeAction error: ${(e as Error).message}`);
    }

    if (action.type === "type" || action.type === "select") {
      const expectedValue =
        action.type === "type" ? action.value : action.optionText;
      const ok = await verifyField(page, expectedValue, action.reason);
      if (!ok) {
        return halted(
          `verification failed for "${action.reason}" (expected "${expectedValue}")`,
        );
      }
    }
  }

  return halted("Vision loop exceeded max steps");
}

function halted(reason: string): HaltedResult {
  return {
    status: "halted",
    reason,
    record: null,
    screenshotPath: null,
    domSnapshotPath: null,
    haltedAt: new Date(),
  };
}
