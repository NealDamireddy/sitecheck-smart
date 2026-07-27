/**
 * CERTIFICATION HARD-STOP — the non-negotiable test.
 *
 * The vision loop executes model-generated actions at raw coordinates.
 * If the model ever hallucinates an action aimed at the Certify button
 * or the attestation checkbox, executeAction must throw HaltError
 * BEFORE any mouse/keyboard call reaches the page.
 */
import { describe, it, expect } from "vitest";
import {
  executeAction,
  isForbiddenTarget,
} from "../src/vision/execute-action.js";
import { HaltError } from "../src/vision/types.js";
import { makeFakePfPage } from "./support/fake-pf-page.js";

const CERTIFY_BUTTON =
  'INPUT | adHocForm:certifyBtn | certify | Certify & Submit | submit | Certify & Submit | ';
const ATTESTATION_CHECKBOX =
  'INPUT | adHocForm:attest | attestation | on | checkbox |  | I certify under penalty of law that this document was prepared under my direction ';
const BENIGN_SAVE_BUTTON =
  'INPUT | adHocForm:saveBtn | save | Save Draft | submit | Save Draft | ';

describe("isForbiddenTarget", () => {
  it("flags certify buttons, attestation checkboxes, penalty-of-law text", () => {
    expect(isForbiddenTarget(CERTIFY_BUTTON)).toBe(true);
    expect(isForbiddenTarget(ATTESTATION_CHECKBOX)).toBe(true);
    expect(isForbiddenTarget("A |  |  |  |  | I Certify | ")).toBe(true);
    expect(
      isForbiddenTarget("SPAN |  |  |  |  | prepared under penalty of law | "),
    ).toBe(true);
  });

  it("does not flag ordinary form controls", () => {
    expect(isForbiddenTarget(BENIGN_SAVE_BUTTON)).toBe(false);
    expect(isForbiddenTarget("INPUT | rawDataForm:result |  | 7.2 | text |  | ")).toBe(false);
    expect(isForbiddenTarget("")).toBe(false);
  });
});

describe("executeAction certification hard-stop", () => {
  it("halts a click on the Certify button before any mouse action", async () => {
    const f = makeFakePfPage({ targetDescription: CERTIFY_BUTTON });
    await expect(
      executeAction(f.page, { type: "click", x: 10, y: 10, reason: "next" }),
    ).rejects.toThrow(HaltError);
    await expect(
      executeAction(f.page, { type: "click", x: 10, y: 10, reason: "next" }),
    ).rejects.toThrow(/CERTIFICATION HARD-STOP/);
    expect(f.mouse.move).not.toHaveBeenCalled();
    expect(f.mouse.click).not.toHaveBeenCalled();
  });

  it("halts a click on the attestation checkbox", async () => {
    const f = makeFakePfPage({ targetDescription: ATTESTATION_CHECKBOX });
    await expect(
      executeAction(f.page, { type: "click", x: 10, y: 10, reason: "check box" }),
    ).rejects.toThrow(/CERTIFICATION HARD-STOP/);
    expect(f.mouse.click).not.toHaveBeenCalled();
  });

  it("halts type and select aimed at certification controls", async () => {
    const typeFake = makeFakePfPage({ targetDescription: CERTIFY_BUTTON });
    await expect(
      executeAction(typeFake.page, {
        type: "type",
        x: 5,
        y: 5,
        value: "x",
        reason: "fill",
      }),
    ).rejects.toThrow(/CERTIFICATION HARD-STOP/);
    expect(typeFake.keyboard.type).not.toHaveBeenCalled();

    const selectFake = makeFakePfPage({ targetDescription: ATTESTATION_CHECKBOX });
    await expect(
      executeAction(selectFake.page, {
        type: "select",
        x: 5,
        y: 5,
        optionText: "Yes",
        reason: "choose",
      }),
    ).rejects.toThrow(/CERTIFICATION HARD-STOP/);
  });

  it("lets benign actions through unchanged", async () => {
    const f = makeFakePfPage({ targetDescription: BENIGN_SAVE_BUTTON });
    await executeAction(f.page, { type: "click", x: 10, y: 10, reason: "save" });
    expect(f.mouse.click).toHaveBeenCalledWith(10, 10);
  });

  it("fails open when the target probe errors (structural guards remain)", async () => {
    const f = makeFakePfPage();
    (f.evaluate as unknown as { mockRejectedValueOnce: (e: Error) => void })
      .mockRejectedValueOnce(new Error("detached frame"));
    await executeAction(f.page, { type: "click", x: 10, y: 10, reason: "next" });
    expect(f.mouse.click).toHaveBeenCalledWith(10, 10);
  });
});
