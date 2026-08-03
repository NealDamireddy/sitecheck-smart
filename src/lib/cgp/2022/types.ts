/**
 * Versioned domain types for the 2022 California Construction General
 * Permit. This module is intentionally disconnected from scheduling,
 * notifications, and persistence while the draft rules are reviewed.
 */

export const CGP_2022_DRAFT_RULE_VERSION =
  '2022-0057-DWQ/sitecheck-rules-v1-draft' as const;

export const QPE_INITIAL_POP_PERCENT = 50;
export const QPE_INITIAL_QPF_INCHES = 0.5;
export const QPE_EXTENSION_QPF_INCHES = 0.25;
export const PRE_QPE_WINDOW_HOURS = 72;
export const PRE_QPE_EXTENDED_WINDOW_HOURS = 120;
export const POST_QPE_WINDOW_HOURS = 96;
export const POST_QPE_GAUGE_THRESHOLD_INCHES = 0.5;

export type CgpProjectType = 'traditional' | 'linear';
export type CgpRiskLevel = 1 | 2 | 3;

export interface PermitProfile {
  projectType: CgpProjectType;
  riskLevel: CgpRiskLevel;
  /** IANA timezone, for example `America/Los_Angeles`. */
  siteTimezone: string;
}

/**
 * A discrete forecast period supplied by the forecast-snapshot parser.
 * Periods used for event extension must be consecutive and non-overlapping.
 */
export interface ForecastWindow24h {
  id: string;
  sourceSnapshotId: string;
  startsAt: string;
  endsAt: string;
  probabilityPercent: number | null;
  qpfInches: number | null;
}

export interface NwsGridValue {
  validTime: string;
  value: number | null;
}

export interface NwsGridSeries {
  uom: string;
  values: readonly NwsGridValue[];
}

export type ForecastIntervalQuality =
  | 'complete'
  | 'missing-pop'
  | 'missing-qpf'
  | 'missing-both';

export interface NormalizedNwsSixHourInterval {
  id: string;
  sourceSnapshotId: string;
  startsAt: string;
  endsAt: string;
  probabilityPercent: number | null;
  qpfInches: number | null;
  qualityStatus: ForecastIntervalQuality;
}

export type NwsNormalizationReasonCode =
  | 'SNAPSHOT_ID_MISSING'
  | 'QPF_SERIES_EMPTY'
  | 'QPF_UNIT_UNSUPPORTED'
  | 'POP_UNIT_UNSUPPORTED'
  | 'NWS_INTERVAL_INVALID'
  | 'NWS_INTERVAL_OVERLAP'
  | 'QPF_INTERVAL_NOT_SIX_HOURS';

export interface NwsForecastNormalizationResult {
  status: 'normalized' | 'unknown';
  intervals: NormalizedNwsSixHourInterval[];
  reasonCodes: NwsNormalizationReasonCode[];
}

export interface QpeForecastSequence {
  id: string;
  sourceSnapshotId: string;
  initialSixHourIntervalId: string;
  windows: ForecastWindow24h[];
}

export type QpeSequenceReasonCode =
  | 'SIX_HOUR_INTERVALS_EMPTY'
  | 'SIX_HOUR_INTERVALS_INVALID'
  | 'SIX_HOUR_FORECAST_DATA_MISSING'
  | 'SIX_HOUR_FORECAST_HORIZON_INCOMPLETE';

export interface QpeSequenceBuildResult {
  status: 'complete' | 'partial' | 'unknown';
  sequences: QpeForecastSequence[];
  reasonCodes: QpeSequenceReasonCode[];
}

export type QpeDecisionStatus =
  | 'qualifies'
  | 'does-not-qualify'
  | 'unknown';

export type QpeReasonCode =
  | 'FORECAST_WINDOWS_EMPTY'
  | 'FORECAST_WINDOW_INVALID'
  | 'FORECAST_DATA_MISSING'
  | 'INITIAL_THRESHOLD_MET'
  | 'INITIAL_THRESHOLDS_NOT_MET'
  | 'EVENT_EXTENDED_QPF_THRESHOLD_MET'
  | 'EVENT_END_QPF_BELOW_THRESHOLD'
  | 'EXTENSION_QPF_MISSING'
  | 'EXTENSION_SEQUENCE_INCOMPLETE'
  | 'EXTENSION_FORECAST_HORIZON_EXHAUSTED';

export interface QpeForecastDecision {
  status: QpeDecisionStatus;
  ruleVersion: typeof CGP_2022_DRAFT_RULE_VERSION;
  startsAt: string | null;
  /** Null means the available forecast does not establish an end yet. */
  predictedEndsAt: string | null;
  initialWindowId: string | null;
  /** Initial and extension periods that belong to the QPE. */
  eventWindowIds: string[];
  /** All periods used to make the decision, including an ending period. */
  evidenceWindowIds: string[];
  evidenceSnapshotIds: string[];
  reasonCodes: QpeReasonCode[];
}

export type InspectionRequirementKind =
  | 'pre-qpe'
  | 'during-qpe'
  | 'post-qpe';

export type InspectionRequirementStatus =
  | 'proposed'
  | 'pending-evidence'
  | 'not-required';

export type InspectionRequirementRole =
  | 'qsp'
  | 'qsp-or-trained-delegate';

export type InspectionRequirementReasonCode =
  | 'PILOT_PROFILE_UNSUPPORTED'
  | 'QPE_DECISION_UNKNOWN'
  | 'QPE_NOT_QUALIFYING'
  | 'QPE_EVENT_EVIDENCE_MISSING'
  | 'PRE_QPE_72_HOUR_WINDOW'
  | 'PRE_QPE_120_HOUR_EXTENDED_WINDOW'
  | 'DURING_QPE_24_HOUR_PERIOD'
  | 'QPE_END_NOT_ESTABLISHED'
  | 'ONSITE_GAUGE_REQUIRED'
  | 'ONSITE_GAUGE_INVALID'
  | 'POST_QPE_GAUGE_BELOW_THRESHOLD'
  | 'POST_QPE_96_HOUR_WINDOW';

export interface OnsiteGaugeEvidence {
  evidenceId: string;
  observedAt: string;
  inches: number;
}

export interface ExtendedPreInspectionEvidence {
  /** Evidence showing an extended NWS forecast was available. */
  evidenceId: string;
}

export interface InspectionRequirementProposal {
  id: string;
  kind: InspectionRequirementKind;
  status: InspectionRequirementStatus;
  requiredRole: InspectionRequirementRole;
  opensAt: string | null;
  dueAt: string | null;
  eventPeriodStartsAt: string | null;
  eventPeriodEndsAt: string | null;
  evidenceWindowIds: string[];
  evidenceSnapshotIds: string[];
  evidenceIds: string[];
  reasonCodes: InspectionRequirementReasonCode[];
  ruleVersion: typeof CGP_2022_DRAFT_RULE_VERSION;
}

export type InspectionRequirementEvaluationStatus =
  | 'requirements-proposed'
  | 'not-required'
  | 'unknown'
  | 'review-required';

export interface InspectionRequirementEvaluation {
  status: InspectionRequirementEvaluationStatus;
  ruleVersion: typeof CGP_2022_DRAFT_RULE_VERSION;
  proposals: InspectionRequirementProposal[];
  reasonCodes: InspectionRequirementReasonCode[];
}
