import { z } from 'zod';

/**
 * Body for POST /api/analyze.
 *
 * Every field was optional (SEC-15), so an empty body reached the Claude
 * prompt as literal "undefined" values — burning a paid call on garbage
 * and putting unvalidated input into a model prompt. The fields the
 * prompt interpolates are now required and length-capped (bounding what
 * a caller can smuggle into the prompt), and `status` is constrained to
 * the real checkpoint statuses because the route echoes it back as the
 * compliance status.
 */
export const analyzeCheckpoint = z.object({
  checkpointId: z.string().min(1, 'checkpointId is required').max(100),
  checkpointName: z.string().min(1, 'checkpointName is required').max(300),
  bmpCategory: z.string().min(1, 'bmpCategory is required').max(100),
  status: z.enum(['compliant', 'deficient', 'needs-review']),
  description: z.string().max(5000).optional().default(''),
  cgpSection: z.string().max(200).optional().default(''),
});
