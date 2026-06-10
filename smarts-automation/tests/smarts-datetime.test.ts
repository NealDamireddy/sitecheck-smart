import { describe, it, expect } from "vitest";
import {
  SMARTS_DATETIME_FORMAT,
  formatForSmarts,
} from "../src/validation/smarts-datetime.js";

describe("SMARTS datetime formatting", () => {
  it("exposes the format string as a single configurable constant", () => {
    expect(SMARTS_DATETIME_FORMAT).toBe("MM/DD/YYYY HH:MM");
  });

  it("formats a date as MM/DD/YYYY HH:MM (UTC, zero-padded)", () => {
    const d = new Date("2026-05-20T09:15:00Z");
    expect(formatForSmarts(d)).toBe("05/20/2026 09:15");
  });

  it("zero-pads single-digit components", () => {
    const d = new Date("2026-01-09T03:04:00Z");
    expect(formatForSmarts(d)).toBe("01/09/2026 03:04");
  });

  it("throws on an invalid Date", () => {
    expect(() => formatForSmarts(new Date("not-a-date"))).toThrow();
  });
});
