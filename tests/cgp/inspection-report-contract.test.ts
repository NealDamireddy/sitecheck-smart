import { describe, expect, it } from 'vitest';
import {
  CGP_CERTIFICATION_STATEMENT,
  CGP_PERMIT_ORDER,
  INSPECTION_REPORT_CONTRACT_VERSION,
  inspectionReportContractSchema,
} from '@/lib/cgp/inspection-report-contract';
import {
  NO_BMP_EXCEPTIONS_MESSAGE,
  TRADITIONAL_RISK_2_CHECKLIST_VERSION,
} from '@/lib/cgp/checklist-expansion';
import { getBmpCategoriesForRiskLevel } from '@/lib/cgp/risk-level-bmps';

const observedAt = '2026-03-09T18:30:00.000Z';
const repairStartDueAt = '2026-03-12T18:30:00.000Z';

function fixture(exceptionItemId: string | null = 'gh-wm-6') {
  const categories = getBmpCategoriesForRiskLevel(2).map((category) => ({
    number: category.number,
    title: category.title,
    items: category.questions.map((question, index) => {
      const isException = question.id === exceptionItemId;
      return {
        id: question.id,
        number: index + 1,
        prompt: question.prompt,
        answer: isException ? ('no' as const) : ('yes' as const),
        answerSource: isException
          ? ('qsp-exception' as const)
          : ('qsp-unflagged-attestation' as const),
        exception: isException
          ? {
              description: 'Concrete washout containment was deficient.',
              recommendation: 'Restore containment and remove washout material.',
              identifiedAt: observedAt,
              repairStartDueAt,
              actionImplementedAt: null,
              location: 'North washout',
              checkpointId: null,
              photoUrls: [],
            }
          : null,
      };
    }),
  }));

  const deficientItems = categories.flatMap((category) =>
    category.items.flatMap((item) =>
      item.exception
        ? [
            {
              checklistItemId: item.id,
              categoryNumber: category.number,
              itemNumber: item.number,
              prompt: item.prompt,
              ...item.exception,
            },
          ]
        : []
    )
  );

  return {
    contractVersion: INSPECTION_REPORT_CONTRACT_VERSION,
    permitOrder: CGP_PERMIT_ORDER,
    sourceSubmissionSha256: 'a'.repeat(64),
    inspectionId: 'insp-1',
    projectId: 'proj-1',
    inspectionType: 'routine' as const,
    trigger: 'routine' as const,
    submittedAt: '2026-03-09T18:35:00.000Z',
    part1: {
      site: {
        name: '4003 Equus Ct',
        wdid: '2 01C402404',
        projectType: 'traditional' as const,
        riskLevel: 2 as const,
      },
      observedAt,
      constructionStage: 'Earthwork/Grading',
      photosTaken: true,
      weather: {
        condition: 'Clear',
        temperatureF: 72,
        windSpeedMph: 8,
        humidityPercent: 45,
      },
      qpe: {
        start: null,
        end: null,
        durationHours: null,
        rainGaugeInches: null,
      },
      exemptionDocumentation: null,
      siteObservations: {
        precipitation: false,
        discolorations: false,
        odors: false,
        turbidity: false,
        sheen: false,
        floatingMaterial: false,
        suspendedMaterial: false,
        comments: null,
      },
      qsp: {
        name: 'QSP One',
        title: 'QSP' as const,
        licenseNumber: '12345',
        company: 'SiteCheck QA',
      },
    },
    part2: {
      checklistVersion: TRADITIONAL_RISK_2_CHECKLIST_VERSION,
      compliantCount: 22 - deficientItems.length,
      deficientCount: deficientItems.length,
      categories,
    },
    part3: {
      noExceptionsStatement:
        deficientItems.length === 0 ? NO_BMP_EXCEPTIONS_MESSAGE : null,
      deficiencies: deficientItems,
    },
    certification: {
      unflaggedItemsConfirmed: true as const,
      confirmedAt: '2026-03-09T18:35:00.000Z',
      confirmedBy: {
        name: 'QSP One',
        title: 'QSP' as const,
        licenseNumber: '12345',
        company: 'SiteCheck QA',
      },
      statement: CGP_CERTIFICATION_STATEMENT,
    },
  };
}

describe('inspection report contract v1', () => {
  it('accepts the exact 8-category, 22-item report with one exception', () => {
    const result = inspectionReportContractSchema.parse(fixture());

    expect(result.part2.categories).toHaveLength(8);
    expect(
      result.part2.categories.flatMap((category) => category.items)
    ).toHaveLength(22);
    expect(result.part2.compliantCount).toBe(21);
    expect(result.part2.deficientCount).toBe(1);
    expect(result.part3.deficiencies).toHaveLength(1);
  });

  it('requires the exact no-exceptions statement for an all-compliant report', () => {
    const allCompliant = fixture(null);
    expect(inspectionReportContractSchema.parse(allCompliant).part3).toEqual({
      noExceptionsStatement: NO_BMP_EXCEPTIONS_MESSAGE,
      deficiencies: [],
    });

    allCompliant.part3.noExceptionsStatement = null;
    expect(() => inspectionReportContractSchema.parse(allCompliant)).toThrow(
      'No-exception reports must say'
    );
  });

  it('rejects missing or reordered checklist items', () => {
    const missingItem = fixture();
    missingItem.part2.categories[0].items.shift();
    missingItem.part2.compliantCount -= 1;

    expect(() => inspectionReportContractSchema.parse(missingItem)).toThrow(
      'exactly 22 checklist items'
    );
  });

  it('rejects a deficient answer without QSP exception details', () => {
    const missingException = fixture();
    const deficientItem = missingException.part2.categories[1].items[5];
    deficientItem.exception = null;

    expect(() => inspectionReportContractSchema.parse(missingException)).toThrow(
      'must contain the QSP exception details'
    );
  });

  it('rejects repair deadlines that are not exactly 72 hours', () => {
    const wrongDeadline = fixture();
    const exception = wrongDeadline.part2.categories[1].items[5].exception!;
    exception.repairStartDueAt = '2026-03-12T17:30:00.000Z';
    wrongDeadline.part3.deficiencies[0].repairStartDueAt =
      exception.repairStartDueAt;

    expect(() => inspectionReportContractSchema.parse(wrongDeadline)).toThrow(
      'exactly 72 hours'
    );
  });

  it('rejects Part 3 content that differs from the Part 2 exception snapshot', () => {
    const inconsistentPart3 = fixture();
    inconsistentPart3.part3.deficiencies[0].recommendation =
      'A different live recommendation';

    expect(() => inspectionReportContractSchema.parse(inconsistentPart3)).toThrow(
      'Part 3 must exactly mirror'
    );
  });
});

