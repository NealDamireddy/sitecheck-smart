import { describe, it, expect } from "vitest";
import {
  isFilled,
  isHalted,
  isValidationFailed,
  type RunResult,
  type FilledResult,
  type HaltedResult,
  type ValidationFailedResult,
} from "../src/types/run-result.js";

describe("RunResult discriminated union", () => {
  it("narrows on the filled branch", () => {
    const filled: FilledResult = {
      status: "filled",
      record: {
        monitoringLocationId: "ML-001",
        monitoringLocationName: "North",
        sampleDateTime: new Date("2026-05-20T09:15:00Z"),
        phValue: 7.0,
        turbidityNtu: 5,
        analyticalMethod: null,
        labName: null,
        qualifierCode: null,
        dischargePoint: "DP-1",
      },
      filledAt: new Date(),
      reviewUrl: "https://smarts.example/review/1",
      screenshotPath: null,
    };
    const r: RunResult = filled;
    expect(isFilled(r)).toBe(true);
    expect(isHalted(r)).toBe(false);
    expect(isValidationFailed(r)).toBe(false);
  });

  it("narrows on the halted branch", () => {
    const halted: HaltedResult = {
      status: "halted",
      reason: "unexpected modal",
      record: null,
      screenshotPath: "/tmp/halt.png",
      domSnapshotPath: "/tmp/halt.html",
      haltedAt: new Date(),
    };
    expect(isHalted(halted)).toBe(true);
    expect(isFilled(halted)).toBe(false);
  });

  it("narrows on the validation_failed branch", () => {
    const vf: ValidationFailedResult = {
      status: "validation_failed",
      errors: [{ recordIndex: 0, field: "ph_value", message: "required" }],
      failedAt: new Date(),
    };
    expect(isValidationFailed(vf)).toBe(true);
    expect(isFilled(vf)).toBe(false);
  });
});
