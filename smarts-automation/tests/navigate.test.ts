import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/orchestrator/find-existing-draft.js", () => ({
  findExistingDraft: vi.fn().mockResolvedValue([]),
}));

import {
  navigateToProject,
  SMARTS_HOME_URL,
  REPORTING_YEAR,
} from "../src/orchestrator/navigate.js";
import { findExistingDraft } from "../src/orchestrator/find-existing-draft.js";
import type { SMARTSSession } from "../src/auth/types.js";

const mockedFindDraft = vi.mocked(findExistingDraft);

const WDID = "2 01C402404";
const RESUME_KEY = {
  siteName: "Equus Ct",
  reportingPeriod: "05/27/2026 - 05/29/2026",
  eventType: "Precipitation Event",
};

beforeEach(() => {
  mockedFindDraft.mockReset();
  mockedFindDraft.mockResolvedValue([]);
});

interface Controller {
  events: string[];
  getByTextCalls: Array<[string, unknown]>;
  locatorCalls: Array<[string, unknown]>;
  failWaitFor: Set<string>;
  failClick: Set<string>;
  locatorEvaluateCalls: number;
  dialogHandler?: (dialog: {
    accept: () => Promise<void>;
    message: () => string;
  }) => void;
}

interface FakeLocator {
  label: string;
  first: () => FakeLocator;
  waitFor: (opts?: unknown) => Promise<void>;
  click: (opts?: unknown) => Promise<void>;
  count: () => Promise<number>;
  evaluate: (fn: unknown, arg?: unknown) => Promise<unknown>;
  getByText: (text: string, opts?: { exact?: boolean }) => FakeLocator;
  locator: (sel: string, opts?: { hasText?: string }) => FakeLocator;
  filter: (opts?: { hasText?: string | RegExp }) => FakeLocator;
}

function labelFor(sel: string, opts?: { hasText?: string }): string {
  return opts?.hasText ? `sel:${sel}|${opts.hasText}` : `sel:${sel}`;
}

function makeLocator(label: string, ctl: Controller): FakeLocator {
  const loc: FakeLocator = {
    label,
    first: () => loc,
    waitFor: vi.fn(async () => {
      ctl.events.push(`waitFor:${label}`);
      if (ctl.failWaitFor.has(label)) {
        throw new Error(`not visible: ${label}`);
      }
    }),
    click: vi.fn(async () => {
      ctl.events.push(`click:${label}`);
      if (ctl.failClick.has(label)) {
        throw new Error(`click failed: ${label}`);
      }
    }),
    count: vi.fn(async () => 1),
    evaluate: vi.fn(async () => {
      ctl.events.push(`evaluate:${label}`);
      ctl.locatorEvaluateCalls += 1;
    }),
    getByText: (text: string, opts?: { exact?: boolean }) => {
      ctl.getByTextCalls.push([text, opts]);
      return makeLocator(`text:${text}`, ctl);
    },
    locator: (sel: string, opts?: { hasText?: string }) => {
      ctl.locatorCalls.push([sel, opts]);
      return makeLocator(labelFor(sel, opts), ctl);
    },
    filter: (opts?: { hasText?: string | RegExp }) =>
      makeLocator(
        opts?.hasText ? `${label}|filter:${String(opts.hasText)}` : label,
        ctl,
      ),
  };
  return loc;
}

interface Harness {
  session: SMARTSSession;
  ctl: Controller;
  on: ReturnType<typeof vi.fn>;
  goto: ReturnType<typeof vi.fn>;
}

function buildSession(
  init: Partial<Pick<Controller, "failWaitFor" | "failClick">> = {},
): Harness {
  const ctl: Controller = {
    events: [],
    getByTextCalls: [],
    locatorCalls: [],
    failWaitFor: init.failWaitFor ?? new Set(),
    failClick: init.failClick ?? new Set(),
    locatorEvaluateCalls: 0,
  };

  const on = vi.fn(
    (event: string, handler: (d: { accept: () => Promise<void> }) => void) => {
      if (event === "dialog") ctl.dialogHandler = handler;
    },
  );

  const goto = vi.fn(async (url: string) => {
    ctl.events.push(`goto:${url}`);
  });

  const page = {
    on,
    goto,
    screenshot: vi.fn(async () => Buffer.from("")),
    url: vi.fn(() => "https://smarts.waterboards.ca.gov/fake"),
    title: vi.fn(async () => "Fake SMARTS Page"),
    waitForTimeout: vi.fn(async () => {}),
    waitForURL: vi.fn(() => {
      throw new Error("waitForURL must not be used; waits are element-based");
    }),
    getByText: (text: string, opts?: { exact?: boolean }) => {
      ctl.getByTextCalls.push([text, opts]);
      return makeLocator(`text:${text}`, ctl);
    },
    locator: (sel: string, opts?: { hasText?: string }) => {
      ctl.locatorCalls.push([sel, opts]);
      return makeLocator(labelFor(sel, opts), ctl);
    },
  };

  return {
    session: {
      page: page as unknown as SMARTSSession["page"],
      context: {} as SMARTSSession["context"],
      browser: {} as SMARTSSession["browser"],
      close: vi.fn().mockResolvedValue(undefined),
    },
    ctl,
    on,
    goto,
  };
}

