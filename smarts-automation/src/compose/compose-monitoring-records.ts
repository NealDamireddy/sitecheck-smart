import type { MonitoringRecord } from "../types/monitoring-record.js";
import type {
  InspectionEntry,
  InspectionEvent,
  SiteProfile,
} from "../types/site-profile.js";

export interface ComposeSuccess {
  ok: true;
  records: MonitoringRecord[];
}

export interface ComposeFailure {
  ok: false;
  errors: string[];
}

export type ComposeResult = ComposeSuccess | ComposeFailure;

/**
 * Fold per-WDID constants (SiteProfile) + per-submission variables
 * (InspectionEvent + InspectionEntry[]) back into the MonitoringRecord[] shape
 * the existing CGP validator and runFill consume unchanged.
 *
 * Halts loudly (returns ok:false with a per-entry message) when an entry points
 * at a monitoring-location id the profile doesn't define — silently dropping it
 * would hide an onboarding/data mismatch.
 */
export function composeMonitoringRecords(
  profile: SiteProfile,
  event: InspectionEvent,
  entries: InspectionEntry[],
): ComposeResult {
  const errors: string[] = [];

  if (entries.length === 0) {
    errors.push("composeMonitoringRecords: no inspection entries provided");
  }

  const locationsById = new Map(
    profile.monitoringLocations.map((l) => [l.id, l]),
  );
  const knownIds =
    profile.monitoringLocations.map((l) => l.id).join(", ") || "none";

  const records: MonitoringRecord[] = [];
  entries.forEach((entry, i) => {
    const location = locationsById.get(entry.monitoringLocationId);
    if (!location) {
      errors.push(
        `entry #${i + 1}: monitoring location id "${entry.monitoringLocationId}" is not defined in the site profile (known: ${knownIds})`,
      );
      return;
    }

    records.push({
      monitoringLocationId: location.id,
      monitoringLocationName: location.name,
      sampleDateTime: entry.sampleDateTime,
      phValue: entry.phValue,
      turbidityNtu: entry.turbidityNtu,
      // Legacy single-method field mirrors the pH method (matches bot-bridge).
      analyticalMethod: profile.phAnalyticalMethod,
      labName: profile.labName ?? null,
      qualifierCode: entry.qualifierCode ?? null,
      dischargePoint: location.dischargePoint,
      eventStartDate: event.eventStartDate,
      eventStartTime: event.eventStartTime,
      eventEndDate: event.eventEndDate,
      eventEndTime: event.eventEndTime,
      precipitationInches: event.precipitationInches,
      qspName: profile.qspName,
      phAnalyticalMethod: profile.phAnalyticalMethod,
      turbidityAnalyticalMethod: profile.turbidityAnalyticalMethod,
      // MDL/RL only apply to lab-analyzed samples; omitted otherwise (matches
      // the SMARTS rule that they're required only when lab-analyzed).
      mdlPh: profile.labName ? profile.mdlPh : undefined,
      rlPh: profile.labName ? profile.rlPh : undefined,
      mdlTurbidity: profile.labName ? profile.mdlTurbidity : undefined,
      rlTurbidity: profile.labName ? profile.rlTurbidity : undefined,
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, records };
}
