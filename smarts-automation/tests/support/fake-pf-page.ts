import { vi } from "vitest";
import type { Page } from "playwright";
import type { JsfSelectArgs, JsfSelectResult } from "../../src/util/primefaces.js";

export interface FakePfOpts {
  /** Result returned by page.evaluate (the JSF select resolution). */
  evaluateResult?: JsfSelectResult;
  /** What the certification-guard's target probe sees under the point.
   *  The guard passes an [x, y] tuple to evaluate; JSF select passes an
   *  object — the fake dispatches on that shape. Default: empty (benign). */
  targetDescription?: string;
}

export interface FakePf {
  page: Page;
  mouse: { move: ReturnType<typeof vi.fn>; click: ReturnType<typeof vi.fn> };
  keyboard: { press: ReturnType<typeof vi.fn>; type: ReturnType<typeof vi.fn> };
  waitForTimeout: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  evaluateArgs: JsfSelectArgs[];
}

const SUCCESS: JsfSelectResult = {
  found: true,
  optionFound: true,
  selectId: "noiReadyForm:selectedReportingYearId_input",
  value: "2025",
  matchedBy: "id",
};

export function makeFakePfPage(opts: FakePfOpts = {}): FakePf {
  const mouse = {
    move: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
  };
  const keyboard = {
    press: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
  };
  const waitForTimeout = vi.fn().mockResolvedValue(undefined);
  const evaluateArgs: JsfSelectArgs[] = [];

  const evaluate = vi.fn(
    async (
      _fn: unknown,
      args: JsfSelectArgs | [number, number],
    ): Promise<JsfSelectResult | string> => {
      if (Array.isArray(args)) {
        // Certification-guard target probe.
        return opts.targetDescription ?? "";
      }
      evaluateArgs.push(args);
      return opts.evaluateResult ?? SUCCESS;
    },
  );

  const page = {
    mouse,
    keyboard,
    waitForTimeout,
    evaluate,
  } as unknown as Page;

  return { page, mouse, keyboard, waitForTimeout, evaluate, evaluateArgs };
}
