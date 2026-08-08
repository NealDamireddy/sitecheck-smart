import { z } from 'zod';
import { TRADITIONAL_RISK_2_CHECKLIST_VERSION } from '@/lib/cgp/checklist-expansion';

const optionalTimestamp = z.string().min(1).nullable().optional();

const checklistException = z.object({
  itemId: z.string().min(1).max(100),
  description: z.string().trim().min(1).max(5000),
  recommendation: z.string().trim().min(1).max(5000),
  identifiedAt: z.string().min(1).optional(),
  checkpointId: z.string().trim().min(1).max(200).optional(),
  location: z.string().trim().min(1).max(1000).optional(),
  photoUrls: z.array(z.string().trim().min(1).max(4000)).max(20).optional(),
});

export const inspectionChecklistSubmit = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(200),
    checklistVersion: z.literal(TRADITIONAL_RISK_2_CHECKLIST_VERSION),
    observedAt: z.string().min(1),
    unflaggedItemsConfirmed: z.literal(true),
    constructionStage: z.string().trim().min(1).max(500),
    photosTaken: z.boolean(),
    qpe: z
      .object({
        start: optionalTimestamp,
        end: optionalTimestamp,
        durationHours: z.number().min(0).max(10000).nullable().optional(),
        rainGaugeInches: z.number().min(0).max(1000).nullable().optional(),
      })
      .optional(),
    siteObservations: z.object({
      precipitation: z.boolean(),
      discolorations: z.boolean(),
      odors: z.boolean(),
      turbidity: z.boolean(),
      sheen: z.boolean(),
      floatingMaterial: z.boolean(),
      suspendedMaterial: z.boolean(),
      comments: z.string().trim().max(5000).optional(),
    }),
    exemptionDocumentation: z.string().trim().max(5000).optional(),
    reportId: z.string().trim().min(1).max(200).optional(),
    exceptions: z.array(checklistException).max(22),
  })
  .superRefine((value, ctx) => {
    const start = value.qpe?.start ? Date.parse(value.qpe.start) : null;
    const end = value.qpe?.end ? Date.parse(value.qpe.end) : null;
    if (start != null && Number.isNaN(start)) {
      ctx.addIssue({
        code: 'custom',
        path: ['qpe', 'start'],
        message: 'QPE start must be a valid timestamp.',
      });
    }
    if (end != null && Number.isNaN(end)) {
      ctx.addIssue({
        code: 'custom',
        path: ['qpe', 'end'],
        message: 'QPE end must be a valid timestamp.',
      });
    }
    if (
      start != null &&
      end != null &&
      !Number.isNaN(start) &&
      !Number.isNaN(end) &&
      end < start
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['qpe', 'end'],
        message: 'QPE end cannot be before QPE start.',
      });
    }
  });

export type InspectionChecklistSubmitInput = z.infer<
  typeof inspectionChecklistSubmit
>;

