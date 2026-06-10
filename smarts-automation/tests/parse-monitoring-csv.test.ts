import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  parseMonitoringCsv,
  parseMonitoringCsvString,
} from "../src/csv/parse-monitoring-csv.js";

const FIXTURES = resolve(__dirname, "..", "fixtures");

describe("parseMonitoringCsv", () => {
  it("parses the canonical sample fixture into typed records", async () => {
    const result = await parseMonitoringCsv(resolve(FIXTURES, "sample.csv"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.records).toHaveLength(3);

    const r0 = result.records[0]!;
    expect(r0.monitoringLocationId).toBe("ML-001");
    expect(r0.monitoringLocationName).toBe("City DI Northeast");
    expect(r0.sampleDateTime).toBeInstanceOf(Date);
    expect(r0.sampleDateTime.toISOString()).toBe("2026-05-28T09:15:00.000Z");
    expect(r0.phValue).toBe(7.2);
    expect(r0.turbidityNtu).toBe(12.4);
    expect(r0.analyticalMethod).toBe("E150.2");
    expect(r0.phAnalyticalMethod).toBe("E150.2");
    expect(r0.turbidityAnalyticalMethod).toBe("E180.1");
    expect(r0.mdlPh).toBe("0.1");
    expect(r0.rlPh).toBe("0.1");
    expect(r0.mdlTurbidity).toBe("0.1");
    expect(r0.rlTurbidity).toBe("1");
    expect(r0.labName).toBe("Acme Labs");
    expect(r0.qualifierCode).toBeNull();
    expect(r0.dischargePoint).toBe("DP-1");

    const r2 = result.records[2]!;
    expect(r2.turbidityNtu).toBe(321);
    expect(r2.labName).toBe("Acme Labs");
    expect(r2.qualifierCode).toBe("U");
    expect(r2.phAnalyticalMethod).toBe("A4500HB");
  });

  it("flags missing required columns at header level", async () => {
    const result = await parseMonitoringCsv(
      resolve(FIXTURES, "invalid-missing-required.csv"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const fields = result.errors.map((e) => e.field);
    expect(fields).toContain("monitoring_location_name");
  });

  it("flags non-numeric pH and bad date values per row", async () => {
    const result = await parseMonitoringCsv(
      resolve(FIXTURES, "invalid-bad-numbers.csv"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const byField = new Map(result.errors.map((e) => [e.field, e]));
    expect(byField.has("ph_value")).toBe(true);
    expect(byField.has("sample_datetime")).toBe(true);
  });

  it("rejects empty CSV files", () => {
    const result = parseMonitoringCsvString(
      "monitoring_location_id,monitoring_location_name,sample_datetime\n",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.field).toBe("<file>");
  });
});
