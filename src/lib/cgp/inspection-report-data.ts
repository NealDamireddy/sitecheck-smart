import { ZodError } from 'zod';
import {
  CGP_CERTIFICATION_STATEMENT,
  CGP_PERMIT_ORDER,
  INSPECTION_REPORT_CONTRACT_VERSION,
  inspectionReportContractSchema,
  type InspectionReportContract,
} from './inspection-report-contract';
import {
  NO_BMP_EXCEPTIONS_MESSAGE,
  TRADITIONAL_RISK_2_CHECKLIST_VERSION,
} from './checklist-expansion';

/**
 * The only database shapes Phase 5 exporters may consume. In particular,
 * these inputs deliberately have no project, checkpoint, current-weather, or
 * mutable deficiency fields that could rewrite a historical inspection.
 */
export interface InspectionReportSnapshotRow {
  id: string;
  project_id: string;
  type: string;
  trigger: string | null;
  status: string | null;
  submitted_at: string | null;
  weather_temperature: number | string | null;
  weather_condition: string | null;
  weather_wind_speed_mph: number | string | null;
  weather_humidity: number | string | null;
  checklist_template_id: string | null;
  checklist_observed_at: string | null;
  unflagged_items_confirmed: boolean | null;
  unflagged_items_confirmed_at: string | null;
  checklist_attested_by_name: string | null;
  checklist_compliant_count: number | string | null;
  checklist_deficient_count: number | string | null;
  checklist_submission_sha256: string | null;
  site_name_snapshot: string | null;
  wdid_snapshot: string | null;
  risk_level_snapshot: number | string | null;
  construction_stage_snapshot: string | null;
  photos_taken: boolean | null;
  inspector_title_snapshot: string | null;
  qsp_license_number_snapshot: string | null;
  qsp_company_snapshot: string | null;
  qpe_start: string | null;
  qpe_end: string | null;
  qpe_duration_hours: number | string | null;
  rain_gauge_inches: number | string | null;
  obs_precipitation: boolean | null;
  obs_discolorations: boolean | null;
  obs_odors: boolean | null;
  obs_turbidity: boolean | null;
  obs_sheen: boolean | null;
  obs_floating_material: boolean | null;
  obs_suspended_material: boolean | null;
  observation_comments: string | null;
  exemption_documentation: string | null;
}

export interface InspectionReportChecklistResultRow {
  inspection_id: string;
  checklist_template_id: string;
  checklist_item_id: string;
  category_number: number | string;
  category_title: string;
  item_number: number | string;
  prompt: string;
  answer: string;
  answer_source: string;
  exception_description: string | null;
  recommendation: string | null;
  identified_at: string | null;
  repair_start_due_at: string | null;
  action_implemented_at: string | null;
  checkpoint_id_snapshot: string | null;
  location_snapshot: string | null;
  photo_urls: unknown;
}

export type InspectionReportDataErrorCode =
  | 'INSPECTION_NOT_SUBMITTED'
  | 'UNSUPPORTED_REPORT_PROFILE'
  | 'INCONSISTENT_REPORT_SNAPSHOT';

export class InspectionReportDataError extends Error {
  constructor(
    public readonly code: InspectionReportDataErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'InspectionReportDataError';
  }
}

function nullableNumber(value: number | string | null): number | null {
  if (value === null || value === '') return null;
  return typeof value === 'number' ? value : Number(value);
}

function requiredInteger(value: number | string | null): number {
  if (value === null || value === '') return Number.NaN;
  return typeof value === 'number' ? value : Number(value);
}

function nullableText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function buildException(row: InspectionReportChecklistResultRow) {
  if (row.answer !== 'no') return null;
  return {
    description: row.exception_description,
    recommendation: row.recommendation,
    identifiedAt: row.identified_at,
    repairStartDueAt: row.repair_start_due_at,
    actionImplementedAt: row.action_implemented_at,
    location: nullableText(row.location_snapshot),
    checkpointId: nullableText(row.checkpoint_id_snapshot),
    photoUrls: row.photo_urls,
  };
}

function inconsistentSnapshot(message: string): never {
  throw new InspectionReportDataError(
    'INCONSISTENT_REPORT_SNAPSHOT',
    message
  );
}

/**
 * Deterministically materialize the regulator-facing report payload from one
 * submitted inspection. The Zod contract is the final fail-closed boundary.
 */
