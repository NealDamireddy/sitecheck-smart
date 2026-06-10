import type { ValidatedMonitoringRecord } from "./monitoring-record.js";
import type { ValidationError } from "./run-result.js";

export type ValidationWarningCode =
  | "NAL_EXCEEDANCE_PH_LOW"
  | "NAL_EXCEEDANCE_PH_HIGH"
  | "NAL_EXCEEDANCE_TURBIDITY";

export interface ValidationWarning {
  recordIndex: number;
  field: string;
  code: ValidationWarningCode;
  message: string;
}

export interface ValidationPassed {
  ok: true;
  records: ValidatedMonitoringRecord[];
  warnings: ValidationWarning[];
}

export interface ValidationFailed {
  ok: false;
  errors: ValidationError[];
}

export type ValidationResult = ValidationPassed | ValidationFailed;

export const isValidationPassed = (
  r: ValidationResult,
): r is ValidationPassed => r.ok === true;

export const isValidationFailedCgp = (
  r: ValidationResult,
): r is ValidationFailed => r.ok === false;
