/**
 * Block 5 — Corrective Actions
 *
 * The audit-trail closure for an AI finding. When Claude flags a checkpoint
 * as deficient and the QSP accepts the finding (or overrides another finding
 * to deficient), a corrective action is created off the back of that
 * `mission_ai_analyses` row. The action stays open until a follow-up photo
 * and resolution notes are attached.
 *
 * One regulator audit chain looks like:
 *   AI finding (mission_ai_analyses)
 *     -> QSP decision (mission_qsp_reviews)
 *     -> CorrectiveAction.open
 *     -> CorrectiveAction.in-progress (work scheduled)
 *     -> CorrectiveAction.resolved (resolutionPhotoUrl + resolutionNotes)
 *     -> CorrectiveAction.verified (QSP signs off the resolution photo)
 */

export type CorrectiveActionSeverity = 'low' | 'medium' | 'high';

export type CorrectiveActionStatus =
  | 'open'
  | 'in-progress'
  | 'resolved'
  | 'verified';

export interface CorrectiveAction {
  id: string;
  projectId: string;

  /** Optional — the inspection that surfaced this finding. */
  inspectionId?: string;
  /** Optional — the mission whose photo flagged the deficiency. */
  missionId?: string;
  /** Optional — the waypoint within the mission. */
  waypointNumber?: number;
  /** Optional — the BMP checkpoint id this action corrects. */
  checkpointId?: string;
  /**
   * Optional — the `mission_ai_analyses` row that originally surfaced
   * the deficiency. Lets the UI link the resolution photo back to the
   * Claude analysis that triggered the action.
   */
  sourceAnalysisId?: string;

  /** What needs to happen, in QSP-readable language. */
  description: string;
  /** CGP section reference (e.g. "Section XIV.A.1"). */
  cgpReference?: string;

  severity: CorrectiveActionSeverity;
  status: CorrectiveActionStatus;

  /** When the regulator expects this corrected by (ISO 8601). */
  dueDate: string;

  // ── Resolution fields, populated when status flips to `resolved` ──
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionPhotoUrl?: string;
  resolutionNotes?: string;

  createdAt: string;
  updatedAt: string;
}
