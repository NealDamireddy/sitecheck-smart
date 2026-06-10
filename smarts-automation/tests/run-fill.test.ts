import { describe, it, expect, vi, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

vi.mock("../src/auth/create-session.js", () => ({
  createSession: vi.fn(),
}));

vi.mock("../src/orchestrator/navigate.js", () => ({
  navigateToProject: vi.fn().mockResolvedValue({
    status: "navigated",
    mode: "new",
    reportId: null,
  }),
  navigateToTab: vi.fn().mockResolvedValue(undefined),
}));

const NAV_NEW = {
  status: "navigated" as const,
  mode: "new" as const,
  reportId: null,
};

vi.mock("../src/orchestrator/structural-clicks.js", () => ({
  clickButtonByText: vi.fn().mockResolvedValue(undefined),
  openNewSampleForm: vi.fn().mockResolvedValue(undefined),
  waitForSampleInList: vi.fn().mockResolvedValue(undefined),
  STRUCTURAL_TIMEOUT_MS: 30_000,
}));

vi.mock("../src/orchestrator/event-information.js", () => ({
  fillEventInformation: vi.fn().mockResolvedValue(null),
  EVENT_TYPE_OPTION: "Precipitation Event",
}));

vi.mock("../src/util/primefaces.js", () => ({
  setJsfSelectByText: vi.fn(),
}));

vi.mock("../src/orchestrator/sample-form.js", () => ({
  fillSampleDetails: vi.fn().mockResolvedValue(null),
  fillSampleTable: vi.fn().mockResolvedValue(null),
}));

import { createSession } from "../src/auth/create-session.js";
import {
  navigateToProject,
  navigateToTab,
} from "../src/orchestrator/navigate.js";
import {
  clickButtonByText,
  openNewSampleForm,
  waitForSampleInList,
} from "../src/orchestrator/structural-clicks.js";
import { fillEventInformation } from "../src/orchestrator/event-information.js";
import { setJsfSelectByText } from "../src/util/primefaces.js";
import {
  fillSampleDetails,
  fillSampleTable,
} from "../src/orchestrator/sample-form.js";
import { runFill } from "../src/orchestrator/run-fill.js";
import type { MonitoringRecord } from "../src/types/monitoring-record.js";
import type { SMARTSSession } from "../src/auth/types.js";

const mockedCreateSession = vi.mocked(createSession);
const mockedNavToProject = vi.mocked(navigateToProject);
const mockedNavToTab = vi.mocked(navigateToTab);
const mockedClickButton = vi.mocked(clickButtonByText);
const mockedWaitSample = vi.mocked(waitForSampleInList);
const mockedFillEventInfo = vi.mocked(fillEventInformation);
const mockedSetJsfSelect = vi.mocked(setJsfSelectByText);
const mockedOpenNewSample = vi.mocked(openNewSampleForm);
const mockedFillSampleDetails = vi.mocked(fillSampleDetails);
const mockedFillSampleTable = vi.mocked(fillSampleTable);

const ARTIFACTS_DIR = resolve(tmpdir(), `smarts-orch-test-${Date.now()}`);

function makeRecord(over: Partial<MonitoringRecord> = {}): MonitoringRecord {
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
    ...over,
  };
}

function makeFakeSession(): SMARTSSession {
  const page = {
    screenshot: vi.fn().mockResolvedValue(Buffer.from("png")),
    isClosed: () => false,
  };
  return {
    page: page as unknown as SMARTSSession["page"],
    context: {} as SMARTSSession["context"],
    browser: {} as SMARTSSession["browser"],
    close: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  mockedCreateSession.mockReset();
  mockedNavToProject.mockReset();
  mockedNavToTab.mockReset();
  mockedClickButton.mockReset();
  mockedWaitSample.mockReset();
  mockedFillEventInfo.mockReset();
  mockedSetJsfSelect.mockReset();
  mockedOpenNewSample.mockReset();
  mockedFillSampleDetails.mockReset();
  mockedFillSampleTable.mockReset();
  mockedFillSampleDetails.mockResolvedValue(null);
  mockedFillSampleTable.mockResolvedValue(null);
  mockedNavToProject.mockResolvedValue(NAV_NEW);
  mockedNavToTab.mockResolvedValue(undefined);
  mockedClickButton.mockResolvedValue(undefined);
  mockedOpenNewSample.mockResolvedValue(undefined);
  mockedWaitSample.mockResolvedValue(undefined);
  mockedFillEventInfo.mockResolvedValue(null);
  mockedSetJsfSelect.mockResolvedValue({
    found: true,
    optionFound: true,
    selectId: "constAdhocForm:CGPAdhocRawData:loc",
    value: "1081657",
    matchedBy: "option-text",
  });
});

