import type { Page } from "playwright";
import { requestLlmText } from "./llm.js";
import { VerifyResponseSchema } from "./types.js";

const VERIFY_SYSTEM_PROMPT = `You are an automation agent verifying that a web form has been filled correctly.
You will receive a screenshot of the live page and a question about a specific field.
Respond ONLY with raw JSON. No markdown fences, no preamble, no commentary.

Schema:
{ "confirmed": true }
{ "confirmed": false, "reason": <string> }`;

export async function verifyField(
  page: Page,
  expectedValue: string,
  fieldDescription: string,
): Promise<boolean> {
  try {
    const buf = await page.screenshot({ type: "png" });
    const b64 = buf.toString("base64");
    const userText = `Does the page currently show the value "${expectedValue}" in the ${fieldDescription} field? Respond only with JSON: { "confirmed": true } or { "confirmed": false, "reason": string }.`;

    const raw = await requestLlmText({
      systemPrompt: VERIFY_SYSTEM_PROMPT,
      userText,
      imageBase64: b64,
      maxTokens: 256,
    });

    const json = extractJson(raw);
    if (json === null) return false;

    const parsed = VerifyResponseSchema.safeParse(json);
    if (!parsed.success) return false;
    return parsed.data.confirmed === true;
  } catch {
    return false;
  }
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const candidates = [trimmed, stripFences(trimmed), sliceFirstJsonObject(trimmed)];
  for (const candidate of candidates) {
    if (candidate === null) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }
  return null;
}

function stripFences(s: string): string | null {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (!fenced) return null;
  return fenced[1] ?? null;
}

function sliceFirstJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return s.slice(start, end + 1);
}
