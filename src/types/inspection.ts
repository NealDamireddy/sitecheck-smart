import { CheckpointStatus } from './checkpoint';
import { WeatherSnapshot } from './weather';
import type { InspectionType } from './drone';

export interface InspectionFinding {
  checkpointId: string;
  status: CheckpointStatus;
  notes: string;
}

export interface InspectionChecklistResult {
  id: number;
  inspectionId: string;
  checklistVersion: string;
  checklistItemId: string;
  categoryNumber: number;
  categoryTitle: string;
  itemNumber: number;
  prompt: string;
  answer: 'yes' | 'no';
  answerSource: 'qsp-unflagged-attestation' | 'qsp-exception';
  exceptionDescription?: string;
  recommendation?: string;
  identifiedAt?: string;
  repairStartDueAt?: string;
  actionImplementedAt?: string;
  checkpointIdSnapshot?: string;
  locationSnapshot?: string;
  photoUrls: string[];
  recordedAt: string;
}

export interface InspectionChecklistDeficiency {
  id: string;
  inspectionId: string;
  checklistResultId?: number;
  checkpointId?: string;
  detectedAt: string;
  description: string;
  recommendation: string;
  repairStartDueAt: string;
  repairStartedAt?: string;
  repairCompletedAt?: string;
  verifiedAt?: string;
  actionImplementedAt?: string;
  status: 'open' | 'in-progress' | 'resolved';
}

/**
 * Block 5 — what kicked off this inspection.
 * `manual` is the legacy default for inspections created before Block 5.
 * `rain-event` and `qpe` come from the rain-event detector.
 */
export type InspectionTrigger =
  | 'manual'
  | 'routine'
  | 'rain-event'
  | 'post-storm'
  | 'pre-storm'
  | 'qpe';

/**
 * Block 5 — workflow status. `draft` is the default until the QSP starts
 * editing the narrative; `submitted` freezes the linked report and
 * `submitted_at` timestamp.
 */
export type InspectionStatus =
  | 'draft'
  | 'in-progress'
  | 'submitted'
  | 'archived';

export interface Inspection {
  id: string;
  date: string;
  type: InspectionType;
  inspector: string;
  weather: WeatherSnapshot;
  findings: InspectionFinding[];
  overallCompliance: number;
  missionId?: string;
  /** For linear projects: which segment this inspection covered (if any) */
  segmentId?: string;
  /** For linear projects: station range start in feet */
  stationRangeStart?: number;
  /** For linear projects: station range end in feet */
  stationRangeEnd?: number;

  // ─── Block 5 additions (all optional so legacy data still parses) ───

  /** What kicked off this inspection. `manual` is the legacy default. */
  trigger?: InspectionTrigger;
  /** Optional FK to the rain-event row that triggered this inspection. */
  triggerEventId?: string;
  /** Regulatory deadline (ISO 8601). For rain events, startedAt + 48h. */
  dueBy?: string;
  /** Workflow status — defaults to `draft` for newly-created inspections. */
  status?: InspectionStatus;
  /** QSP free-text narrative summary, surfaced in the PDF cover page. */
  narrative?: string;
  /** 0-100, derived purely from `mission_ai_analyses` for linked missions. */
  aiOverallCompliance?: number;
  /**
   * 0-100, derived from `mission_qsp_reviews` (override wins over AI).
   * Falls back to `aiOverallCompliance` when no QSP review exists.
   */
  qspOverallCompliance?: number;
  /** Permanent FK to the most recent generated `reports` row. */
  reportId?: string;
  /** Frozen at `submit` time. */
  submittedAt?: string;
  /**
   * Many-to-many list of mission IDs rolled up into this inspection.
   * Resolved server-side from the `inspection_missions` join table.
   */
  missionIds?: string[];
  /** Server-computed updated_at (mirrors the new column). */
  updatedAt?: string;

  // Versioned CGP checklist history (Phase 2/3)
  checklistVersion?: string;
  checklistObservedAt?: string;
  unflaggedItemsConfirmed?: boolean;
  unflaggedItemsConfirmedAt?: string;
  checklistAttestedByName?: string;
  checklistCompliantCount?: number;
  checklistDeficientCount?: number;
  siteNameSnapshot?: string;
  wdidSnapshot?: string;
  riskLevelSnapshot?: 1 | 2 | 3;
  constructionStageSnapshot?: string;
  photosTaken?: boolean;
  checklistSubmissionSha256?: string;
  inspectorTitleSnapshot?: 'QSP';
  qspLicenseNumberSnapshot?: string;
  qspCompanySnapshot?: string;
  qpeStart?: string;
  qpeEnd?: string;
  qpeDurationHours?: number;
  rainGaugeInches?: number;
  observationPrecipitation?: boolean;
  observationDiscolorations?: boolean;
  observationOdors?: boolean;
  observationTurbidity?: boolean;
  observationSheen?: boolean;
  observationFloatingMaterial?: boolean;
  observationSuspendedMaterial?: boolean;
  observationComments?: string;
  exemptionDocumentation?: string;
}
