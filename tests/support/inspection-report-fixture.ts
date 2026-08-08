import { getBmpCategoriesForRiskLevel } from '@/lib/cgp/risk-level-bmps';
import { TRADITIONAL_RISK_2_CHECKLIST_VERSION } from '@/lib/cgp/checklist-expansion';
import type {
  InspectionReportChecklistResultRow,
  InspectionReportSnapshotRow,
} from '@/lib/cgp/inspection-report-data';

export const REPORT_OBSERVED_AT = '2026-03-09T18:30:00.000Z';
export const REPORT_SUBMITTED_AT = '2026-03-09T18:35:00.000Z';

export function inspectionReportSnapshot(
  overrides: Partial<InspectionReportSnapshotRow> = {}
): InspectionReportSnapshotRow {
  return {
    id: 'insp-1',
    project_id: 'proj-1',
    type: 'routine',
    trigger: 'routine',
    status: 'submitted',
    submitted_at: REPORT_SUBMITTED_AT,
    weather_temperature: '72',
    weather_condition: 'Clear',
    weather_wind_speed_mph: '8',
    weather_humidity: '45',
    checklist_template_id: TRADITIONAL_RISK_2_CHECKLIST_VERSION,
    checklist_observed_at: REPORT_OBSERVED_AT,
    unflagged_items_confirmed: true,
    unflagged_items_confirmed_at: REPORT_SUBMITTED_AT,
    checklist_attested_by_name: 'Historical QSP',
    checklist_compliant_count: 21,
    checklist_deficient_count: 1,
    checklist_submission_sha256: 'a'.repeat(64),
    site_name_snapshot: '4003 Equus Ct',
    wdid_snapshot: '2 01C402404',
    risk_level_snapshot: 2,
    construction_stage_snapshot: 'Earthwork/Grading',
    photos_taken: true,
    inspector_title_snapshot: 'QSP',
    qsp_license_number_snapshot: 'QSP-12345',
    qsp_company_snapshot: 'Historical Company',
    qpe_start: null,
    qpe_end: null,
    qpe_duration_hours: null,
    rain_gauge_inches: null,
    obs_precipitation: false,
    obs_discolorations: false,
    obs_odors: false,
    obs_turbidity: false,
    obs_sheen: false,
    obs_floating_material: false,
    obs_suspended_material: false,
    observation_comments: null,
    exemption_documentation: null,
    ...overrides,
  };
}

export function inspectionReportResults(
  exceptionItemId: string | null = 'gh-wm-6'
): InspectionReportChecklistResultRow[] {
  return getBmpCategoriesForRiskLevel(2).flatMap((category) =>
    category.questions.map((question, index) => {
      const deficient = question.id === exceptionItemId;
      return {
        inspection_id: 'insp-1',
        checklist_template_id: TRADITIONAL_RISK_2_CHECKLIST_VERSION,
        checklist_item_id: question.id,
        category_number: category.number,
        category_title: category.title,
        item_number: index + 1,
        prompt: question.prompt,
        answer: deficient ? 'no' : 'yes',
        answer_source: deficient
          ? 'qsp-exception'
          : 'qsp-unflagged-attestation',
        exception_description: deficient
          ? 'Concrete washout containment was deficient.'
          : null,
        recommendation: deficient
          ? 'Restore containment and remove washout material.'
          : null,
        identified_at: deficient ? REPORT_OBSERVED_AT : null,
        repair_start_due_at: deficient
          ? '2026-03-12T18:30:00.000Z'
          : null,
        action_implemented_at: null,
        checkpoint_id_snapshot: deficient ? 'checkpoint-old' : null,
        location_snapshot: deficient ? 'North washout' : null,
        photo_urls: deficient ? ['https://example.com/history.jpg'] : [],
      };
    })
  );
}
