/**
 * CGP 2022 Numeric Action Levels (NAL) for SMARTS Ad Hoc Monitoring.
 *
 * Shared by the capture-page card flags and the review-page exceedance
 * detection. Single source of truth — do NOT redeclare these values
 * anywhere else. If the regulatory thresholds change, update them here
 * and both pages reflect the new values automatically.
 *
 * The helpers also live here so per-parameter and per-sample exceedance
 * checks stay consistent across consumers.
 */

import type { ParameterResult } from '@/types';

export const NAL_PH_MIN = 6;
export const NAL_PH_MAX = 9;
export const NAL_TURBIDITY_NTU = 250;

/**
 * Minimal shape needed to evaluate NAL — accepts either a full
 * `ParameterResult` or a stripped-down test object with just `parameter`
 * and `result`. Returns false when `result` is null/undefined (qualifier
 * is 'ND' or 'DNQ' — non-detect or detected-not-quantified — and we
 * can't say one way or the other).
 */
export function isParameterNal(
  p: Pick<ParameterResult, 'parameter' | 'result'>
): boolean {
  if (p.result == null) return false;
  if (p.parameter === 'pH' && (p.result < NAL_PH_MIN || p.result > NAL_PH_MAX)) {
    return true;
  }
  if (p.parameter === 'Turbidity' && p.result > NAL_TURBIDITY_NTU) {
    return true;
  }
  return false;
}

/**
 * True when any parameter on the sample triggers NAL exceedance.
 * Returns false for empty or missing readings.
 */
export function isNalExceedance(
  prs: Pick<ParameterResult, 'parameter' | 'result'>[] | undefined
): boolean {
  if (!prs || prs.length === 0) return false;
  return prs.some(isParameterNal);
}
