import { z } from "zod";
import type { MonitoringRecord } from "../types/monitoring-record.js";

const REQUIRED_COLUMNS = [
  "monitoring_location_id",
  "monitoring_location_name",
  "sample_datetime",
  "discharge_point",
] as const;

const OPTIONAL_COLUMNS = [
  "ph_value",
  "turbidity_ntu",
  "analytical_method",
  "ph_analytical_method",
  "turbidity_analytical_method",
  "mdl_ph",
  "rl_ph",
  "mdl_turbidity",
  "rl_turbidity",
  "lab_name",
  "qualifier_code",
  "event_start_date",
  "event_start_time",
  "event_end_date",
  "event_end_time",
  "precipitation_inches",
  "qsp_name",
] as const;

export const COLUMNS = {
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

export const MonitoringRowSchema = z
  .object({
    monitoring_location_id: requiredString("monitoring_location_id"),
    monitoring_location_name: requiredString("monitoring_location_name"),
    sample_datetime: requiredString("sample_datetime"),
    discharge_point: requiredString("discharge_point"),
    ph_value: optionalString,
    turbidity_ntu: optionalString,
    analytical_method: optionalString,
    ph_analytical_method: optionalString,
    turbidity_analytical_method: optionalString,
    mdl_ph: optionalString,
    rl_ph: optionalString,
    mdl_turbidity: optionalString,
    rl_turbidity: optionalString,
    lab_name: optionalString,
    qualifier_code: optionalString,
    event_start_date: optionalString,
    event_start_time: optionalString,
    event_end_date: optionalString,
    event_end_time: optionalString,
    precipitation_inches: optionalString,
    qsp_name: optionalString,
  })
  .transform((row, ctx): MonitoringRecord => {
    const parsedDate = new Date(row.sample_datetime);
    if (Number.isNaN(parsedDate.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sample_datetime"],
        message: `sample_datetime "${row.sample_datetime}" is not a valid ISO date`,
      });
      return z.NEVER;
    }

    const phValue = parseOptionalNumber(row.ph_value, "ph_value", ctx);
    const turbidityNtu = parseOptionalNumber(
      row.turbidity_ntu,
      "turbidity_ntu",
      ctx,
    );

    return {
      monitoringLocationId: row.monitoring_location_id,
      monitoringLocationName: row.monitoring_location_name,
      sampleDateTime: parsedDate,
      phValue,
      turbidityNtu,
      analyticalMethod: row.analytical_method,
      labName: row.lab_name,
      qualifierCode: row.qualifier_code,
      dischargePoint: row.discharge_point,
      // optionalString yields string | null; the record fields are optional
      // (string | undefined), so coalesce a blank/absent column to undefined.
      eventStartDate: row.event_start_date ?? undefined,
      eventStartTime: row.event_start_time ?? undefined,
      eventEndDate: row.event_end_date ?? undefined,
      eventEndTime: row.event_end_time ?? undefined,
      precipitationInches: row.precipitation_inches ?? undefined,
      qspName: row.qsp_name ?? undefined,
      phAnalyticalMethod: row.ph_analytical_method ?? undefined,
      turbidityAnalyticalMethod: row.turbidity_analytical_method ?? undefined,
      mdlPh: row.mdl_ph ?? undefined,
      rlPh: row.rl_ph ?? undefined,
      mdlTurbidity: row.mdl_turbidity ?? undefined,
      rlTurbidity: row.rl_turbidity ?? undefined,
    };
  });

function parseOptionalNumber(
  value: string | null,
  field: string,
  ctx: z.RefinementCtx,
): number | null {
  if (value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [field],
      message: `${field} "${value}" is not a number`,
    });
    return null;
  }
  return n;
}

export type MonitoringRowInput = z.input<typeof MonitoringRowSchema>;
