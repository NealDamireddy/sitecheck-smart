import { z } from 'zod';
import { refineNdDnq } from './nd-dnq';

const PARAMETERS = ['pH', 'Turbidity'] as const;
const QUALIFIERS = ['=', 'ND', 'DNQ'] as const;
const ANALYZED_BY = ['Self', 'Lab'] as const;

/**
 * Standalone create — used when adding a parameter result to an
 * existing sample (not the atomic sample-create path; for that, see
 * sampleCreate's embedded parameterResults array).
 */
export const parameterResultCreate = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  sampleId: z.string().min(1, 'sampleId is required'),
  parameter: z.enum(PARAMETERS),
  qualifier: z.enum(QUALIFIERS).optional(),
  result: z.number().min(0).nullable().optional(),
  units: z.string().min(1).max(50),
  analyticalMethod: z.string().min(1).max(200),
  mdl: z.number().min(0).nullable().optional(),
  rl: z.number().min(0).nullable().optional(),
  analyzedBy: z.enum(ANALYZED_BY).optional(),
}).superRefine(refineNdDnq);

export const parameterResultUpdate = z.object({
  qualifier: z.enum(QUALIFIERS).optional(),
  result: z.number().min(0).nullable().optional(),
  units: z.string().min(1).max(50).optional(),
  analyticalMethod: z.string().min(1).max(200).optional(),
  mdl: z.number().min(0).nullable().optional(),
  rl: z.number().min(0).nullable().optional(),
  analyzedBy: z.enum(ANALYZED_BY).optional(),
});
