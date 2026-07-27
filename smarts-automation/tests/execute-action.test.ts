import { describe, it, expect } from "vitest";
import { executeAction } from "../src/vision/execute-action.js";
import { HaltError } from "../src/vision/types.js";
import { makeFakePfPage } from "./support/fake-pf-page.js";

describe("executeAction", () => {
  it("click: moves, clicks, then waits 500ms", async () => {
    const f = makeFakePfPage();
    await executeAction(f.page, {
      type: "click",
      x: 100,
      y: 200,
      reason: "submit",
    });
    expect(f.mouse.move).toHaveBeenCalledWith(100, 200);
    expect(f.mouse.click).toHaveBeenCalledWith(100, 200);
    expect(f.waitForTimeout).toHaveBeenCalledWith(500);
  });

  it("type: clicks to focus, clears, types, then waits", async () => {
    const f = makeFakePfPage();
    await executeAction(f.page, {
      type: "type",
      x: 50,
      y: 60,
      value: "7.2",
      reason: "pH field",
    });
    expect(f.mouse.click).toHaveBeenCalledWith(50, 60);
    expect(f.keyboard.press).toHaveBeenCalledWith("ControlOrMeta+A");
    expect(f.keyboard.press).toHaveBeenCalledWith("Delete");
    expect(f.keyboard.type).toHaveBeenCalledWith("7.2");
    expect(f.waitForTimeout).toHaveBeenCalledWith(500);
  });

  it("select: sets the JSF native <select> value + dispatch change near the point (no widget clicks)", async () => {
    const f = makeFakePfPage({
      evaluateResult: {
        found: true,
        optionFound: true,
        selectId: "rawDataForm:analyticalMethod_input",
        value: "150",
        matchedBy: "option-text",
      },
    });

    await executeAction(f.page, {
      type: "select",
      x: 130,
      y: 200,
      optionText: "EPA 150.1",
      reason: "analytical method",
    });

    // Two evaluate calls since the Stage 3 certification hard-stop: the
    // first is the guard's target probe, the second the JSF resolution.
    expect(f.evaluate).toHaveBeenCalledTimes(2);
    expect(f.evaluateArgs[0]).toEqual({
      optionText: "EPA 150.1",
      preferredId: null,
      preferredName: null,
      point: { x: 130, y: 200 },
    });
    expect(f.waitForTimeout).toHaveBeenCalledWith(500);
    expect(f.mouse.click).not.toHaveBeenCalled();
  });

  it("select: throws HaltError when no matching <select> is resolved", async () => {
    const f = makeFakePfPage({
      evaluateResult: {
        found: false,
        optionFound: false,
        selectId: null,
        value: null,
        matchedBy: null,
      },
    });
    await expect(
      executeAction(f.page, {
        type: "select",
        x: 1,
        y: 1,
        optionText: "X",
        reason: "no dropdown",
      }),
    ).rejects.toBeInstanceOf(HaltError);
  });

  it("halt: throws HaltError carrying the reason", async () => {
    const f = makeFakePfPage();
    try {
      await executeAction(f.page, {
        type: "halt",
        reason: "cannot proceed",
      });
      throw new Error("expected HaltError");
    } catch (e) {
      expect(e).toBeInstanceOf(HaltError);
      expect((e as HaltError).haltReason).toBe("cannot proceed");
    }
    expect(f.mouse.click).not.toHaveBeenCalled();
  });

  it("done: returns immediately and performs no Page actions", async () => {
    const f = makeFakePfPage();
    await executeAction(f.page, { type: "done", reason: "section complete" });
    expect(f.mouse.move).not.toHaveBeenCalled();
    expect(f.mouse.click).not.toHaveBeenCalled();
    expect(f.keyboard.type).not.toHaveBeenCalled();
    expect(f.waitForTimeout).not.toHaveBeenCalled();
  });
});
