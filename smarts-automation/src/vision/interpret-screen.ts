import type { MonitoringRecord } from "../types/monitoring-record.js";
import { requestLlmText } from "./llm.js";
import { VisionActionSchema, type VisionAction } from "./types.js";

const SYSTEM_PROMPT = `You are an automation agent filling out a web form on California's SMARTS portal.
You will receive a screenshot of the live page and a task description.
Decide the single next action to take.

Respond ONLY with raw JSON matching the schema below. No markdown fences, no preamble, no commentary.

Schema (a discriminated union on "type"):
{ "type": "click",  "x": <number>, "y": <number>, "reason": <string> }
{ "type": "type",   "x": <number>, "y": <number>, "value": <string>, "reason": <string> }
{ "type": "select", "x": <number>, "y": <number>, "optionText": <string>, "reason": <string> }
{ "type": "halt",   "reason": <string> }
{ "type": "done",   "reason": <string> }

Coordinates must be the center of the target element in screenshot pixel space (x = column, y = row).
If you cannot confidently identify the next field or button, return { "type": "halt", "reason": "<why>" }.
If the section in the task is fully filled and you should hand off, return { "type": "done", "reason": "<why>" }.
Never invent values that are not in the provided data.`;

export async function interpretScreen(
  screenshot: string,
  task: string,
  data: Partial<MonitoringRecord>,
): Promise<VisionAction> {
  try {
    const userText = buildUserText(task, data);
    const raw = await requestLlmText({
      systemPrompt: SYSTEM_PROMPT,
      userText,
      imageBase64: screenshot,
    });

    const json = extractJson(raw);
    if (json === null) {
      return {
        type: "halt",
        reason: "LLM returned unparseable response",
      };
    }

    const parsed = VisionActionSchema.safeParse(json);
    if (!parsed.success) {
      return {
        type: "halt",
        reason: "LLM returned unparseable response",
      };
    }
    return parsed.data;
  } catch {
    return {
      type: "halt",
      reason: "LLM returned unparseable response",
    };
  }
}

function buildUserText(
  task: string,
  data: Partial<MonitoringRecord>,
): string {
  const dataLines: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const printable =
      v instanceof Date ? v.toISOString() : v === null ? "null" : String(v);
    dataLines.push(`  ${k}: ${printable}`);
  }
  const dataBlock =
    dataLines.length === 0 ? "  (no data fields supplied)" : dataLines.join("\n");
  return `Task: ${task}\n\nRelevant data:\n${dataBlock}\n\nReturn only JSON.`;
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
      // try next strategy
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

async function main(): Promise<number> {
  const screenshotArg = process.argv[2];
  if (!screenshotArg) {
    console.error(
      "usage: interpret-screen <path-to-screenshot.png> [task] [data-json]",
    );
    return 2;
  }

  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const buf = await readFile(resolve(process.cwd(), screenshotArg));
  const b64 = buf.toString("base64");

  const task =
    process.argv[3] ??
    "Identify the next field to fill on this SMARTS form and return the appropriate action.";
  let data: Partial<MonitoringRecord> = {};
  if (process.argv[4]) {
    try {
      data = JSON.parse(process.argv[4]) as Partial<MonitoringRecord>;
    } catch {
      console.error("warning: could not parse data-json; using empty data");
    }
  }

  const action = await interpretScreen(b64, task, data);
  console.log(JSON.stringify(action, null, 2));
  return action.type === "halt" ? 1 : 0;
}

import { fileURLToPath } from "node:url";

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err);
      process.exit(1);
    },
  );
}
