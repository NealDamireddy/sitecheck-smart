import { describe, it, expect } from "vitest";
import {
  validateForCgp,
  PH_NAL_MIN,
  PH_NAL_MAX,
  TURBIDITY_NAL_MAX_NTU,
} from "../src/validation/cgp-validation.js";
import { SMARTS_DATETIME_FORMAT } from "../src/validation/smarts-datetime.js";
import type { MonitoringRecord } from "../src/types/monitoring-record.js";

function makeRecord(overrides: Partial<MonitoringRecord> = {}): MonitoringRecord {
  return {
    monitoringLocationId: "ML-001",
    monitoringLocationName: "North Outfall",
    sampleDateTime: new Date("2026-05-20T09:15:00Z"),
    phValue: 7.2,
    turbidityNtu: 12.4,
    analyticalMethod: "EPA 150.1",
    labName: "Acme Labs",
    qualifierCode: null,
    dischargePoint: "DP-1",
    ...overrides,
  };
}

describe("validateForCgp", () => {
  it("accepts a valid row with no warnings", () => {
    const result = validateForCgp([makeRecord()]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.sampleDateTimeFormatted).toBe(
      "05/20/2026 09:15",
    );
  });

  it("missing required fields are hard errors", () => {
    const recs: MonitoringRecord[] = [
      makeRecord({ monitoringLocationId: "" }),
      makeRecord({ dischargePoint: "" }),
      makeRecord({ sampleDateTime: new Date("not-a-date") }),
    ];
    const result = validateForCgp(recs);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const fields = result.errors.map((e) => e.field);
    expect(fields).toContain("monitoringLocationId");
    expect(fields).toContain("dischargePoint");
    expect(fields).toContain("sampleDateTime");
  });

  it("missing pH is a hard error (pH must be a number)", () => {
    const result = validateForCgp([makeRecord({ phValue: null })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const fields = result.errors.map((e) => e.field);
    expect(fields).toContain("phValue");
  });

  it("flags pH NAL low exceedance as a warning", () => {
    const result = validateForCgp([makeRecord({ phValue: 5.5 })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.code).toBe("NAL_EXCEEDANCE_PH_LOW");
    expect(result.warnings[0]!.recordIndex).toBe(0);
  });

  it("flags pH NAL high exceedance as a warning", () => {
    const result = validateForCgp([makeRecord({ phValue: 9.7 })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.code).toBe("NAL_EXCEEDANCE_PH_HIGH");
  });

  it("treats pH exactly at NAL bounds as in-range (no warning)", () => {
    const lo = validateForCgp([makeRecord({ phValue: PH_NAL_MIN })]);
    const hi = validateForCgp([makeRecord({ phValue: PH_NAL_MAX })]);
    expect(lo.ok && lo.warnings).toEqual([]);
    expect(hi.ok && hi.warnings).toEqual([]);
  });

  it("flags turbidity NAL exceedance as a warning", () => {
    const result = validateForCgp([makeRecord({ turbidityNtu: 312 })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.code).toBe("NAL_EXCEEDANCE_TURBIDITY");
    expect(result.warnings[0]!.message).toContain("312");
    expect(result.warnings[0]!.message).toContain(String(TURBIDITY_NAL_MAX_NTU));
  });

  it("missing turbidity (null) is valid - represents undetected", () => {
    const result = validateForCgp([
      makeRecord({ turbidityNtu: null, qualifierCode: "U" }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(result.records[0]!.turbidityNtu).toBeNull();
  });

  it("negative turbidity is a hard error", () => {
    const result = validateForCgp([makeRecord({ turbidityNtu: -1 })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toContain("turbidityNtu");
  });

  it("processes mixed good and bad rows (errors keyed by index)", () => {
    const recs: MonitoringRecord[] = [
      makeRecord({ phValue: 7.0 }),
      makeRecord({ phValue: null }),
      makeRecord({ phValue: 7.2, turbidityNtu: 999 }),
      makeRecord({ phValue: 6.5, dischargePoint: "" }),
    ];
    const result = validateForCgp(recs);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const indices = result.errors.map((e) => e.recordIndex).sort();
    expect(indices).toEqual([1, 3]);

    const fieldsByIdx = new Map<number, string[]>();
    for (const e of result.errors) {
      const list = fieldsByIdx.get(e.recordIndex) ?? [];
      list.push(e.field);
      fieldsByIdx.set(e.recordIndex, list);
    }
    expect(fieldsByIdx.get(1)).toContain("phValue");
    expect(fieldsByIdx.get(3)).toContain("dischargePoint");
  });

  it("attaches SMARTS-formatted datetime to validated records", () => {
    const result = validateForCgp([
      makeRecord({ sampleDateTime: new Date("2026-12-09T14:05:00Z") }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records[0]!.sampleDateTimeFormatted).toBe("12/09/2026 14:05");
  });

  it("exposes SMARTS_DATETIME_FORMAT as a configurable constant", () => {
    expect(SMARTS_DATETIME_FORMAT).toBe("MM/DD/YYYY HH:MM");
  });
});
