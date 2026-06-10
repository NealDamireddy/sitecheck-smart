import type {
  MonitoringRecord,
  ValidatedMonitoringRecord,
} from "../types/monitoring-record.js";
import type { ValidationError } from "../types/run-result.js";
import type {
  ValidationResult,
  ValidationWarning,
} from "../types/validation-result.js";
import { formatForSmarts } from "./smarts-datetime.js";

export const PH_NAL_MIN = 6.0;
export const PH_NAL_MAX = 9.0;
export const TURBIDITY_NAL_MAX_NTU = 250;

export function validateForCgp(records: MonitoringRecord[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const validated: ValidatedMonitoringRecord[] = [];

  records.forEach((rec, idx) => {
    const recErrors = collectHardErrors(rec, idx);
    if (recErrors.length > 0) {
      errors.push(...recErrors);
      return;
    }

    collectNalWarnings(rec, idx, warnings);

    validated.push({
      ...rec,
      sampleDateTimeFormatted: formatForSmarts(rec.sampleDateTime),
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, records: validated, warnings };
}

function collectHardErrors(
  rec: MonitoringRecord,
  idx: number,
): ValidationError[] {
  const errs: ValidationError[] = [];

  if (!rec.monitoringLocationId || rec.monitoringLocationId.trim() === "") {
    errs.push({
      recordIndex: idx,
      field: "monitoringLocationId",
      message: "monitoring location ID is required",
    });
  }

  if (!rec.dischargePoint || rec.dischargePoint.trim() === "") {
    errs.push({
      recordIndex: idx,
      field: "dischargePoint",
      message: "discharge point is required",
    });
  }

  if (
    !(rec.sampleDateTime instanceof Date) ||
    Number.isNaN(rec.sampleDateTime.getTime())
  ) {
    errs.push({
      recordIndex: idx,
      field: "sampleDateTime",
      message: "sample datetime is required and must be a valid date",
    });
  }

  if (rec.phValue === null) {
    errs.push({
      recordIndex: idx,
      field: "phValue",
      message: "pH must be present and numeric",
    });
  } else if (!Number.isFinite(rec.phValue)) {
    errs.push({
      recordIndex: idx,
      field: "phValue",
      message: "pH must be a finite number",
    });
  }

  if (rec.turbidityNtu !== null) {
    if (!Number.isFinite(rec.turbidityNtu)) {
      errs.push({
        recordIndex: idx,
        field: "turbidityNtu",
        message: "turbidity must be a finite number when present",
      });
    } else if (rec.turbidityNtu < 0) {
      errs.push({
        recordIndex: idx,
        field: "turbidityNtu",
        message: "turbidity must be ≥ 0 when present",
      });
    }
  }

  return errs;
}

function collectNalWarnings(
  rec: MonitoringRecord,
  idx: number,
  warnings: ValidationWarning[],
): void {
  if (rec.phValue !== null) {
    if (rec.phValue < PH_NAL_MIN) {
      warnings.push({
        recordIndex: idx,
        field: "phValue",
        code: "NAL_EXCEEDANCE_PH_LOW",
        message: `pH=${rec.phValue} below NAL minimum ${PH_NAL_MIN}`,
      });
    } else if (rec.phValue > PH_NAL_MAX) {
      warnings.push({
        recordIndex: idx,
        field: "phValue",
        code: "NAL_EXCEEDANCE_PH_HIGH",
        message: `pH=${rec.phValue} above NAL maximum ${PH_NAL_MAX}`,
      });
    }
  }

  if (
    rec.turbidityNtu !== null &&
    Number.isFinite(rec.turbidityNtu) &&
    rec.turbidityNtu > TURBIDITY_NAL_MAX_NTU
  ) {
    warnings.push({
      recordIndex: idx,
      field: "turbidityNtu",
      code: "NAL_EXCEEDANCE_TURBIDITY",
      message: `turbidity=${rec.turbidityNtu} NTU above NAL maximum ${TURBIDITY_NAL_MAX_NTU} NTU`,
    });
  }
}
