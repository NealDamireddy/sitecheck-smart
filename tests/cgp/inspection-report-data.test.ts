import { describe, expect, it } from 'vitest';
import {
  buildInspectionReportContract,
  InspectionReportDataError,
} from '@/lib/cgp/inspection-report-data';
import { NO_BMP_EXCEPTIONS_MESSAGE } from '@/lib/cgp/checklist-expansion';
import {
  inspectionReportResults,
  inspectionReportSnapshot,
} from '../support/inspection-report-fixture';

describe('stored inspection report materializer', () => {
  it('builds the complete validated contract from immutable snapshot rows', () => {
    const contract = buildInspectionReportContract({
      inspection: inspectionReportSnapshot(),
      checklistResults: inspectionReportResults().reverse(),
    });

    expect(contract.part2.categories).toHaveLength(8);
    expect(contract.part2.categories.flatMap((category) => category.items)).toHaveLength(22);
    expect(contract.part2).toMatchObject({ compliantCount: 21, deficientCount: 1 });
    expect(contract.part1).toMatchObject({
      site: { name: '4003 Equus Ct', wdid: '2 01C402404', riskLevel: 2 },
      weather: { temperatureF: 72, windSpeedMph: 8, humidityPercent: 45 },
      qsp: {
        name: 'Historical QSP',
        licenseNumber: 'QSP-12345',
        company: 'Historical Company',
      },
    });
    expect(contract.part3.deficiencies[0]).toMatchObject({
      checklistItemId: 'gh-wm-6',
      description: 'Concrete washout containment was deficient.',
      checkpointId: 'checkpoint-old',
      photoUrls: ['https://example.com/history.jpg'],
    });
  });

  it('uses submitted identity and checklist copies, never similarly named live values', () => {
    const inspection = {
      ...inspectionReportSnapshot(),
      inspector: 'Current QSP must not appear',
      project_name: 'Renamed live project must not appear',
      qsp_license_number: 'CURRENT-LICENSE',
    };
    const rows = inspectionReportResults();
    const historicalPrompt = rows[0].prompt;

    const contract = buildInspectionReportContract({ inspection, checklistResults: rows });

    expect(contract.part1.site.name).toBe('4003 Equus Ct');
    expect(contract.part1.qsp.name).toBe('Historical QSP');
    expect(contract.part1.qsp.licenseNumber).toBe('QSP-12345');
    expect(contract.part2.categories[0].items[0].prompt).toBe(historicalPrompt);
    expect(JSON.stringify(contract)).not.toContain('Current QSP');
    expect(JSON.stringify(contract)).not.toContain('Renamed live project');
    expect(JSON.stringify(contract)).not.toContain('CURRENT-LICENSE');
  });

  it('produces the exact no-exceptions statement from 22 compliant snapshots', () => {
    const contract = buildInspectionReportContract({
      inspection: inspectionReportSnapshot({
        checklist_compliant_count: 22,
        checklist_deficient_count: 0,
      }),
      checklistResults: inspectionReportResults(null),
    });

    expect(contract.part3).toEqual({
      noExceptionsStatement: NO_BMP_EXCEPTIONS_MESSAGE,
      deficiencies: [],
    });
  });

  it('rejects a draft inspection before reading it as a report', () => {
    expect(() =>
      buildInspectionReportContract({
        inspection: inspectionReportSnapshot({ status: 'draft' }),
        checklistResults: inspectionReportResults(),
      })
    ).toThrowError(
      expect.objectContaining<Partial<InspectionReportDataError>>({
        code: 'INSPECTION_NOT_SUBMITTED',
      })
    );
  });

  it.each([
    ['missing submission hash', { checklist_submission_sha256: null }],
    ['missing QSP license', { qsp_license_number_snapshot: null }],
    ['missing site observation', { obs_turbidity: null }],
  ])('fails closed for %s', (_label, overrides) => {
    expect(() =>
      buildInspectionReportContract({
        inspection: inspectionReportSnapshot(overrides),
        checklistResults: inspectionReportResults(),
      })
    ).toThrowError(
      expect.objectContaining<Partial<InspectionReportDataError>>({
        code: 'INCONSISTENT_REPORT_SNAPSHOT',
      })
    );
  });

  it('rejects an incomplete or count-mismatched 22-row snapshot', () => {
    expect(() =>
      buildInspectionReportContract({
        inspection: inspectionReportSnapshot(),
        checklistResults: inspectionReportResults().slice(1),
      })
    ).toThrowError(
      expect.objectContaining<Partial<InspectionReportDataError>>({
        code: 'INCONSISTENT_REPORT_SNAPSHOT',
      })
    );
  });

  it('rejects a mutated deadline rather than recomputing it silently', () => {
    const rows = inspectionReportResults();
    rows.find((row) => row.answer === 'no')!.repair_start_due_at =
      '2026-03-12T17:30:00.000Z';

    expect(() =>
      buildInspectionReportContract({
        inspection: inspectionReportSnapshot(),
        checklistResults: rows,
      })
    ).toThrowError(
      expect.objectContaining<Partial<InspectionReportDataError>>({
        code: 'INCONSISTENT_REPORT_SNAPSHOT',
      })
    );
  });

  it.each([
    ['another inspection', { inspection_id: 'insp-other' }],
    ['another checklist template', { checklist_template_id: 'template-other' }],
    ['a conflicting copied category title', { category_title: 'Mutated title' }],
  ])('rejects a result row belonging to %s', (_label, mutation) => {
    const rows = inspectionReportResults();
    Object.assign(rows[0], mutation);

    expect(() =>
      buildInspectionReportContract({
        inspection: inspectionReportSnapshot(),
        checklistResults: rows,
      })
    ).toThrowError(
      expect.objectContaining<Partial<InspectionReportDataError>>({
        code: 'INCONSISTENT_REPORT_SNAPSHOT',
      })
    );
  });

  it('rejects exception-only fields attached to a compliant row', () => {
    const rows = inspectionReportResults();
    const compliant = rows.find((row) => row.answer === 'yes')!;
    compliant.exception_description = 'Hidden exception text';

    expect(() =>
      buildInspectionReportContract({
        inspection: inspectionReportSnapshot(),
        checklistResults: rows,
      })
    ).toThrowError(
      expect.objectContaining<Partial<InspectionReportDataError>>({
        code: 'INCONSISTENT_REPORT_SNAPSHOT',
      })
    );
  });
});
