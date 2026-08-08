import { z } from 'zod';

const isoDatetime = z.string().datetime({ offset: true });
const identifier = z.string().trim().min(1).max(200);
const idempotencyKey = z
  .string()
  .trim()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Invalid idempotency key');

const source = z
  .object({
    sourceType: z.enum(['form', 'file', 'api']),
    uploadId: z.string().uuid().optional(),
    rawPayload: z.unknown().optional(),
    payloadSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    schemaVersion: z.string().trim().min(1).max(100),
  })
  .superRefine((value, context) => {
    if (!value.uploadId && value.rawPayload === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['rawPayload'],
        message: 'A source requires an uploadId or rawPayload',
      });
    }
  });

const common = {
  projectId: identifier,
  idempotencyKey,
  title: z.string().trim().max(300).optional(),
  observedFrom: isoDatetime.optional(),
  observedTo: isoDatetime.optional(),
  source: source.optional(),
};

const inspectionDetail = z.object({
  inspectionId: identifier.optional(),
  inspectionDate: isoDatetime,
  inspectionType: z
    .enum(['routine', 'pre-storm', 'post-storm', 'qpe'])
    .default('routine'),
  inspectorName: z.string().trim().min(1).max(200).optional(),
  weatherTemperature: z.number().int().min(-100).max(180).default(0),
  weatherCondition: z.string().trim().min(1).max(100).default('clear'),
  weatherWindSpeedMph: z.number().int().min(0).max(300).default(0),
  weatherHumidity: z.number().int().min(0).max(100).default(0),
  overallCompliance: z.number().int().min(0).max(100).default(0),
});

const weekly = z.object({
  ...common,
  recordType: z.literal('weekly_inspection'),
  detail: inspectionDetail,
});

const monthly = z.object({
  ...common,
  recordType: z.literal('monthly_inspection'),
  detail: inspectionDetail,
});

const smarts = z.object({
  ...common,
  recordType: z.literal('smarts_ad_hoc'),
  detail: z.object({
    smartsEventId: identifier.optional(),
    forecastDetectedAt: isoDatetime.optional(),
    startedAt: isoDatetime,
    endedAt: isoDatetime.optional(),
    precipitationInches: z.number().min(0).max(50).optional(),
    notes: z.string().max(10_000).optional(),
  }),
});

export const siteRecordCreate = z
  .discriminatedUnion('recordType', [weekly, monthly, smarts])
  .superRefine((value, context) => {
    if (
      value.observedFrom &&
      value.observedTo &&
      new Date(value.observedTo) < new Date(value.observedFrom)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['observedTo'],
        message: 'observedTo must not precede observedFrom',
      });
    }

    if (value.recordType === 'smarts_ad_hoc') {
      if (
        value.detail.endedAt &&
        new Date(value.detail.endedAt) < new Date(value.detail.startedAt)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['detail', 'endedAt'],
          message: 'SMARTS event end must not precede its start',
        });
      }

      if (reportingYearStart(value.detail.startedAt) < 2026) {
        context.addIssue({
          code: 'custom',
          path: ['detail', 'startedAt'],
          message: 'SMARTS reporting years before 2026-2027 are closed',
        });
      }
    }
  });

export function reportingYearStart(isoDatetimeValue: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date(isoDatetimeValue));
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return month >= 7 ? year : year - 1;
}

export type SiteRecordCreateInput = z.input<typeof siteRecordCreate>;
