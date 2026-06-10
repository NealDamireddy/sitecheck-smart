import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import {
  findExistingDraft,
  matchOutstandingRows,
  type DraftResumeKey,
  type OutstandingRow,
} from "../src/orchestrator/find-existing-draft.js";

const KEY: DraftResumeKey = {
  siteName: "Equus Ct",
  reportingPeriod: "05/27/2026 - 05/29/2026",
  eventType: "Precipitation Event",
};

function row(overrides: Partial<OutstandingRow> = {}): OutstandingRow {
  return {
    rowIndex: 0,
    facilityName: "Equus Ct",
    reportingPeriod: "05/27/2026 - 05/29/2026",
    eventType: "Precipitation Event",
    reportId: "1373722",
    linkElementId:
      "noiReadyForm:adhocOutstandingTable:0:noiReadyListTable5EventIdLink",
    ...overrides,
  };
}

describe("matchOutstandingRows", () => {
  it("matches a row whose facility name, period, and event type all equal the key", () => {
    const matches = matchOutstandingRows([row()], KEY);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({
      reportId: "1373722",
      linkElementId:
        "noiReadyForm:adhocOutstandingTable:0:noiReadyListTable5EventIdLink",
      rowIndex: 0,
    });
  });

  it("facility name comparison is case-insensitive and whitespace-normalized", () => {
    const matches = matchOutstandingRows(
      [row({ facilityName: "  EQUUS   CT \n" })],
      KEY,
    );
    expect(matches).toHaveLength(1);
  });

  it("does NOT substring-match: a facility whose name merely CONTAINS the key is no match", () => {
    // Regression guard for the original substring bug: Equus Ct's own address
    // is "4002 Equus Ct", and other sites' names/addresses can embed the key.
    const matches = matchOutstandingRows(
      [
        row({ facilityName: "Equus Ct East" }),
        row({ facilityName: "Equus Ct Phase 2", rowIndex: 1 }),
      ],
      KEY,
    );
    expect(matches).toHaveLength(0);
  });

  it("does NOT match when the key is longer than the facility name", () => {
    const matches = matchOutstandingRows([row({ facilityName: "Equus" })], KEY);
    expect(matches).toHaveLength(0);
  });

  it("normalizes interior whitespace in the reporting period (live cell ships <br>/tabs around the dash)", () => {
    const matches = matchOutstandingRows(
      [row({ reportingPeriod: "05/27/2026   \n\t-   05/29/2026" })],
      KEY,
    );
    expect(matches).toHaveLength(1);
  });

  it("rejects a different reporting period or event type", () => {
    expect(
      matchOutstandingRows(
        [row({ reportingPeriod: "05/01/2026 - 05/02/2026" })],
        KEY,
      ),
    ).toHaveLength(0);
    expect(
      matchOutstandingRows([row({ eventType: "Non-Storm Water Discharge" })], KEY),
    ).toHaveLength(0);
  });

  it("excludes rows without a clickable report-id link", () => {
    expect(matchOutstandingRows([row({ linkElementId: "" })], KEY)).toHaveLength(0);
  });

  it("returns ALL matching rows (multi-match is the caller's halt condition)", () => {
    const matches = matchOutstandingRows(
      [
        row(),
        row({ rowIndex: 1, reportId: "1374063", linkElementId: "link:1" }),
        row({ rowIndex: 2, reportingPeriod: "05/01/2026 - 05/02/2026" }),
      ],
      KEY,
    );
    expect(matches.map((m) => m.reportId)).toEqual(["1373722", "1374063"]);
  });
});

describe("findExistingDraft", () => {
  function pageWithEvaluate(impl: () => Promise<unknown>): Page {
    return { evaluate: vi.fn().mockImplementation(impl) } as unknown as Page;
  }

  it("returns matches from the scanned rows", async () => {
    const page = pageWithEvaluate(async () => [row()]);
    const matches = await findExistingDraft(page, KEY);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.reportId).toBe("1373722");
  });

  it("returns [] when the outstanding table is empty or absent", async () => {
    const page = pageWithEvaluate(async () => []);
    await expect(findExistingDraft(page, KEY)).resolves.toEqual([]);
  });

  it("never throws: a failed page scan resolves to []", async () => {
    const page = pageWithEvaluate(async () => {
      throw new Error("page navigated away");
    });
    await expect(findExistingDraft(page, KEY)).resolves.toEqual([]);
  });
});
