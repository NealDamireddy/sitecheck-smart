import { z } from 'zod';

const PARAMETERS = ['pH', 'Turbidity'] as const;
const QUALIFIERS = ['=', 'ND', 'DNQ'] as const;
const ANALYZED_BY = ['Self', 'Lab'] as const;

/**
 * Embedded form — same shape as parameterResultCreate minus sampleId
 * (the server fills sampleId in after inserting the parent sample).
 * Intentionally private — callers that need a standalone schema with
 * sampleId should import parameterResultCreate from './parameter-result'.
 */
const parameterResultInput = z.object({
  parameter: z.enum(PARAMETERS),
  qualifier: z.enum(QUALIFIERS).optional(),
  result: z.number().min(0).nullable().optional(),
  units: z.string().min(1).max(50),
  analyticalMethod: z.string().min(1).max(200),
  mdl: z.number().min(0).nullable().optional(),
  rl: z.number().min(0).nullable().optional(),
  analyzedBy: z.enum(ANALYZED_BY).optional(),
});

export const sampleCreate = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  smartsEventId: z.string().min(1, 'smartsEventId is required'),
  monitoringLocationId: z.string().min(1, 'monitoringLocationId is required'),
  /** ISO 8601. Defaults to NOW() server-side when omitted. */
  sampleDatetime: z.string().optional(),
  qspName: z.string().min(1, 'qspName is required').max(200),
  /** Atomic create: server inserts sample + these results in one call. */
  parameterResults: z.array(parameterResultInput).optional(),
});

export const sampleUpdate = z.object({
  sampleDatetime: z.string().optional(),
  qspName: z.string().min(1).max(200).optional(),
});
