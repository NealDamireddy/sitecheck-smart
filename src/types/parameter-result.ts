/**
 * One pH or Turbidity reading attached to a `Sample`.
 *
 * The (sampleId, parameter) pair is UNIQUE at the DB level — at most one
 * pH row and one Turbidity row per sample.
 *
 * `result` is nullable when `qualifier` is 'ND' (non-detect) or 'DNQ'
 * (detected, not quantified) — both standard SMARTS qualifiers used when
 * a numeric value can't be reported.
 *
 * NAL (Numeric Action Level) thresholds and the comparison helpers live
 * in `src/lib/smarts/nal-thresholds.ts` to keep this file as pure types.
 */

export type ParameterName = 'pH' | 'Turbidity';

export type ParameterQualifier = '=' | 'ND' | 'DNQ';

export type AnalyzedBy = 'Self' | 'Lab';

export interface ParameterResult {
  id: string;
  projectId: string;
  sampleId: string;
  parameter: ParameterName;
  qualifier: ParameterQualifier;
  /** Null when qualifier is 'ND' or 'DNQ'. */
  result?: number;
  /** e.g. 'pH units' for pH, 'NTU' for Turbidity. */
  units: string;
  /** e.g. 'pH field', 'A4500HB', 'EPA 180.1', 'Hach 2100Q'. */
  analyticalMethod: string;
  /** Method Detection Limit. */
  mdl?: number;
  /** Reporting Limit (optional in v1). */
  rl?: number;
  analyzedBy: AnalyzedBy;
  createdAt: string;
  updatedAt: string;
}