describe("runFill", () => {
  it("returns Halted immediately and never navigates when auth fails", async () => {
    mockedCreateSession.mockResolvedValue({
      status: "halted",
      reason: "Authentication failed — check credentials",
      record: null,
      screenshotPath: "/tmp/auth.png",
      domSnapshotPath: null,
      haltedAt: new Date(),
    });

    const result = await runFill(
      { username: "u", password: "p" },
      "WDID-001",
      [makeRecord()],
      { artifactsDir: ARTIFACTS_DIR },
    );

    expect(result.status).toBe("halted");
    if (result.status !== "halted") return;
    expect(result.reason).toMatch(/Authentication failed/);
    expect(mockedNavToProject).not.toHaveBeenCalled();
    expect(mockedNavToTab).not.toHaveBeenCalled();
    expect(mockedFillEventInfo).not.toHaveBeenCalled();
    expect(mockedFillSampleTable).not.toHaveBeenCalled();
    expect(mockedClickButton).not.toHaveBeenCalled();
  });

  it("returns Halted on empty records without launching browser", async () => {
    const result = await runFill(
      { username: "u", password: "p" },
      "WDID-001",
      [],
      { artifactsDir: ARTIFACTS_DIR },
    );
    expect(result.status).toBe("halted");
    expect(mockedCreateSession).not.toHaveBeenCalled();
  });

  it("happy path: executes the full sequence and returns Filled with review package", async () => {
    const session = makeFakeSession();
    mockedCreateSession.mockResolvedValue({
      status: "authenticated",
      session,
      screenshotPath: "/tmp/auth.png",
    });
    const records = [makeRecord(), makeRecord({ monitoringLocationName: "South" })];
    const result = await runFill(
      { username: "u", password: "p" },
      "WDID-001",
      records,
      { artifactsDir: ARTIFACTS_DIR },
    );

    expect(result.status).toBe("filled");
    if (result.status !== "filled") return;
    expect(result.records).toEqual(records);
    expect(result.reviewPackage.records).toEqual(records);
    expect(result.reviewPackage.sampleScreenshots).toHaveLength(2);
    expect(result.reviewPackage.dataSummaryScreenshot).toMatch(/data-summary\.png$/);
    expect(result.reviewPackage.certificationScreenshot).toMatch(/certification\.png$/);

    expect(mockedNavToProject).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ wdid: "WDID-001" }),
    );

    // Event Information is now filled deterministically (handles its own tab
    // click + save internally), so it no longer appears in the navToTab order.
    expect(mockedFillEventInfo).toHaveBeenCalledTimes(1);
    expect(mockedFillEventInfo).toHaveBeenCalledWith(session.page, records[0]);

    const tabOrder = mockedNavToTab.mock.calls.map((c) => c[1]);
    expect(tabOrder).toEqual(["Raw Data", "Data Summary", "Certification"]);

    // pH + Turbidity table is now deterministic (per-row fills by structural
    // row index), so the vision fillFormSection passes are gone — one
    // fillSampleTable call per record instead.
    expect(mockedFillSampleTable).toHaveBeenCalledTimes(2);
    expect(mockedFillSampleTable.mock.calls.map((c) => c[1])).toEqual(records);

    // Monitoring Location is deterministic (native <select>), not vision —
    // one setJsfSelectByText call per record, by the record's location name.
    expect(mockedSetJsfSelect).toHaveBeenCalledTimes(2);
    expect(mockedSetJsfSelect.mock.calls.map((c) => c[1])).toEqual([
      "North Outfall",
      "South",
    ]);

    const buttons = mockedClickButton.mock.calls.map((c) => c[1]);
    expect(mockedOpenNewSample).toHaveBeenCalledTimes(2);
    expect(buttons.filter((b) => b === "Save Sample")).toHaveLength(2);
    expect(mockedWaitSample).toHaveBeenCalledTimes(2);

    expect(buttons).not.toContain("Certify");
    expect(buttons).not.toContain("Submit");
    expect(buttons).not.toContain("Submit Certification");
    expect(buttons.find((b) => /certif/i.test(b))).toBeUndefined();
    expect(buttons.find((b) => /attest/i.test(b))).toBeUndefined();

    expect(session.close).toHaveBeenCalled();
  });

  it("halts immediately when fillEventInformation halts; never starts the Raw Data loop", async () => {
    const session = makeFakeSession();
    mockedCreateSession.mockResolvedValue({
      status: "authenticated",
      session,
      screenshotPath: "/tmp/auth.png",
    });
    mockedFillEventInfo.mockResolvedValueOnce({
      status: "halted",
      reason: "Event Type <select> not usable: element not found",
      record: null,
      screenshotPath: null,
      domSnapshotPath: null,
      haltedAt: new Date(),
    });

    const result = await runFill(
      { username: "u", password: "p" },
      "WDID-001",
      [makeRecord()],
      { artifactsDir: ARTIFACTS_DIR },
    );

    expect(result.status).toBe("halted");
    if (result.status !== "halted") return;
    expect(result.reason).toMatch(/Event Type <select> not usable/);
    expect(mockedOpenNewSample).not.toHaveBeenCalled();
    expect(mockedFillSampleTable).not.toHaveBeenCalled();
    expect(mockedNavToTab.mock.calls.map((c) => c[1])).not.toContain("Raw Data");
  });

  it("halts mid-loop on per-sample fill failure and stops processing remaining records", async () => {
    const session = makeFakeSession();
    mockedCreateSession.mockResolvedValue({
      status: "authenticated",
      session,
      screenshotPath: "/tmp/auth.png",
    });
    // Per sample, fillSampleTable owns the pH + Turbidity rows (location +
    // date/QSP are filled earlier). Halt on the first record's table fill.
    mockedFillSampleTable.mockResolvedValueOnce({
      status: "halted",
      reason: "pH Analytical Method \"E150.2\" did not match an option",
      record: null,
      screenshotPath: null,
      domSnapshotPath: null,
      haltedAt: new Date(),
    });

    const records = [makeRecord(), makeRecord({ monitoringLocationName: "Second" })];
    const result = await runFill(
      { username: "u", password: "p" },
      "WDID-001",
      records,
      { artifactsDir: ARTIFACTS_DIR },
    );

    expect(result.status).toBe("halted");
    if (result.status !== "halted") return;
    expect(result.reason).toMatch(/did not match an option/);

    expect(mockedOpenNewSample).toHaveBeenCalledTimes(1);
    const buttons = mockedClickButton.mock.calls.map((c) => c[1]);
    expect(buttons).not.toContain("Save Sample");
    expect(mockedNavToTab.mock.calls.map((c) => c[1])).not.toContain(
      "Data Summary",
    );
    expect(mockedNavToTab.mock.calls.map((c) => c[1])).not.toContain(
      "Certification",
    );
    expect(mockedFillSampleTable.mock.calls.length).toBe(1);
  });

  it("never proceeds past the Certification screenshot - no certify/submit/attest interactions ever", async () => {
    const session = makeFakeSession();
    mockedCreateSession.mockResolvedValue({
      status: "authenticated",
      session,
      screenshotPath: "/tmp/auth.png",
    });
    await runFill(
      { username: "u", password: "p" },
      "WDID-001",
      [makeRecord()],
      { artifactsDir: ARTIFACTS_DIR },
    );

    const tabs = mockedNavToTab.mock.calls.map((c) => c[1]);
    expect(tabs[tabs.length - 1]).toBe("Certification");

    const buttons = mockedClickButton.mock.calls.map((c) => c[1]);
    for (const b of buttons) {
      expect(/certif/i.test(b)).toBe(false);
      expect(/attest/i.test(b)).toBe(false);
      expect(/submit/i.test(b)).toBe(false);
    }
  });

  it("returns Halted when navigateToProject reports the WDID was not found and skips the rest of the run", async () => {
    const session = makeFakeSession();
    mockedCreateSession.mockResolvedValue({
      status: "authenticated",
      session,
      screenshotPath: "/tmp/auth.png",
    });
    mockedNavToProject.mockResolvedValueOnce({
      status: "halted",
      reason:
        "Project WDID 2 01C402404 not found in File Reports or Active Applications",
      record: null,
      screenshotPath: null,
      domSnapshotPath: null,
      haltedAt: new Date(),
    });

    const result = await runFill(
      { username: "u", password: "p" },
      "2 01C402404",
      [makeRecord()],
      { artifactsDir: ARTIFACTS_DIR },
    );

    expect(result.status).toBe("halted");
    if (result.status !== "halted") return;
    expect(result.reason).toMatch(
      /Project WDID 2 01C402404 not found in File Reports or Active Applications/,
    );
    expect(mockedNavToTab).not.toHaveBeenCalled();
    expect(mockedFillEventInfo).not.toHaveBeenCalled();
    expect(mockedFillSampleTable).not.toHaveBeenCalled();
    expect(mockedClickButton).not.toHaveBeenCalled();
  });

  it("converts an uncaught exception into Halted with screenshot and never throws", async () => {
    const session = makeFakeSession();
    mockedCreateSession.mockResolvedValue({
      status: "authenticated",
      session,
      screenshotPath: "/tmp/auth.png",
    });
    mockedNavToProject.mockRejectedValue(new Error("boom"));

    const result = await runFill(
      { username: "u", password: "p" },
      "WDID-001",
      [makeRecord()],
      { artifactsDir: ARTIFACTS_DIR },
    );

    expect(result.status).toBe("halted");
    if (result.status !== "halted") return;
    expect(result.reason).toMatch(/boom/);
    expect(session.close).toHaveBeenCalled();
  });

  it("resumed-draft path: skips fillEventInformation entirely and goes straight to Raw Data", async () => {
    const session = makeFakeSession();
    mockedCreateSession.mockResolvedValue({
      status: "authenticated",
      session,
      screenshotPath: "/tmp/auth.png",
    });
    // Simulate that navigateToProject found a matching draft and resumed it.
    mockedNavToProject.mockResolvedValueOnce({
      status: "navigated",
      mode: "resumed",
      reportId: "1374063",
    });

    const records = [makeRecord()];
    const result = await runFill(
      { username: "u", password: "p" },
      "WDID-001",
      records,
      {
        artifactsDir: ARTIFACTS_DIR,
        siteName: "Equus Ct",
      },
    );

    expect(result.status).toBe("filled");
    // Critical: when we resumed, we do NOT re-fill Event Information.
    expect(mockedFillEventInfo).not.toHaveBeenCalled();
    // Raw Data flow still runs (fillSampleTable + Save Sample).
    expect(mockedFillSampleTable).toHaveBeenCalledTimes(1);
    const buttons = mockedClickButton.mock.calls.map((c) => c[1]);
    expect(buttons.filter((b) => b === "Save Sample")).toHaveLength(1);
  });

  it("passes a resume key built from the first record + siteName option to navigateToProject", async () => {
    const session = makeFakeSession();
    mockedCreateSession.mockResolvedValue({
      status: "authenticated",
      session,
      screenshotPath: "/tmp/auth.png",
    });

    const records = [
      makeRecord({
        eventStartDate: "05/27/2026",
        eventEndDate: "05/29/2026",
      }),
    ];
    await runFill(
      { username: "u", password: "p" },
      "WDID-001",
      records,
      {
        artifactsDir: ARTIFACTS_DIR,
        siteName: "Equus Ct",
      },
    );

    expect(mockedNavToProject).toHaveBeenCalledTimes(1);
    const passedKey = mockedNavToProject.mock.calls[0]?.[1];
    expect(passedKey).toEqual({
      wdid: "WDID-001",
      resume: {
        siteName: "Equus Ct",
        reportingPeriod: "05/27/2026 - 05/29/2026",
        eventType: "Precipitation Event",
      },
    });
  });

  it("omits the resume key when siteName is not provided (legacy create-new behavior)", async () => {
    const session = makeFakeSession();
    mockedCreateSession.mockResolvedValue({
      status: "authenticated",
      session,
      screenshotPath: "/tmp/auth.png",
    });

    await runFill(
      { username: "u", password: "p" },
      "WDID-001",
      [
        makeRecord({
          eventStartDate: "05/27/2026",
          eventEndDate: "05/29/2026",
        }),
      ],
      { artifactsDir: ARTIFACTS_DIR },
    );

    const passedKey = mockedNavToProject.mock.calls[0]?.[1];
    expect(passedKey).toEqual({ wdid: "WDID-001", resume: undefined });
  });
});
