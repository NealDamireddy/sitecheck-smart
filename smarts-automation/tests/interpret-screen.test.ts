import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/vision/llm.js", () => ({
  requestLlmText: vi.fn(),
  VISION_MODEL: "mock-model",
}));

import { requestLlmText } from "../src/vision/llm.js";
import { interpretScreen } from "../src/vision/interpret-screen.js";

const mockRequest = vi.mocked(requestLlmText);

beforeEach(() => {
  mockRequest.mockReset();
});

const SAMPLE_B64 = "AAAA";

describe("interpretScreen", () => {
  it("parses a valid click action", async () => {
    mockRequest.mockResolvedValueOnce(
      '{"type":"click","x":120,"y":340,"reason":"submit button"}',
    );
    const a = await interpretScreen(SAMPLE_B64, "click submit", {});
    expect(a.type).toBe("click");
    if (a.type !== "click") return;
    expect(a.x).toBe(120);
    expect(a.y).toBe(340);
    expect(a.reason).toBe("submit button");
  });

  it("parses a valid type action", async () => {
    mockRequest.mockResolvedValueOnce(
      '{"type":"type","x":50,"y":80,"value":"7.2","reason":"pH field"}',
    );
    const a = await interpretScreen(SAMPLE_B64, "fill pH", { phValue: 7.2 });
    expect(a.type).toBe("type");
    if (a.type !== "type") return;
    expect(a.value).toBe("7.2");
  });

  it("parses a valid select action", async () => {
    mockRequest.mockResolvedValueOnce(
      '{"type":"select","x":10,"y":20,"optionText":"EPA 150.1","reason":"method"}',
    );
    const a = await interpretScreen(SAMPLE_B64, "pick method", {});
    expect(a.type).toBe("select");
    if (a.type !== "select") return;
    expect(a.optionText).toBe("EPA 150.1");
  });

  it("parses a halt response", async () => {
    mockRequest.mockResolvedValueOnce(
      '{"type":"halt","reason":"cannot identify"}',
    );
    const a = await interpretScreen(SAMPLE_B64, "any", {});
    expect(a.type).toBe("halt");
    if (a.type !== "halt") return;
    expect(a.reason).toBe("cannot identify");
  });

  it("parses a done response", async () => {
    mockRequest.mockResolvedValueOnce(
      '{"type":"done","reason":"section complete"}',
    );
    const a = await interpretScreen(SAMPLE_B64, "any", {});
    expect(a.type).toBe("done");
  });

  it("strips markdown fences before parsing", async () => {
    mockRequest.mockResolvedValueOnce(
      '```json\n{"type":"halt","reason":"fenced"}\n```',
    );
    const a = await interpretScreen(SAMPLE_B64, "any", {});
    expect(a.type).toBe("halt");
    if (a.type !== "halt") return;
    expect(a.reason).toBe("fenced");
  });

  it("returns halt on malformed JSON", async () => {
    mockRequest.mockResolvedValueOnce("not json at all");
    const a = await interpretScreen(SAMPLE_B64, "any", {});
    expect(a.type).toBe("halt");
    if (a.type !== "halt") return;
    expect(a.reason).toBe("LLM returned unparseable response");
  });

  it("returns halt when JSON shape does not match schema", async () => {
    mockRequest.mockResolvedValueOnce('{"type":"unknown","x":1}');
    const a = await interpretScreen(SAMPLE_B64, "any", {});
    expect(a.type).toBe("halt");
    if (a.type !== "halt") return;
    expect(a.reason).toBe("LLM returned unparseable response");
  });

  it("returns halt when the LLM call throws (network error)", async () => {
    mockRequest.mockRejectedValueOnce(new Error("network down"));
    const a = await interpretScreen(SAMPLE_B64, "any", {});
    expect(a.type).toBe("halt");
    if (a.type !== "halt") return;
    expect(a.reason).toBe("LLM returned unparseable response");
  });

  it("forwards the screenshot and serializes Date data fields", async () => {
    mockRequest.mockResolvedValueOnce(
      '{"type":"done","reason":"ok"}',
    );
    await interpretScreen(SAMPLE_B64, "fill date", {
      sampleDateTime: new Date("2026-05-20T09:15:00Z"),
      monitoringLocationId: "ML-001",
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    const call = mockRequest.mock.calls[0]![0];
    expect(call.imageBase64).toBe(SAMPLE_B64);
    expect(call.userText).toContain("ML-001");
    expect(call.userText).toContain("2026-05-20T09:15:00.000Z");
    expect(call.userText).toContain("fill date");
  });
});
