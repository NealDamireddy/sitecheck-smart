import { describe, it, expect } from "vitest";
import {
  generateSiteProfile,
  generateInspection,
} from "../src/compose/generate-site-profile.js";
import { composeMonitoringRecords } from "../src/compose/compose-monitoring-records.js";
import { validateForCgp } from "../src/validation/cgp-validation.js";

const PH_METHODS = ["A4500HB", "E150.2", "pH_Field", "pH_Paper"];
const TURBIDITY_METHODS = ["E180.1", "A2130B"];

describe("generateSiteProfile", () => {
  it("is deterministic for the same (wdid, seed)", () => {
    const a = generateSiteProfile("9 99X999999", { seed: 42 });
    const b = generateSiteProfile("9 99X999999", { seed: 42 });
    expect(a).toEqual(b);
  });

  it("is stable per wdid without an explicit seed", () => {
    const a = generateSiteProfile("5 55Y555555");
    const b = generateSiteProfile("5 55Y555555");
    expect(a).toEqual(b);
  });

  it("honors locationCount and the lab flag", () => {
    const labbed = generateSiteProfile("1 11A111111", {
      seed: 7,
      locationCount: 3,
    });
    expect(labbed.monitoringLocations).toHaveLength(3);
    expect(labbed.labName).toBeTruthy();
    expect(labbed.mdlPh).toBeTruthy();

    const selfed = generateSiteProfile("1 11A111111", {
      seed: 7,
      lab: false,
    });
    expect(selfed.labName).toBeUndefined();
    expect(selfed.mdlPh).toBeUndefined();
  });

  it("only draws analytical methods from the live SMARTS option sets", () => {
    for (let seed = 0; seed < 20; seed++) {
      const p = generateSiteProfile("2 22B222222", { seed });
      expect(PH_METHODS).toContain(p.phAnalyticalMethod);
      expect(TURBIDITY_METHODS).toContain(p.turbidityAnalyticalMethod);
    }
  });

  it("produces unique location ids", () => {
    const p = generateSiteProfile("3 33C333333", { seed: 5, locationCount: 4 });
    const ids = p.monitoringLocations.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("composes + passes CGP validation end to end for a synthetic site", () => {
    for (let seed = 0; seed < 25; seed++) {
      const profile = generateSiteProfile("7 77D777777", {
        seed,
        locationCount: 2,
      });
      const { event, entries } = generateInspection(profile, { seed });
      const composed = composeMonitoringRecords(profile, event, entries);
      expect(composed.ok).toBe(true);
      if (!composed.ok) continue;
      const validated = validateForCgp(composed.records);
      expect(validated.ok).toBe(true);
      // pH always inside the NAL band, so no NAL warnings expected.
      if (validated.ok) {
        const phLowHigh = validated.warnings.filter((w) =>
          w.code.startsWith("NAL_EXCEEDANCE_PH"),
        );
        expect(phLowHigh).toHaveLength(0);
      }
    }
  });
});