export function buildInspectionReportContract(input: {
  inspection: InspectionReportSnapshotRow;
  checklistResults: readonly InspectionReportChecklistResultRow[];
}): InspectionReportContract {
  const { inspection } = input;
  if (inspection.status !== 'submitted') {
    throw new InspectionReportDataError(
      'INSPECTION_NOT_SUBMITTED',
      'Only a submitted inspection can be exported.'
    );
  }
  if (
    inspection.checklist_template_id !==
      TRADITIONAL_RISK_2_CHECKLIST_VERSION ||
    requiredInteger(inspection.risk_level_snapshot) !== 2
  ) {
    throw new InspectionReportDataError(
      'UNSUPPORTED_REPORT_PROFILE',
      'The inspection does not use the supported Traditional Risk Level 2 checklist.'
    );
  }

  const sortedRows = [...input.checklistResults].sort(
    (left, right) =>
      requiredInteger(left.category_number) -
        requiredInteger(right.category_number) ||
      requiredInteger(left.item_number) - requiredInteger(right.item_number)
  );
  const categoryMap = new Map<
    number,
    { number: number; title: string; items: Array<Record<string, unknown>> }
  >();

  for (const row of sortedRows) {
    if (
      row.inspection_id !== inspection.id ||
      row.checklist_template_id !== inspection.checklist_template_id
    ) {
      inconsistentSnapshot(
        'A checklist result does not belong to the submitted inspection snapshot.'
      );
    }
    if (
      row.answer === 'yes' &&
      (row.exception_description !== null ||
        row.recommendation !== null ||
        row.identified_at !== null ||
        row.repair_start_due_at !== null ||
        row.action_implemented_at !== null)
    ) {
      inconsistentSnapshot(
        'A compliant checklist result contains exception-only snapshot fields.'
      );
    }

    const categoryNumber = requiredInteger(row.category_number);
    const existingCategory = categoryMap.get(categoryNumber);
    if (existingCategory && existingCategory.title !== row.category_title) {
      inconsistentSnapshot(
        'Checklist results contain conflicting category-title snapshots.'
      );
    }
    const category = existingCategory ?? {
      number: categoryNumber,
      title: row.category_title,
      items: [],
    };
    category.items.push({
      id: row.checklist_item_id,
      number: requiredInteger(row.item_number),
      prompt: row.prompt,
      answer: row.answer,
      answerSource: row.answer_source,
      exception: buildException(row),
    });
    categoryMap.set(categoryNumber, category);
  }

  const categories = [...categoryMap.values()].sort(
    (left, right) => left.number - right.number
  );
  const deficiencies = categories.flatMap((category) =>
    category.items.flatMap((item) => {
      if (item.answer !== 'no' || !item.exception) return [];
      return [
        {
          checklistItemId: item.id,
          categoryNumber: category.number,
          itemNumber: item.number,
          prompt: item.prompt,
          ...(item.exception as Record<string, unknown>),
        },
      ];
    })
  );

  const qsp = {
    name: inspection.checklist_attested_by_name,
    title: inspection.inspector_title_snapshot,
    licenseNumber: inspection.qsp_license_number_snapshot,
    company: nullableText(inspection.qsp_company_snapshot),
  };

  const candidate = {
    contractVersion: INSPECTION_REPORT_CONTRACT_VERSION,
    permitOrder: CGP_PERMIT_ORDER,
    sourceSubmissionSha256: inspection.checklist_submission_sha256,
    inspectionId: inspection.id,
    projectId: inspection.project_id,
    inspectionType: inspection.type,
    trigger: inspection.trigger,
    submittedAt: inspection.submitted_at,
    part1: {
      site: {
        name: inspection.site_name_snapshot,
        wdid: inspection.wdid_snapshot,
        projectType: 'traditional',
        riskLevel: requiredInteger(inspection.risk_level_snapshot),
      },
      observedAt: inspection.checklist_observed_at,
      constructionStage: inspection.construction_stage_snapshot,
      photosTaken: inspection.photos_taken,
      weather: {
        condition: nullableText(inspection.weather_condition),
        temperatureF: nullableNumber(inspection.weather_temperature),
        windSpeedMph: nullableNumber(inspection.weather_wind_speed_mph),
        humidityPercent: nullableNumber(inspection.weather_humidity),
      },
      qpe: {
        start: inspection.qpe_start,
        end: inspection.qpe_end,
        durationHours: nullableNumber(inspection.qpe_duration_hours),
        rainGaugeInches: nullableNumber(inspection.rain_gauge_inches),
      },
      exemptionDocumentation: nullableText(inspection.exemption_documentation),
      siteObservations: {
        precipitation: inspection.obs_precipitation,
        discolorations: inspection.obs_discolorations,
        odors: inspection.obs_odors,
        turbidity: inspection.obs_turbidity,
        sheen: inspection.obs_sheen,
        floatingMaterial: inspection.obs_floating_material,
        suspendedMaterial: inspection.obs_suspended_material,
        comments: nullableText(inspection.observation_comments),
      },
      qsp,
    },
    part2: {
      checklistVersion: inspection.checklist_template_id,
      compliantCount: requiredInteger(inspection.checklist_compliant_count),
      deficientCount: requiredInteger(inspection.checklist_deficient_count),
      categories,
    },
    part3: {
      noExceptionsStatement:
        deficiencies.length === 0 ? NO_BMP_EXCEPTIONS_MESSAGE : null,
      deficiencies,
    },
    certification: {
      unflaggedItemsConfirmed: inspection.unflagged_items_confirmed,
      confirmedAt: inspection.unflagged_items_confirmed_at,
      confirmedBy: qsp,
      statement: CGP_CERTIFICATION_STATEMENT,
    },
  };

  try {
    return inspectionReportContractSchema.parse(candidate);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new InspectionReportDataError(
        'INCONSISTENT_REPORT_SNAPSHOT',
        'The stored inspection snapshot is incomplete or inconsistent.',
        error
      );
    }
    throw error;
  }
}
