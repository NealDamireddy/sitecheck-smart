import { z } from 'zod';
import {
  NO_BMP_EXCEPTIONS_MESSAGE,
  TRADITIONAL_RISK_2_CHECKLIST_VERSION,
} from './checklist-expansion';
import { getBmpCategoriesForRiskLevel } from './risk-level-bmps';

/**
 * Shared, renderer-independent contract for regulator-facing inspection
 * exports. PDF and CSV must consume this exact payload so they cannot derive
 * different answers from live project/checkpoint state.
 *
 * Changing a field's meaning, checklist ordering, or certification text
 * requires a new contract version rather than mutating historical exports.
 */
export const INSPECTION_REPORT_CONTRACT_VERSION =
  'sitecheck-cgp-inspection-report-v1' as const;
export const CGP_PERMIT_ORDER = '2022-0057-DWQ' as const;
export const CGP_CERTIFICATION_STATEMENT =
  'I certify under penalty of law that this document and all attachments were prepared under my direction or supervision in accordance with a system designed to assure that qualified personnel properly gathered and evaluated the information submitted. Based on my inquiry of the person or persons who manage the system, or those persons directly responsible for gathering the information, the information submitted is, to the best of my knowledge and belief, true, accurate, and complete. I am aware that there are significant penalties for submitting false information, including the possibility of fine and imprisonment for knowing violations.' as const;

export const INSPECTION_REPORT_SECTION_IDS = [
  'part-1-general-information',
  'part-2-bmp-observations',
  'part-3-bmp-deficiencies',
  'certification',
] as const;

const EXPLICIT_TIMEZONE = /(?:Z|[+-]\d{2}:\d{2})$/i;

const timestamp = z
  .string()
  .min(1)
  .refine(
    (value) =>
      EXPLICIT_TIMEZONE.test(value) && !Number.isNaN(Date.parse(value)),
    'Expected an ISO 8601 timestamp with an explicit timezone.'
  );

const requiredText = z.string().trim().min(1);
const optionalText = requiredText.nullable();

const qspSchema = z
  .object({
    name: requiredText,
    title: z.literal('QSP'),
    licenseNumber: requiredText,
    company: optionalText,
  })
  .strict();

const checklistExceptionSchema = z
  .object({
    description: requiredText,
    recommendation: requiredText,
    identifiedAt: timestamp,
    repairStartDueAt: timestamp,
    actionImplementedAt: timestamp.nullable(),
    location: optionalText,
    checkpointId: optionalText,
    photoUrls: z.array(requiredText).max(20),
  })
  .strict()
  .superRefine((exception, ctx) => {
    const requiredDeadline =
      Date.parse(exception.identifiedAt) + 72 * 60 * 60 * 1000;
    if (Date.parse(exception.repairStartDueAt) !== requiredDeadline) {
      ctx.addIssue({
        code: 'custom',
        path: ['repairStartDueAt'],
        message: 'Repair-start deadline must be exactly 72 hours after identification.',
      });
    }
    if (
      exception.actionImplementedAt &&
      Date.parse(exception.actionImplementedAt) < Date.parse(exception.identifiedAt)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['actionImplementedAt'],
        message: 'Action implementation cannot precede identification.',
      });
    }
  });

const checklistItemSchema = z
  .object({
    id: requiredText,
    number: z.number().int().positive(),
    prompt: requiredText,
    answer: z.enum(['yes', 'no']),
    answerSource: z.enum([
      'qsp-unflagged-attestation',
      'qsp-exception',
    ]),
    exception: checklistExceptionSchema.nullable(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (
      item.answer === 'yes' &&
      (item.answerSource !== 'qsp-unflagged-attestation' || item.exception)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['answerSource'],
        message: 'A compliant item must come from QSP unflagged attestation.',
      });
    }
    if (
      item.answer === 'no' &&
      (item.answerSource !== 'qsp-exception' || !item.exception)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['exception'],
        message: 'A deficient item must contain the QSP exception details.',
      });
    }
  });

const checklistCategorySchema = z
  .object({
    number: z.number().int().min(1).max(8),
    title: requiredText,
    items: z.array(checklistItemSchema).min(1),
  })
  .strict();

const part3DeficiencySchema = z
  .object({
    checklistItemId: requiredText,
    categoryNumber: z.number().int().min(1).max(8),
    itemNumber: z.number().int().positive(),
    prompt: requiredText,
    description: requiredText,
    recommendation: requiredText,
    identifiedAt: timestamp,
    repairStartDueAt: timestamp,
    actionImplementedAt: timestamp.nullable(),
    location: optionalText,
    checkpointId: optionalText,
    photoUrls: z.array(requiredText).max(20),
  })
  .strict();

const expectedCategories = getBmpCategoriesForRiskLevel(2);

