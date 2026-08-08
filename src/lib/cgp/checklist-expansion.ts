/**
 * Phase 1: database-free expansion of the CGP Part 2 checklist.
 *
 * The field client sends only explicit exceptions. Nothing is treated as
 * compliant until the QSP confirms that every unflagged item was reviewed.
 * Once confirmed, this function deterministically produces the complete
 * 22-row Risk Level 2 result and its corresponding deficiency records.
 */

import { REPAIR_START_HOURS } from './constants';
import { getBmpCategoriesForRiskLevel } from './risk-level-bmps';

export const TRADITIONAL_RISK_2_CHECKLIST_VERSION =
  '2022-0057-DWQ/traditional/risk-2/part-2-v1' as const;

export const NO_BMP_EXCEPTIONS_MESSAGE =
  'No exceptions taken to site BMPs.' as const;

export type ChecklistExpansionErrorCode =
  | 'UNSUPPORTED_PROFILE'
  | 'CHECKLIST_VERSION_MISMATCH'
  | 'REVIEW_ATTESTATION_REQUIRED'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_EXCEPTIONS'
  | 'UNKNOWN_CHECKLIST_ITEM'
  | 'DUPLICATE_EXCEPTION'
  | 'INVALID_EXCEPTION';

export class ChecklistExpansionError extends Error {
  constructor(
    public readonly code: ChecklistExpansionErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ChecklistExpansionError';
  }
}

export interface ChecklistExceptionInput {
  /** Stable ID from the versioned master checklist, for example `gh-wm-6`. */
  itemId: string;
  description: string;
  recommendation: string;
  /** Defaults to the inspection's `observedAt` timestamp. */
  identifiedAt?: string;
  /** Optional link to a physical SWPPP/map checkpoint. */
  checkpointId?: string;
  location?: string;
  photoUrls?: readonly string[];
}

export interface ExpandChecklistInput {
  projectType: 'traditional' | 'linear';
  riskLevel: 1 | 2 | 3;
  checklistVersion: string;
  /** Inspection-time instant with an explicit offset or `Z`. */
  observedAt: string;
  /** Explicit QSP confirmation; it may never be inferred from an empty list. */
  unflaggedItemsConfirmed: boolean;
  exceptions: readonly ChecklistExceptionInput[];
}

export interface ExpandedChecklistItem {
  checklistVersion: typeof TRADITIONAL_RISK_2_CHECKLIST_VERSION;
  itemId: string;
  categoryNumber: number;
  categoryTitle: string;
  itemNumber: number;
  prompt: string;
  answer: 'Yes' | 'No';
  answerSource: 'qsp-unflagged-attestation' | 'qsp-exception';
  /** This is an actual implementation date, not the 72-hour start deadline. */
  actionImplementedAt: null;
}

export interface ExpandedChecklistDeficiency {
  checklistVersion: typeof TRADITIONAL_RISK_2_CHECKLIST_VERSION;
  checklistItemId: string;
  categoryNumber: number;
  categoryTitle: string;
  itemNumber: number;
  prompt: string;
  description: string;
  recommendation: string;
  identifiedAt: string;
  repairStartDueAt: string;
  checkpointId?: string;
  location?: string;
  photoUrls: string[];
}

export interface ExpandedChecklist {
  projectType: 'traditional';
  riskLevel: 2;
  checklistVersion: typeof TRADITIONAL_RISK_2_CHECKLIST_VERSION;
  observedAt: string;
  unflaggedItemsConfirmed: true;
  items: ExpandedChecklistItem[];
  deficiencies: ExpandedChecklistDeficiency[];
  compliantCount: number;
  deficientCount: number;
  part3EmptyMessage: typeof NO_BMP_EXCEPTIONS_MESSAGE | null;
}

interface NormalizedException {
  itemId: string;
  description: string;
  recommendation: string;
  identifiedAt: string;
  checkpointId?: string;
  location?: string;
  photoUrls: string[];
}

const EXPLICIT_TIMEZONE = /(?:Z|[+-]\d{2}:\d{2})$/i;

function normalizeTimestamp(value: string, fieldName: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!EXPLICIT_TIMEZONE.test(trimmed)) {
    throw new ChecklistExpansionError(
      'INVALID_TIMESTAMP',
      `${fieldName} must be an ISO 8601 timestamp with an explicit timezone.`
    );
  }

  const timestamp = new Date(trimmed);
  if (Number.isNaN(timestamp.getTime())) {
    throw new ChecklistExpansionError(
      'INVALID_TIMESTAMP',
      `${fieldName} must be a valid ISO 8601 timestamp.`
    );
  }
  return timestamp.toISOString();
}

function requiredText(
  value: string,
  fieldName: string,
  itemId: string
): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new ChecklistExpansionError(
      'INVALID_EXCEPTION',
      `${fieldName} is required for checklist exception ${itemId}.`
    );
  }
  return trimmed;
}

