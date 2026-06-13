import { describe, it, expect } from "vitest";
import { composeMonitoringRecords } from "../src/compose/compose-monitoring-records.js";
import { validateForCgp } from "../src/validation/cgp-validation.js";
import type {
  InspectionEntry,
  InspectionEvent,
  SiteProfile,
} from "../src/types/site-profile.js";

const LAB_PROFILE: SiteProfile = {
  wdid: "2 01C402404",
  siteName: "Equus Ct",
  qspName: "Nilai Damireddy",
  monitoringLocations: [
    { id: "1081657", name: "City DI Northeast", dischargePoint: "DP-1" },
    {
      id: "1081658",
      name: "County Pipe Outfall Southeast",
      dischargePoint: "DP-2",
    },
  ],
  phAnalyticalMethod: "E150.2",
  turbidityAnalyticalMethod: "E180.1",
  labName: "Acme Labs",
  mdlPh: "0.1",
  rlPh: "0.1",
  mdlTurbidity: "0.1",
  rlTurbidity: "1",
  eventType: "Precipitation Event",
};

const EVENT: InspectionEvent = {
  eventStartDate: "05/27/2026",
  eventStartTime: "11:20",
  eventEndDate: "05/29/2026",
  eventEndTime: "11:30",
  precipitationInches: "2",
};

const ENTRIES: InspectionEntry[] = [
  {
    monitoringLocationId: "1081657",
    sampleDateTime: new Date("2026-05-28T09:15:00Z"),
    phValue: 7.2,
    turbidityNtu: 12.4,
    qualifierCode: null,
  },
  {
    monitoringLocationId: "1081658",
    sampleDateTime: new Date("2026-05-28T10:30:00Z"),
    phValue: 6.8,
    turbidityNtu: 28.1,
    qualifierCode: null,
  },
];

describe("composeMonitoringRecords", () => {
  it("folds constants + variables into CGP-valid MonitoringRecords", () => {
    const result = composeMonitoringRecords(LAB_PROFILE, EVENT, ENTRIES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.records).toHaveLength(2);
    const validated = validateForCgp(result.records);
    expect(validated.ok).toBe(true);

    const r0 = result.records[0]!;
    // Per-inspection variables
    expect(r0.monitoringLocationId).toBe("1081657");
    expect(r0.phValue).toBe(7.2);
    expect(r0.turbidityNtu).toBe(12.4);
    expect(r0.sampleDateTime.toISOString()).toBe("2026-05-28T09:15:00.000Z");
    // Per-site constants stamped from the profile
    expect(r0.monitoringLocationName).toBe("City DI Northeast");
    expect(r0.dischargePoint).toBe("DP-1");
    expect(r0.qspName).toBe("Nilai Damireddy");
    expect(r0.phAnalyticalMethod).toBe("E150.2");
    expect(r0.turbidityAnalyticalMethod).toBe("E180.1");
    expect(r0.analyticalMethod).toBe("E150.2");
    expect(r0.labName).toBe("Acme Labs");
    // Lab-only MDL/RL present because the profile is lab-analyzed
    expect(r0.mdlPh).toBe("0.1");
    expect(r0.rlTurbidity).toBe("1");
    // Event window repeated on every record
    expect(r0.eventStartDate).toBe("05/27/2026");
    expect(r0.eventEndTime).toBe("11:30");
    expect(r0.precipitationInches).toBe("2");
  });

  it("omits MDL/RL and labName for a self-analyzed site", () => {
    const selfProfile: SiteProfile = {
      ...LAB_PROFILE,
      labName: undefined,
    };
    const result = composeMonitoringRecords(selfProfile, EVENT, ENTRIES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const r0 = result.records[0]!;
    expect(r0.labName).toBeNull();
    expect(r0.mdlPh).toBeUndefined();
    expect(r0.rlPh).toBeUndefined();
    expect(r0.mdlTurbidity).toBeUndefined();
    expect(r0.rlTurbidity).toBeUndefined();
  });

  it("halts loudly when an entry references an unknown location id", () => {
    const badEntries: InspectionEntry[] = [
      { ...ENTRIES[0]!, monitoringLocationId: "DOES-NOT-EXIST" },
    ];
    const result = composeMonitoringRecords(LAB_PROFILE, EVENT, badEntries);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("DOES-NOT-EXIST");
    expect(result.errors[0]).toContain("1081657");
  });

  it("fails on empty entries", () => {
    const result = composeMonitoringRecords(LAB_PROFILE, EVENT, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("no inspection entries");
  });
});
