import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import type {
  InspectionEntry,
  InspectionEvent,
} from "../types/site-profile.js";

// The SLIM per-inspection CSV: only the measured values + the event window.
// All per-site constants (QSP, methods, lab, MDL/RL, location names/discharge
// points) live in the SiteProfile JSON, captured once during onboarding.
const REQUIRED_COLUMNS = [
  "monitoring_location_id",
  "sample_datetime",
  "event_start_date",
  "event_start_time",
  "event_end_date",
  "event_end_time",
] as const;

const OPTIONAL_COLUMNS = [
  "ph_value",
  "turbidity_ntu",
  "qualifier_code",
  "precipitation_inches",
] as const;

export const INSPECTION_COLUMNS = {
  required: REQUIRED_COLUMNS,
  optional: OPTIONAL_COLUMNS,
} as const;

const requiredString = (col: string) =>
  z
    .string({
      required_error: `${col} is required`,
      invalid_type_error: `${col} must be a string`,
    })
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, { message: `${col} is required` });

const optionalString = z
  .string()
  .optional()
  .transform((v) => {
    if (v === undefined) return null;
    const t = v.trim();
    return t === "" ? null : t;
  });

const InspectionRowSchema = z.object({
  monitoring_location_id: requiredString("monitoring_location_id"),
  sample_datetime: requiredString("sample_datetime"),
  event_start_date: requiredString("event_start_date"),
  event_start_time: requiredString("event_start_time"),
  event_end_date: requiredString("event_end_date"),
  event_end_time: requiredString("event_end_time"),
  ph_value: optionalString,
  turbidity_ntu: optionalString,
  qualifier_code: optionalString,
  precipitation_inches: optionalString,
});

export interface ParseInspectionSuccess {
  ok: true;
  event: InspectionEvent;
  entries: InspectionEntry[];
}
export interface ParseInspectionFailure {
  ok: false;
  errors: string[];
}
export type ParseInspectionResult =
  | ParseInspectionSuccess
  | ParseInspectionFailure;

export async function parseInspectionCsv(
  filePath: string,
): Promise<ParseInspectionResult> {
  const raw = await readFile(filePath, "utf8");
  return parseInspectionCsvString(raw);
}

export function parseInspectionCsvString(raw: string): ParseInspectionResult {
  let rows: Record<string, string>[];
  try {
    rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch (e) {
    return { ok: false, errors: [`CSV parse error: ${(e as Error).message}`] };
  }
  if (rows.length === 0) {
    return { ok: false, errors: ["inspection CSV contains no data rows"] };
  }

  const errors: string[] = [];
  const entries: InspectionEntry[] = [];
  let event: InspectionEvent | null = null;

  rows.forEach((row, idx) => {
    const result = InspectionRowSchema.safeParse(row);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(
          `row ${idx + 1} ${String(issue.path[0] ?? "<row>")}: ${issue.message}`,
        );
      }
      return;
    }
    const r = result.data;

    const parsedDate = new Date(r.sample_datetime);
    if (Number.isNaN(parsedDate.getTime())) {
      errors.push(
        `row ${idx + 1} sample_datetime: "${r.sample_datetime}" is not a valid ISO date`,
      );
      return;
    }

    const phValue = parseNumber(r.ph_value, idx, "ph_value", errors);
    const turbidityNtu = parseNumber(
      r.turbidity_ntu,
      idx,
      "turbidity_ntu",
      errors,
    );

    // The event window is repeated on every row; the first row defines it and
    // subsequent rows must agree (a mismatch means the rows describe different
    // events, which the single-report fill cannot represent).
    const rowEvent: InspectionEvent = {
      eventStartDate: r.event_start_date,
      eventStartTime: r.event_start_time,
      eventEndDate: r.event_end_date,
      eventEndTime: r.event_end_time,
      precipitationInches: r.precipitation_inches ?? undefined,
    };
    if (event === null) {
      event = rowEvent;
    } else if (!sameEvent(event, rowEvent)) {
      errors.push(
        `row ${idx + 1}: event window differs from row 1 — all rows of one inspection must share the same event`,
      );
    }

    entries.push({
      monitoringLocationId: r.monitoring_location_id,
      sampleDateTime: parsedDate,
      phValue,
      turbidityNtu,
      qualifierCode: r.qualifier_code,
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  if (event === null) {
    return { ok: false, errors: ["inspection CSV produced no event window"] };
  }
  return { ok: true, event, entries };
}

function parseNumber(
  value: string | null,
  idx: number,
  field: string,
  errors: string[],
): number | null {
  if (value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    errors.push(`row ${idx + 1} ${field}: "${value}" is not a number`);
    return null;
  }
  return n;
}

function sameEvent(a: InspectionEvent, b: InspectionEvent): boolean {
  return (
    a.eventStartDate === b.eventStartDate &&
    a.eventStartTime === b.eventStartTime &&
    a.eventEndDate === b.eventEndDate &&
    a.eventEndTime === b.eventEndTime &&
    (a.precipitationInches ?? "") === (b.precipitationInches ?? "")
  );
}
