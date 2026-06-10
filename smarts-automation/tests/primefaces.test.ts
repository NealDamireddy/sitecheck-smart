import { describe, it, expect, afterEach } from "vitest";
import {
  setJsfSelectByText,
  jsfSelectInBrowser,
} from "../src/util/primefaces.js";
import { makeFakePfPage } from "./support/fake-pf-page.js";

describe("setJsfSelectByText (wrapper)", () => {
  it("passes optionText + preferred id to page.evaluate and returns the result", async () => {
    const f = makeFakePfPage();
    const result = await setJsfSelectByText(
      f.page,
      "2025 - 2026",
      "noiReadyForm:selectedReportingYearId_input",
    );

    expect(f.evaluate).toHaveBeenCalledTimes(1);
    expect(f.evaluateArgs[0]).toEqual({
      optionText: "2025 - 2026",
      preferredId: "noiReadyForm:selectedReportingYearId_input",
      preferredName: null,
      point: null,
    });
    expect(result.found).toBe(true);
    expect(result.optionFound).toBe(true);
  });

  it("forwards a point for coordinate-based resolution (vision layer)", async () => {
    const f = makeFakePfPage();
    await setJsfSelectByText(f.page, "EPA 150.1", undefined, { x: 130, y: 200 });
    expect(f.evaluateArgs[0]).toEqual({
      optionText: "EPA 150.1",
      preferredId: null,
      preferredName: null,
      point: { x: 130, y: 200 },
    });
  });

  it("forwards a preferredName for row-indexed JSF selects (sample table)", async () => {
    const f = makeFakePfPage();
    await setJsfSelectByText(
      f.page,
      "E150.2",
      undefined,
      undefined,
      "constAdhocForm:CGPAdhocRawData:j_idt288:0:j_idt298",
    );
    expect(f.evaluateArgs[0]).toEqual({
      optionText: "E150.2",
      preferredId: null,
      preferredName: "constAdhocForm:CGPAdhocRawData:j_idt288:0:j_idt298",
      point: null,
    });
  });
});

// --- Browser-context resolver tested against a minimal fake DOM -------------

interface FakeOption {
  text: string;
  value: string;
}

class FakeSelect {
  tagName = "SELECT";
  value = "";
  dispatched: string[] = [];
  name = "";
  constructor(
    public id: string,
    public options: FakeOption[],
    private rect: { left: number; top: number; width: number; height: number } = {
      left: 0,
      top: 0,
      width: 10,
      height: 10,
    },
  ) {}
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return this.rect;
  }
  dispatchEvent(ev: { type: string }): boolean {
    this.dispatched.push(ev.type);
    return true;
  }
}

function installDom(selects: FakeSelect[]): void {
  const g = globalThis as unknown as {
    document: unknown;
    Event: unknown;
  };
  g.document = {
    getElementById: (id: string) => selects.find((s) => s.id === id) ?? null,
    querySelectorAll: (_sel: string) => selects,
  };
  g.Event = class {
    type: string;
    bubbles: boolean;
    constructor(type: string, init?: { bubbles?: boolean }) {
      this.type = type;
      this.bubbles = init?.bubbles ?? false;
    }
  };
}

describe("jsfSelectInBrowser (resolver)", () => {
  const original = {
    document: (globalThis as Record<string, unknown>)["document"],
    Event: (globalThis as Record<string, unknown>)["Event"],
  };

  afterEach(() => {
    (globalThis as Record<string, unknown>)["document"] = original.document;
    (globalThis as Record<string, unknown>)["Event"] = original.Event;
  });

  it("sets the value by exact id and dispatches a bubbling change event", () => {
    const yearSel = new FakeSelect("noiReadyForm:selectedReportingYearId_input", [
      { text: "Select Reporting Year", value: "0" },
      { text: "2025 - 2026", value: "2025" },
      { text: "2026 - 2027", value: "2026" },
    ]);
    installDom([yearSel]);

    const r = jsfSelectInBrowser({
      optionText: "2025 - 2026",
      preferredId: "noiReadyForm:selectedReportingYearId_input",
      preferredName: null,
      point: null,
    });

    expect(r).toEqual({
      found: true,
      optionFound: true,
      selectId: "noiReadyForm:selectedReportingYearId_input",
      value: "2025",
      matchedBy: "id",
    });
    expect(yearSel.value).toBe("2025");
    expect(yearSel.dispatched).toContain("change");
  });

  it("falls back to any <select> whose option text matches when the id is absent", () => {
    const yearSel = new FakeSelect("someOtherAutoId_input", [
      { text: "2025 - 2026", value: "2025" },
      { text: "2026 - 2027", value: "2026" },
    ]);
    installDom([yearSel]);

    const r = jsfSelectInBrowser({
      optionText: "2025 - 2026",
      preferredId: "noiReadyForm:selectedReportingYearId_input",
      preferredName: null,
      point: null,
    });

    expect(r.found).toBe(true);
    expect(r.optionFound).toBe(true);
    expect(r.value).toBe("2025");
    expect(r.matchedBy).toBe("option-text");
    expect(yearSel.value).toBe("2025");
    expect(yearSel.dispatched).toContain("change");
  });

  it("chooses the matching <select> nearest the point when several match", () => {
    const far = new FakeSelect(
      "far",
      [{ text: "EPA 150.1", value: "a" }],
      { left: 1000, top: 1000, width: 20, height: 10 },
    );
    const near = new FakeSelect(
      "near",
      [{ text: "EPA 150.1", value: "b" }],
      { left: 100, top: 100, width: 40, height: 20 },
    );
    installDom([far, near]);

    const r = jsfSelectInBrowser({
      optionText: "EPA 150.1",
      preferredId: null,
      preferredName: null,
      point: { x: 110, y: 108 },
    });

    expect(r.selectId).toBe("near");
    expect(near.value).toBe("b");
    expect(near.dispatched).toContain("change");
    expect(far.value).toBe("");
  });

  it("reports not found when no <select> matches", () => {
    installDom([new FakeSelect("x", [{ text: "Other", value: "1" }])]);
    const r = jsfSelectInBrowser({
      optionText: "2025 - 2026",
      preferredId: "missing",
      preferredName: null,
      point: null,
    });
    expect(r.found).toBe(false);
    expect(r.optionFound).toBe(false);
  });

  it("matches by the select's name attribute when preferredName is given", () => {
    const phMethod = new FakeSelect("", [
      { text: "A4500HB", value: "63" },
      { text: "E150.2", value: "1102" },
    ]);
    phMethod.name = "constAdhocForm:CGPAdhocRawData:j_idt288:0:j_idt298";
    const turbMethod = new FakeSelect("", [
      { text: "E180.1", value: "224" },
    ]);
    turbMethod.name = "constAdhocForm:CGPAdhocRawData:j_idt288:1:j_idt298";
    installDom([phMethod, turbMethod]);

    const r = jsfSelectInBrowser({
      optionText: "E150.2",
      preferredId: null,
      preferredName: "constAdhocForm:CGPAdhocRawData:j_idt288:0:j_idt298",
      point: null,
    });

    expect(r.found).toBe(true);
    expect(r.optionFound).toBe(true);
    expect(r.value).toBe("1102");
    expect(r.matchedBy).toBe("name");
    expect(phMethod.value).toBe("1102");
    expect(turbMethod.value).toBe("");
  });
});
