import type { MonitoringRecord } from "./monitoring-record.js";

export interface ValidationError {
  recordIndex: number;
  field: string;
  message: string;
}

export interface FilledResult {
  status: "filled";
  record: MonitoringRecord;
  filledAt: Date;
  reviewUrl: string | null;
  screenshotPath: string | null;
}

export interface HaltedResult {
  status: "halted";
  reason: string;
  record: MonitoringRecord | null;
  screenshotPath: string | null;
  domSnapshotPath: string | null;
  haltedAt: Date;
}

export interface ValidationFailedResult {
  status: "validation_failed";
  errors: ValidationError[];
  failedAt: Date;
}

export type RunResult = FilledResult | HaltedResult | ValidationFailedResult;

export const isFilled = (r: RunResult): r is FilledResult =>
  r.status === "filled";

export const isHalted = (r: RunResult): r is HaltedResult =>
  r.status === "halted";

export const isValidationFailed = (
  r: RunResult,
): r is ValidationFailedResult => r.status === "validation_failed";