function optionalText(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizePhotoUrls(
  value: readonly string[] | undefined,
  itemId: string
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ChecklistExpansionError(
      'INVALID_EXCEPTION',
      `photoUrls must be an array for checklist exception ${itemId}.`
    );
  }

  return value.map((url, index) => {
    const trimmed = typeof url === 'string' ? url.trim() : '';
    if (!trimmed) {
      throw new ChecklistExpansionError(
        'INVALID_EXCEPTION',
        `photoUrls[${index}] must be a non-empty string for checklist exception ${itemId}.`
      );
    }
    return trimmed;
  });
}

function repairStartDueAt(identifiedAt: string): string {
  return new Date(
    Date.parse(identifiedAt) + REPAIR_START_HOURS * 60 * 60 * 1000
  ).toISOString();
}

/**
 * Expand an exception-only submission into the immutable full checklist shape.
 *
 * Phase 1 deliberately supports only Traditional Construction Risk Level 2.
 * Other profiles fail closed until their exact regulator forms are verified.
 */
export function expandChecklist(input: ExpandChecklistInput): ExpandedChecklist {
  if (input.projectType !== 'traditional' || input.riskLevel !== 2) {
    throw new ChecklistExpansionError(
      'UNSUPPORTED_PROFILE',
      'Phase 1 supports only Traditional Construction Risk Level 2.'
    );
  }

  if (input.checklistVersion !== TRADITIONAL_RISK_2_CHECKLIST_VERSION) {
    throw new ChecklistExpansionError(
      'CHECKLIST_VERSION_MISMATCH',
      `Expected checklist version ${TRADITIONAL_RISK_2_CHECKLIST_VERSION}.`
    );
  }

  if (input.unflaggedItemsConfirmed !== true) {
    throw new ChecklistExpansionError(
      'REVIEW_ATTESTATION_REQUIRED',
      'The QSP must confirm that every unflagged checklist item was reviewed.'
    );
  }

  const observedAt = normalizeTimestamp(input.observedAt, 'observedAt');
  if (!Array.isArray(input.exceptions)) {
    throw new ChecklistExpansionError(
      'INVALID_EXCEPTIONS',
      'exceptions must be an array.'
    );
  }

  const categories = getBmpCategoriesForRiskLevel(2);
  const knownItemIds = new Set(
    categories.flatMap((category) =>
      category.questions.map((question) => question.id)
    )
  );
  const exceptionsByItemId = new Map<string, NormalizedException>();

  for (const exception of input.exceptions) {
    const itemId = optionalText(exception?.itemId);
    if (!itemId || !knownItemIds.has(itemId)) {
      throw new ChecklistExpansionError(
        'UNKNOWN_CHECKLIST_ITEM',
        `Unknown checklist item: ${itemId ?? '(blank)'}.`
      );
    }
    if (exceptionsByItemId.has(itemId)) {
      throw new ChecklistExpansionError(
        'DUPLICATE_EXCEPTION',
        `Checklist item ${itemId} was flagged more than once.`
      );
    }

    const identifiedAt = exception.identifiedAt
      ? normalizeTimestamp(exception.identifiedAt, `${itemId}.identifiedAt`)
      : observedAt;

    exceptionsByItemId.set(itemId, {
      itemId,
      description: requiredText(exception.description, 'description', itemId),
      recommendation: requiredText(
        exception.recommendation,
        'recommendation',
        itemId
      ),
      identifiedAt,
      checkpointId: optionalText(exception.checkpointId),
      location: optionalText(exception.location),
      photoUrls: normalizePhotoUrls(exception.photoUrls, itemId),
    });
  }

  const items: ExpandedChecklistItem[] = [];
  const deficiencies: ExpandedChecklistDeficiency[] = [];

  for (const category of categories) {
    category.questions.forEach((question, index) => {
      const exception = exceptionsByItemId.get(question.id);
      const itemNumber = index + 1;

      items.push({
        checklistVersion: TRADITIONAL_RISK_2_CHECKLIST_VERSION,
        itemId: question.id,
        categoryNumber: category.number,
        categoryTitle: category.title,
        itemNumber,
        prompt: question.prompt,
        answer: exception ? 'No' : 'Yes',
        answerSource: exception
          ? 'qsp-exception'
          : 'qsp-unflagged-attestation',
        actionImplementedAt: null,
      });

      if (exception) {
        deficiencies.push({
          checklistVersion: TRADITIONAL_RISK_2_CHECKLIST_VERSION,
          checklistItemId: question.id,
          categoryNumber: category.number,
          categoryTitle: category.title,
          itemNumber,
          prompt: question.prompt,
          description: exception.description,
          recommendation: exception.recommendation,
          identifiedAt: exception.identifiedAt,
          repairStartDueAt: repairStartDueAt(exception.identifiedAt),
          checkpointId: exception.checkpointId,
          location: exception.location,
          photoUrls: exception.photoUrls,
        });
      }
    });
  }

  return {
    projectType: 'traditional',
    riskLevel: 2,
    checklistVersion: TRADITIONAL_RISK_2_CHECKLIST_VERSION,
    observedAt,
    unflaggedItemsConfirmed: true,
    items,
    deficiencies,
    compliantCount: items.length - deficiencies.length,
    deficientCount: deficiencies.length,
    part3EmptyMessage:
      deficiencies.length === 0 ? NO_BMP_EXCEPTIONS_MESSAGE : null,
  };
}
