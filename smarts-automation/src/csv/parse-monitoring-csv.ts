import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import type { MonitoringRecord } from "../types/monitoring-record.js";
import type { ValidationError } from "../types/run-result.js";
import {
  MonitoringRowSchema,
  COLUMNS,
} from "./monitoring-record.schema.js";

export interface ParseSuccess {
  ok: true;
  records: MonitoringRecord[];
}

export interface ParseFailure {
  ok: false;
  errors: ValidationError[];
}

export type ParseResult = ParseSuccess | ParseFailure;

export async function parseMonitoringCsv(filePath: string): Promise<ParseResult> {
  const raw = await readFile(filePath, "utf8");
  return parseMonitoringCsvString(raw);
}

export function parseMonitoringCsvString(raw: string): ParseResult {
  let rows: Record<string, string>[];
  try {
    rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch (e) {
    return {
      ok: false,
      errors: [
        {
          recordIndex: -1,
          field: "<file>",
          message: `CSV parse error: ${(e as Error).message}`,
        },
      ],
    };
  }

  if (rows.length === 0) {
    return {
      ok: false,
      errors: [
        {
          recordIndex: -1,
          field: "<file>",
          message: "CSV contains no data rows",
        },
      ],
    };
  }

  const records: MonitoringRecord[] = [];
  const errors: ValidationError[] = [];

  rows.forEach((row, idx) => {
    const result = MonitoringRowSchema.safeParse(row);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          recordIndex: idx,
          field: issue.path.length === 0 ? "<row>" : String(issue.path[0]),
          message: issue.message,
        });
      }
      return;
    }
    records.push(result.data);
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, records };
}

export { COLUMNS };
