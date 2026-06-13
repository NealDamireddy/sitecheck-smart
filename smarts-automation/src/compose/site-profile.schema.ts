import { z } from "zod";
import type { SiteProfile } from "../types/site-profile.js";

const trimmedNonEmpty = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, { message: `${label} is required` });

const optionalTrimmed = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v.length > 0, { message: "must be non-empty when present" })
  .optional();

const LocationSchema = z.object({
  id: trimmedNonEmpty("monitoringLocations[].id"),
  name: trimmedNonEmpty("monitoringLocations[].name"),
  dischargePoint: trimmedNonEmpty("monitoringLocations[].dischargePoint"),
});

export const SiteProfileSchema: z.ZodType<SiteProfile> = z
  .object({
    wdid: trimmedNonEmpty("wdid"),
    siteName: trimmedNonEmpty("siteName"),
    qspName: trimmedNonEmpty("qspName"),
    monitoringLocations: z
      .array(LocationSchema)
      .min(1, { message: "at least one monitoring location is required" }),
    phAnalyticalMethod: trimmedNonEmpty("phAnalyticalMethod"),
    turbidityAnalyticalMethod: trimmedNonEmpty("turbidityAnalyticalMethod"),
    labName: optionalTrimmed,
    mdlPh: optionalTrimmed,
    rlPh: optionalTrimmed,
    mdlTurbidity: optionalTrimmed,
    rlTurbidity: optionalTrimmed,
    eventType: optionalTrimmed,
  })
  .superRefine((profile, ctx) => {
    const ids = profile.monitoringLocations.map((l) => l.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["monitoringLocations"],
        message: `duplicate monitoring location id(s): ${[...new Set(dupes)].join(", ")}`,
      });
    }
  });

export interface ParseSiteProfileSuccess {
  ok: true;
  profile: SiteProfile;
}
export interface ParseSiteProfileFailure {
  ok: false;
  errors: string[];
}
export type ParseSiteProfileResult =
  | ParseSiteProfileSuccess
  | ParseSiteProfileFailure;

export function parseSiteProfile(raw: unknown): ParseSiteProfileResult {
  const result = SiteProfileSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map(
        (i) => `${i.path.join(".") || "<root>"}: ${i.message}`,
      ),
    };
  }
  return { ok: true, profile: result.data };
}
