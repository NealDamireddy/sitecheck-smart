/**
 * App-side expression of the SMARTS "onboarding constants vs. per-inspection
 * variables" split (smarts-automation/src/types/site-profile.ts).
 *
 * In the app these constants ALREADY live in the DB — `projects` (wdid, name),
 * `monitoring_locations` (name + discharge point), and per-result methods/lab
 * on `parameter_results`. This adapter extracts that constant view from the
 * same RLS-scoped join the export/sync paths use (SmartsExportInput), so an
 * onboarding UI can render/edit a single SiteProfile per WDID.
 *
 * NOTE: this is intentionally NOT wired into the verified bot-bridge.ts fill
 * path (which composes per-sample for fidelity). It's the canonical read-model
 * of the site constants; the bridge stays the source of truth for what gets
 * typed. Analytical method / lab values are derived from existing samples
 * because today they're stored per result — the derived value is the method
 * most recently used for each parameter.
 */

import type { ParameterName, Sample } from '@/types';
import type { SmartsExportInput } from '@/lib/smarts/types';
import { normalizeMethod } from '@/lib/smarts/normalize';

export interface SiteMonitoringLocation {
  id: string;
  name: string;
  dischargePoint: string;
}

export interface SiteProfile {
  wdid: string | null;
  siteName: string;
  qspName: string;
  monitoringLocations: SiteMonitoringLocation[];
  phAnalyticalMethod: string;
  turbidityAnalyticalMethod: string;
  labName?: string;
  mdlPh?: string;
  rlPh?: string;
  mdlTurbidity?: string;
  rlTurbidity?: string;
  eventType: string;
}

/** Mirrors EVENT_TYPE_OPTION / SMARTS_EVENT_TYPE — the only type filled today. */
const SMARTS_EVENT_TYPE = 'Precipitation Event';

function latestResultFor(samples: Sample[], parameter: ParameterName) {
  // Samples come back unordered; pick the most recently collected one that
  // carries this parameter so the derived "constant" reflects current practice.
  const ordered = [...samples].sort(
    (a, b) =>
      new Date(b.sampleDatetime).getTime() - new Date(a.sampleDatetime).getTime()
  );
  for (const sample of ordered) {
    const result = (sample.parameterResults ?? []).find(
      (p) => p.parameter === parameter
    );
    if (result) return result;
  }
  return null;
}

export function siteProfileFromExportInput(
  input: SmartsExportInput
): SiteProfile {
  const { projectName, wdid, monitoringLocations, samples } = input;

  const ph = latestResultFor(samples, 'pH');
  const turbidity = latestResultFor(samples, 'Turbidity');

  const profile: SiteProfile = {
    wdid,
    siteName: projectName,
    qspName: samples.find((s) => s.qspName)?.qspName ?? '',
    monitoringLocations: monitoringLocations.map((l) => ({
      id: l.id,
      name: l.name,
      dischargePoint: l.dischargePointType,
    })),
    phAnalyticalMethod: ph ? normalizeMethod(ph.analyticalMethod) : '',
    turbidityAnalyticalMethod: turbidity
      ? normalizeMethod(turbidity.analyticalMethod)
      : '',
    eventType: SMARTS_EVENT_TYPE,
  };

  // Lab constants only when the latest results were lab-analyzed (matches the
  // bot's lab_name marker → "Lab" on the Analyzed By dropdown + MDL/RL fills).
  const labResult =
    ph?.analyzedBy === 'Lab' ? ph : turbidity?.analyzedBy === 'Lab' ? turbidity : null;
  if (labResult) {
    profile.labName = 'Lab';
    if (ph?.analyzedBy === 'Lab') {
      if (ph.mdl != null) profile.mdlPh = String(ph.mdl);
      if (ph.rl != null) profile.rlPh = String(ph.rl);
    }
    if (turbidity?.analyzedBy === 'Lab') {
      if (turbidity.mdl != null) profile.mdlTurbidity = String(turbidity.mdl);
      if (turbidity.rl != null) profile.rlTurbidity = String(turbidity.rl);
    }
  }

  return profile;
}
