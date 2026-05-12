import { z } from 'zod';

export const reportGenerate = z.object({
  projectId: z.string().optional(),
  inspectionId: z.string().optional(),
  segmentId: z.string().optional(),
});
