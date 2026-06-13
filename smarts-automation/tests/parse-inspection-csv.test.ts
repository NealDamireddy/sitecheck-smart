import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import {
  parseInspectionCsv,
  parseInspectionCsvString,
} from "../src/compose/parse-inspection-csv.js";
import { parseSiteProfile } from "../src/compose/site-profile.schema.js";
import { composeMonitoringRecords } from "../src/compose/compose-monitoring-records.js";
import { validateForCgp } from "../src/validation/cgp-validation.js";

const FIXTURES = resolve(__dirname, "..", "fixtures");

describe("parseInspectionCsv", () => {
  it("parses the slim inspection fixture into an event + entries", async () => {
    const result = await parseInspectionCsv(resolve(FIXTURES, "inspection.csv"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.entries).toHaveLength(2);
    expect(result.event.eventStartDate).toBe("05/27/2026");
    expect(result.event.eventEndTime).toBe("11:30");
    expect(result.event.precipitationInches).toBe("2");

    const e0 = result.entries[0]!;
    expect(e0.monitoringLocationId).toBe("1081657");
    expect(e0.phValue).toBe(7.2);
    expect(e0.turbidityNtu).toBe(12.4);
    expect(e0.sampleDateTime.toISOString()).toBe("2026-05-28T09:15:00.000Z");
    expect(e0.qualifierCode).toBeNull();
  });

  it("composes the fixture profile + inspection into CGP-valid records", async () => {
    const profileRaw = JSON.parse(
      await readFile(resolve(FIXTURES, "site-profile.json"), "utf8"),
    );
    const profileResult = parseSiteProfile(profileRaw);
    expect(profileResult.ok).toBe(true);
    if (!profileResult.ok) return;

    const inspection = await parseInspectionCsv(
      resolve(FIXTURES, "inspection.csv"),
    );
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) return;

    const composed = composeMonitoringRecords(
      profileResult.profile,
      inspection.event,
      inspection.entries,
    );
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    expect(validateForCgp(composed.records).ok).toBe(true);
  });

  it("rejects rows whose event window disagrees with row 1", () => {
    const csv = [
      "monitoring_location_id,sample_datetime,ph_value,turbidity_ntu,event_start_date,event_start_time,event_end_date,event_end_time",
      "ML-1,2026-05-28T09:15:00Z,7.2,12.4,05/27/2026,11:20,05/29/2026,11:30",
      "ML-2,2026-05-28T10:30:00Z,6.8,28.1,05/27/2026,11:20,05/30/2026,11:30",
    ].join("\n");
    const result = parseInspectionCsvString(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("event window differs"))).toBe(
      true,
    );
  });

  it("flags missing required columns", () => {
    const csv = [
      "monitoring_location_id,ph_value",
      "ML-1,7.2",
    ].join("\n");
    const result = parseInspectionCsvString(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("sample_datetime"))).toBe(true);
  });
});

describe("parseSiteProfile", () => {
  it("rejects a profile with duplicate location ids", () => {
    const result = parseSiteProfile({
      wdid: "2 01C402404",
      siteName: "Equus Ct",
      qspName: "Nilai Damireddy",
      monitoringLocations: [
        { id: "A", name: "City DI Northeast", dischargePoint: "DP-1" },
        { id: "A", name: "County Pipe Outfall Southeast", dischargePoint: "DP-2" },
      ],
      phAnalyticalMethod: "E150.2",
      turbidityAnalyticalMethod: "E180.1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("rejects a profile with no monitoring locations", () => {
    const result = parseSiteProfile({
      wdid: "2 01C402404",
      siteName: "Equus Ct",
      qspName: "Nilai Damireddy",
      monitoringLocations: [],
      phAnalyticalMethod: "E150.2",
      turbidityAnalyticalMethod: "E180.1",
    });
    expect(result.ok).toBe(false);
  });
});
