import { z } from 'zod';

export const analyzeCheckpoint = z.object({
  checkpointId: z.string().optional(),
  checkpointName: z.string().optional(),
  bmpCategory: z.string().optional(),
  status: z.string().optional(),
  description: z.string().max(5000).optional(),
  cgpSection: z.string().optional(),
});
