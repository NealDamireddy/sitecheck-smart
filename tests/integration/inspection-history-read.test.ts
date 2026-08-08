import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeFakeSupabase, type FakeSupabase } from '../support/fake-supabase';

const requireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({ requireAuth: () => requireAuth() }));
vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let fake: FakeSupabase;

beforeEach(() => {
  fake = makeFakeSupabase({
    inspections: {
      single: {
        id: 'insp-1',
        project_id: 'proj-1',
        date: '2026-03-09T18:30:00.000Z',
        type: 'routine',
        inspector: 'QSP One',
        status: 'submitted',
        overall_compliance: 100,
        site_name_snapshot: '4003 Equus Ct',
        wdid_snapshot: '01C402404',
        risk_level_snapshot: 2,
        construction_stage_snapshot: 'Earthwork/Grading',
        checklist_template_id: 'template-v1',
        checklist_observed_at: '2026-03-09T18:30:00.000Z',
        unflagged_items_confirmed: true,
        unflagged_items_confirmed_at: '2026-03-09T18:35:00.000Z',
        checklist_attested_by_name: 'QSP One',
        checklist_compliant_count: 21,
        checklist_deficient_count: 1,
        checklist_submission_sha256: 'b'.repeat(64),
        inspector_title_snapshot: 'QSP',
        qsp_license_number_snapshot: 'QSP-999',
        qsp_company_snapshot: 'Historical Company',
        qpe_start: '2026-03-09T16:00:00.000Z',
        qpe_end: '2026-03-09T18:00:00.000Z',
        qpe_duration_hours: 2,
        rain_gauge_inches: 0.25,
        obs_precipitation: true,
        obs_discolorations: false,
        obs_odors: false,
        obs_turbidity: true,
        obs_sheen: false,
        obs_floating_material: false,
        obs_suspended_material: false,
        observation_comments: 'Turbidity at the north inlet.',
        exemption_documentation: 'No exemption claimed.',
        created_at: '2026-03-09T18:00:00.000Z',
      },
    },
    inspection_missions: { rows: [] },
    inspection_findings: { rows: [] },
    corrective_actions: { rows: [] },
    inspection_checklist_results: {
      rows: [
        {
          id: 1,
          inspection_id: 'insp-1',
          checklist_template_id: 'template-v1',
          checklist_item_id: 'gh-cm-1',
          category_number: 1,
          category_title: 'Construction Materials',
          item_number: 1,
          prompt: 'Historical copied prompt',
          answer: 'yes',
          answer_source: 'qsp-unflagged-attestation',
          photo_urls: [],
          recorded_at: '2026-03-09T18:35:00.000Z',
        },
        {
          id: 2,
          inspection_id: 'insp-1',
          checklist_template_id: 'template-v1',
          checklist_item_id: 'gh-wm-6',
          category_number: 2,
          category_title: 'Waste Management',
          item_number: 6,
          prompt: 'Historical washout prompt',
          answer: 'no',
          answer_source: 'qsp-exception',
          exception_description: 'Historical deficiency',
          recommendation: 'Historical recommendation',
          photo_urls: [],
          recorded_at: '2026-03-09T18:35:00.000Z',
        },
      ],
    },
    deficiencies: {
      rows: [
        {
          id: 'def-1',
          inspection_id: 'insp-1',
          inspection_checklist_result_id: 2,
          detected_date: '2026-03-09T18:30:00.000Z',
          description: 'Historical deficiency',
          recommendation: 'Historical recommendation',
          deadline: '2026-03-12T18:30:00.000Z',
          status: 'open',
        },
      ],
    },
  });
  requireAuth.mockResolvedValue({ user: { id: 'user-a' }, supabase: fake.client });
});

describe('GET /api/inspections/[id] checklist history', () => {
  it('returns snapshot metadata, ordered checklist results, and deficiencies', async () => {
    const { GET } = await import('@/app/api/inspections/[id]/route');
    const response = await GET(
      new NextRequest('http://test/api/inspections/insp-1'),
      { params: Promise.resolve({ id: 'insp-1' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      id: 'insp-1',
      siteNameSnapshot: '4003 Equus Ct',
      wdidSnapshot: '01C402404',
      checklistCompliantCount: 21,
      checklistDeficientCount: 1,
      checklistSubmissionSha256: 'b'.repeat(64),
      inspectorTitleSnapshot: 'QSP',
      qspLicenseNumberSnapshot: 'QSP-999',
      qspCompanySnapshot: 'Historical Company',
      qpeDurationHours: 2,
      rainGaugeInches: 0.25,
      observationPrecipitation: true,
      observationTurbidity: true,
      observationComments: 'Turbidity at the north inlet.',
      exemptionDocumentation: 'No exemption claimed.',
    });
    expect(body.checklistResults).toEqual([
      expect.objectContaining({
        checklistItemId: 'gh-cm-1',
        prompt: 'Historical copied prompt',
        answer: 'yes',
      }),
      expect.objectContaining({
        checklistItemId: 'gh-wm-6',
        exceptionDescription: 'Historical deficiency',
        answer: 'no',
      }),
    ]);
    expect(body.deficiencies).toEqual([
      expect.objectContaining({
        id: 'def-1',
        checklistResultId: 2,
        recommendation: 'Historical recommendation',
      }),
    ]);
  });
});