export const inspectionReportContractSchema = z
  .object({
    contractVersion: z.literal(INSPECTION_REPORT_CONTRACT_VERSION),
    permitOrder: z.literal(CGP_PERMIT_ORDER),
    sourceSubmissionSha256: z.string().regex(/^[0-9a-f]{64}$/),
    inspectionId: requiredText,
    projectId: requiredText,
    inspectionType: z.enum(['routine', 'pre-storm', 'post-storm', 'qpe']),
    trigger: z.enum([
      'manual',
      'routine',
      'rain-event',
      'post-storm',
      'pre-storm',
      'qpe',
    ]),
    submittedAt: timestamp,
    part1: z
      .object({
        site: z
          .object({
            name: requiredText,
            wdid: requiredText,
            projectType: z.literal('traditional'),
            riskLevel: z.literal(2),
          })
          .strict(),
        observedAt: timestamp,
        constructionStage: requiredText,
        photosTaken: z.boolean(),
        weather: z
          .object({
            condition: optionalText,
            temperatureF: z.number().finite().nullable(),
            windSpeedMph: z.number().finite().min(0).nullable(),
            humidityPercent: z.number().finite().min(0).max(100).nullable(),
          })
          .strict(),
        qpe: z
          .object({
            start: timestamp.nullable(),
            end: timestamp.nullable(),
            durationHours: z.number().finite().min(0).nullable(),
            rainGaugeInches: z.number().finite().min(0).nullable(),
          })
          .strict(),
        exemptionDocumentation: optionalText,
        siteObservations: z
          .object({
            precipitation: z.boolean(),
            discolorations: z.boolean(),
            odors: z.boolean(),
            turbidity: z.boolean(),
            sheen: z.boolean(),
            floatingMaterial: z.boolean(),
            suspendedMaterial: z.boolean(),
            comments: optionalText,
          })
          .strict(),
        qsp: qspSchema,
      })
      .strict()
      .superRefine((part1, ctx) => {
        if (
          part1.qpe.start &&
          part1.qpe.end &&
          Date.parse(part1.qpe.end) < Date.parse(part1.qpe.start)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['qpe', 'end'],
            message: 'QPE end cannot precede QPE start.',
          });
        }
      }),
    part2: z
      .object({
        checklistVersion: z.literal(TRADITIONAL_RISK_2_CHECKLIST_VERSION),
        compliantCount: z.number().int().min(0).max(22),
        deficientCount: z.number().int().min(0).max(22),
        categories: z.array(checklistCategorySchema).length(8),
      })
      .strict(),
    part3: z
      .object({
        noExceptionsStatement: z
          .literal(NO_BMP_EXCEPTIONS_MESSAGE)
          .nullable(),
        deficiencies: z.array(part3DeficiencySchema).max(22),
      })
      .strict(),
    certification: z
      .object({
        unflaggedItemsConfirmed: z.literal(true),
        confirmedAt: timestamp,
        confirmedBy: qspSchema,
        statement: z.literal(CGP_CERTIFICATION_STATEMENT),
      })
      .strict(),
  })
  .strict()
  .superRefine((contract, ctx) => {
    const items = contract.part2.categories.flatMap((category) =>
      category.items.map((item) => ({ category, item }))
    );

    if (items.length !== 22) {
      ctx.addIssue({
        code: 'custom',
        path: ['part2', 'categories'],
        message: 'The Risk Level 2 report must contain exactly 22 checklist items.',
      });
    }

    expectedCategories.forEach((expectedCategory, categoryIndex) => {
      const actualCategory = contract.part2.categories[categoryIndex];
      if (
        !actualCategory ||
        actualCategory.number !== expectedCategory.number ||
        actualCategory.title !== expectedCategory.title
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['part2', 'categories', categoryIndex],
          message: `Expected checklist category ${expectedCategory.number}: ${expectedCategory.title}.`,
        });
        return;
      }

      expectedCategory.questions.forEach((expectedItem, itemIndex) => {
        const actualItem = actualCategory.items[itemIndex];
        if (
          !actualItem ||
          actualItem.id !== expectedItem.id ||
          actualItem.number !== itemIndex + 1 ||
          actualItem.prompt !== expectedItem.prompt
        ) {
          ctx.addIssue({
            code: 'custom',
            path: [
              'part2',
              'categories',
              categoryIndex,
              'items',
              itemIndex,
            ],
            message: `Checklist item ${expectedItem.id} is missing, reordered, or changed.`,
          });
        }
      });

      if (actualCategory.items.length !== expectedCategory.questions.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['part2', 'categories', categoryIndex, 'items'],
          message: `Checklist category ${expectedCategory.number} has the wrong item count.`,
        });
      }
    });

    const compliantItems = items.filter(({ item }) => item.answer === 'yes');
    const deficientItems = items.filter(({ item }) => item.answer === 'no');
    if (
      contract.part2.compliantCount !== compliantItems.length ||
      contract.part2.deficientCount !== deficientItems.length
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['part2'],
        message: 'Stored checklist counts do not match the 22 report rows.',
      });
    }

    if (
      contract.part1.qsp.name !== contract.certification.confirmedBy.name ||
      contract.part1.qsp.licenseNumber !==
        contract.certification.confirmedBy.licenseNumber
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['certification', 'confirmedBy'],
        message: 'Part 1 QSP identity must match the certification identity.',
      });
    }

    const expectedDeficiencies = deficientItems.map(({ category, item }) => ({
      checklistItemId: item.id,
      categoryNumber: category.number,
      itemNumber: item.number,
      prompt: item.prompt,
      ...item.exception!,
    }));

    if (
      JSON.stringify(contract.part3.deficiencies) !==
      JSON.stringify(expectedDeficiencies)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['part3', 'deficiencies'],
        message: 'Part 3 must exactly mirror the deficient Part 2 rows.',
      });
    }

    if (deficientItems.length === 0) {
      if (contract.part3.noExceptionsStatement !== NO_BMP_EXCEPTIONS_MESSAGE) {
        ctx.addIssue({
          code: 'custom',
          path: ['part3', 'noExceptionsStatement'],
          message: `No-exception reports must say: ${NO_BMP_EXCEPTIONS_MESSAGE}`,
        });
      }
    } else if (contract.part3.noExceptionsStatement !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['part3', 'noExceptionsStatement'],
        message: 'A report with deficiencies cannot contain the no-exceptions statement.',
      });
    }
  });

export type InspectionReportContract = z.infer<
  typeof inspectionReportContractSchema
>;

export function parseInspectionReportContract(
  value: unknown
): InspectionReportContract {
  return inspectionReportContractSchema.parse(value);
}

