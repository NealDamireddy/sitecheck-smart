import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/vision/llm.js", () => ({
  requestLlmText: vi.fn(),
  VISION_MODEL: "mock-model",
}));

import { requestLlmText } from "../src/vision/llm.js";
import { verifyField } from "../src/vision/verify-field.js";
import type { Page } from "playwright";

const mockRequest = vi.mocked(requestLlmText);

beforeEach(() => {
  mockRequest.mockReset();
});

function makePage(): Page {
  return {
    screenshot: vi.fn().mockResolvedValue(Buffer.from("png-bytes")),
  } as unknown as Page;
}

describe("verifyField", () => {
  it("returns true when LLM confirms", async () => {
    mockRequest.mockResolvedValueOnce('{"confirmed":true}');
    const ok = await verifyField(makePage(), "7.2", "pH");
    expect(ok).toBe(true);
  });

  it("returns false when LLM denies (with reason)", async () => {
    mockRequest.mockResolvedValueOnce('{"confirmed":false,"reason":"shows 7.3"}');
    const ok = await verifyField(makePage(), "7.2", "pH");
    expect(ok).toBe(false);
  });

  it("returns false on malformed JSON", async () => {
    mockRequest.mockResolvedValueOnce("not json");
    const ok = await verifyField(makePage(), "7.2", "pH");
    expect(ok).toBe(false);
  });

  it("returns false when shape doesn't match (e.g. missing reason on false)", async () => {
    mockRequest.mockResolvedValueOnce('{"confirmed":false}');
    const ok = await verifyField(makePage(), "7.2", "pH");
    expect(ok).toBe(false);
  });

  it("returns false when LLM call throws", async () => {
    mockRequest.mockRejectedValueOnce(new Error("network error"));
    const ok = await verifyField(makePage(), "7.2", "pH");
    expect(ok).toBe(false);
  });

  it("forwards the screenshot and includes expected value + field description in prompt", async () => {
    mockRequest.mockResolvedValueOnce('{"confirmed":true}');
    await verifyField(makePage(), "EPA 150.1", "Analytical Method");
    expect(mockRequest).toHaveBeenCalledTimes(1);
    const call = mockRequest.mock.calls[0]![0];
    expect(call.imageBase64).toBe(Buffer.from("png-bytes").toString("base64"));
    expect(call.userText).toContain("EPA 150.1");
    expect(call.userText).toContain("Analytical Method");
  });
});