const NAV_FILE_REPORTS_LABEL = "sel:a.ui-menuitem-link|File Reports";
const YEAR_SELECT_LABEL =
  'sel:[id="noiReadyForm:selectedReportingYearId_input"]';
const NEW_ADHOC_PANEL_LABEL = 'sel:[id="noiReadyForm:newAdhocPanel"]';

describe("navigateToProject", () => {
  it("happy path: ... -> Start Ad Hoc Report -> select year -> Start New Report (WDID row) -> Event Information", async () => {
    const h = buildSession();
    const result = await navigateToProject(h.session, { wdid: WDID });
    expect(result.status).toBe("navigated");
    if (result.status !== "navigated") return;
    expect(result.mode).toBe("new");

    expect(h.goto).toHaveBeenCalledWith(
      SMARTS_HOME_URL,
      expect.objectContaining({ waitUntil: "domcontentloaded" }),
    );

    const texts = h.ctl.getByTextCalls.map((c) => c[0]);
    expect(texts).toContain("Ad Hoc Monitoring Reports");
    expect(texts).toContain("Start Ad Hoc Report");
    expect(texts).toContain("Start New Report");
    expect(texts).toContain(WDID);
    expect(texts).toContain("Event Information");
    // Step 4 now confirms arrival by waiting for the reporting-year <select>,
    // not helper text (which only appears after a year is chosen).
    expect(h.ctl.locatorCalls.map((c) => c[0])).toContain(
      '[id="noiReadyForm:selectedReportingYearId_input"]',
    );
  });

  it("sets the reporting year by driving the hidden native <select> by id, not widget clicks", async () => {
    const h = buildSession();
    await navigateToProject(h.session, { wdid: WDID });

    expect(REPORTING_YEAR).toBe("2025 - 2026");
    const selectors = h.ctl.locatorCalls.map((c) => c[0]);
    // Hidden <select> targeted by an [id="..."] attribute selector (the id has a
    // colon, so "#" cannot be used) and driven via locator.evaluate.
    expect(selectors).toContain(
      '[id="noiReadyForm:selectedReportingYearId_input"]',
    );
    expect(h.ctl.locatorEvaluateCalls).toBeGreaterThanOrEqual(1);
    expect(h.ctl.events).toContain(`evaluate:${YEAR_SELECT_LABEL}`);
    // Success is the AJAX-injected panel, not navigation or a visual widget.
    expect(selectors).toContain('[id="noiReadyForm:newAdhocPanel"]');
    expect(selectors).not.toContain(".ui-selectonemenu-trigger");
    expect(selectors).not.toContain("li.ui-selectonemenu-item");
  });

  it("uses the WDID to locate the report row (WDID row matching is re-enabled)", async () => {
    const h = buildSession();
    await navigateToProject(h.session, { wdid: WDID });

    const texts = h.ctl.getByTextCalls.map((c) => c[0]);
    expect(texts).toContain(WDID);
    expect(h.ctl.locatorCalls.map((c) => c[0])).toContain("tr");
  });

  it("scopes the File Reports click to the nav menubar, not the body tile", async () => {
    const h = buildSession();
    await navigateToProject(h.session, { wdid: WDID });

    const selectors = h.ctl.locatorCalls.map((c) => c[0]);
    expect(selectors).toContain(".smarts-main-menubar");
    expect(selectors).toContain("a.ui-menuitem-link");

    const navClicks = h.ctl.events.filter(
      (e) => e === `click:${NAV_FILE_REPORTS_LABEL}`,
    );
    expect(navClicks).toHaveLength(1);
    expect(h.ctl.events).not.toContain("click:text:File Reports");
  });

  it("registers a dialog handler that auto-accepts JSF confirm popups", async () => {
    const h = buildSession();
    await navigateToProject(h.session, { wdid: WDID });

    expect(h.on).toHaveBeenCalledWith("dialog", expect.any(Function));
    expect(h.ctl.dialogHandler).toBeTypeOf("function");

    const accept = vi.fn().mockResolvedValue(undefined);
    h.ctl.dialogHandler!({ accept, message: () => "Navigating away" });
    expect(accept).toHaveBeenCalled();
  });

  it("never uses waitForURL (element-presence waits only)", async () => {
    const h = buildSession();
    const result = await navigateToProject(h.session, { wdid: WDID });
    expect(result.status).toBe("navigated");
    if (result.status !== "navigated") return;
    expect(result.mode).toBe("new");
  });

  it("step 1 halt: nav File Reports never becomes visible", async () => {
    const h = buildSession({ failWaitFor: new Set([NAV_FILE_REPORTS_LABEL]) });
    const result = await navigateToProject(h.session, { wdid: WDID });
    expect(result.status).toBe("halted");
    if (result.status !== "halted") return;
    expect(result.reason).toMatch(/^Navigation failed at step 1:/);
    expect(result.reason).toContain("File Reports");
  });

  it("step 2 halt: Ad Hoc Monitoring Reports never appears", async () => {
    const h = buildSession({
      failWaitFor: new Set(["text:Ad Hoc Monitoring Reports"]),
    });
    const result = await navigateToProject(h.session, { wdid: WDID });
    expect(result.status).toBe("halted");
    if (result.status !== "halted") return;
    expect(result.reason).toMatch(/^Navigation failed at step 2:/);
  });

  it("step 3 halt: neither list header nor Start Ad Hoc Report button appears", async () => {
    const h = buildSession({
      failWaitFor: new Set([
        "text:Ad Hoc Reports - Outstanding",
        "text:Start Ad Hoc Report",
      ]),
    });
    const result = await navigateToProject(h.session, { wdid: WDID });
    expect(result.status).toBe("halted");
    if (result.status !== "halted") return;
    expect(result.reason).toMatch(/^Navigation failed at step 3:/);
  });

  it("step 3 succeeds when only the Start Ad Hoc Report button is visible", async () => {
    const h = buildSession({
      failWaitFor: new Set(["text:Ad Hoc Reports - Outstanding"]),
    });
    const result = await navigateToProject(h.session, { wdid: WDID });
    expect(result.status).toBe("navigated");
    if (result.status !== "navigated") return;
    expect(result.mode).toBe("new");
  });

  it("step 4 halt: reporting-year dropdown never appears after Start Ad Hoc Report", async () => {
    const h = buildSession({ failWaitFor: new Set([YEAR_SELECT_LABEL]) });
    const result = await navigateToProject(h.session, { wdid: WDID });
    expect(result.status).toBe("halted");
    if (result.status !== "halted") return;
    expect(result.reason).toMatch(/^Navigation failed at step 4:/);
    expect(result.reason).toContain("selectedReportingYearId_input");
  });

  it("step 5 halt: newAdhocPanel never injected after selecting the year", async () => {
    const h = buildSession({ failWaitFor: new Set([NEW_ADHOC_PANEL_LABEL]) });
    const result = await navigateToProject(h.session, { wdid: WDID });
    expect(result.status).toBe("halted");
    if (result.status !== "halted") return;
    expect(result.reason).toMatch(/^Navigation failed at step 5:/);
    expect(result.reason).toContain("2025 - 2026");
    expect(result.reason).toContain("newAdhocPanel");
  });

  it("step 6 halt: WDID row / Start New Report link not found", async () => {
    const h = buildSession({ failWaitFor: new Set(["sel:tr"]) });
    const result = await navigateToProject(h.session, { wdid: WDID });
    expect(result.status).toBe("halted");
    if (result.status !== "halted") return;
    expect(result.reason).toMatch(/^Navigation failed at step 6:/);
    expect(result.reason).toContain(WDID);
    expect(result.reason).toContain("Start New Report");
  });

  it("step 7 halt: Event Information sidebar never appears on the form", async () => {
    const h = buildSession({
      failWaitFor: new Set(["text:Event Information"]),
    });
    const result = await navigateToProject(h.session, { wdid: WDID });
    expect(result.status).toBe("halted");
    if (result.status !== "halted") return;
    expect(result.reason).toMatch(/^Navigation failed at step 7:/);
    expect(result.reason).toContain("Event Information");
  });

  it("rejects empty WDID without performing any navigation", async () => {
    const h = buildSession();
    await expect(
      navigateToProject(h.session, { wdid: "" }),
    ).rejects.toThrow(/wdid is required/);
    expect(h.goto).not.toHaveBeenCalled();
  });

  // -- Resume / "don't create duplicate drafts" path ------------------------

  it("with a resume key but 0 matching drafts: scans, falls through to the create-new path", async () => {
    mockedFindDraft.mockResolvedValueOnce([]);
    const h = buildSession();
    const result = await navigateToProject(h.session, {
      wdid: WDID,
      resume: RESUME_KEY,
    });
    expect(result.status).toBe("navigated");
    if (result.status !== "navigated") return;
    expect(result.mode).toBe("new");
    expect(mockedFindDraft).toHaveBeenCalledTimes(1);
    expect(mockedFindDraft.mock.calls[0]?.[1]).toEqual(RESUME_KEY);
    // Confirm we still ran the year/dropdown/Start-New-Report flow.
    expect(h.ctl.locatorCalls.map((c) => c[0])).toContain(
      '[id="noiReadyForm:selectedReportingYearId_input"]',
    );
  });

  it("with a resume key and exactly 1 matching draft: clicks the draft link and returns mode: resumed (skips Start Ad Hoc Report)", async () => {
    mockedFindDraft.mockResolvedValueOnce([
      {
        reportId: "1374063",
        linkElementId:
          "noiReadyForm:adhocOutstandingTable:0:noiReadyListTable5EventIdLink",
        rowIndex: 0,
      },
    ]);
    const h = buildSession();
    const result = await navigateToProject(h.session, {
      wdid: WDID,
      resume: RESUME_KEY,
    });

    expect(result.status).toBe("navigated");
    if (result.status !== "navigated") return;
    expect(result.mode).toBe("resumed");
    expect(result.reportId).toBe("1374063");

    // The resume path clicks the draft-id link, then waits for "Event
    // Information". It must NOT touch the Start Ad Hoc Report button, the
    // reporting year <select>, the WDID row, or Start New Report.
    const selectors = h.ctl.locatorCalls.map((c) => c[0]);
    expect(selectors).toContain(
      '[id="noiReadyForm:adhocOutstandingTable:0:noiReadyListTable5EventIdLink"]',
    );
    expect(selectors).not.toContain(
      '[id="noiReadyForm:selectedReportingYearId_input"]',
    );
    expect(selectors).not.toContain('[id="noiReadyForm:newAdhocPanel"]');

    const texts = h.ctl.getByTextCalls.map((c) => c[0]);
    expect(texts).toContain("Event Information");
    // "Start Ad Hoc Report" is still QUERIED at step 3 (it's one of the
    // success signals waitForAnyVisible watches for the ad-hoc list to load).
    // What matters is that we don't CLICK it — the only click in the resume
    // path is on the draft-id link.
    expect(h.ctl.events.filter((e) => e.startsWith("click:"))).not.toContain(
      "click:text:Start Ad Hoc Report",
    );
    expect(h.ctl.events.filter((e) => e.startsWith("click:"))).not.toContain(
      "click:text:Start New Report",
    );
  });

  it("with a resume key and 2+ matching drafts: halts with the report ids listed (no clicks into a draft)", async () => {
    mockedFindDraft.mockResolvedValueOnce([
      {
        reportId: "1374063",
        linkElementId:
          "noiReadyForm:adhocOutstandingTable:0:noiReadyListTable5EventIdLink",
        rowIndex: 0,
      },
      {
        reportId: "1374062",
        linkElementId:
          "noiReadyForm:adhocOutstandingTable:1:noiReadyListTable5EventIdLink",
        rowIndex: 1,
      },
    ]);
    const h = buildSession();
    const result = await navigateToProject(h.session, {
      wdid: WDID,
      resume: RESUME_KEY,
    });

    expect(result.status).toBe("halted");
    if (result.status !== "halted") return;
    expect(result.reason).toMatch(/^Navigation failed at step 3:/);
    expect(result.reason).toContain("multiple existing drafts");
    expect(result.reason).toContain("1374063");
    expect(result.reason).toContain("1374062");
    // Must not have followed either draft link.
    const selectors = h.ctl.locatorCalls.map((c) => c[0]);
    expect(selectors).not.toContain(
      '[id="noiReadyForm:adhocOutstandingTable:0:noiReadyListTable5EventIdLink"]',
    );
    expect(selectors).not.toContain(
      '[id="noiReadyForm:adhocOutstandingTable:1:noiReadyListTable5EventIdLink"]',
    );
  });

  it("without a resume key: never calls findExistingDraft (legacy create-new path)", async () => {
    const h = buildSession();
    await navigateToProject(h.session, { wdid: WDID });
    expect(mockedFindDraft).not.toHaveBeenCalled();
  });
});
