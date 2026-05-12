import { z } from 'zod';

export const deficiencyCreate = z.object({
  id: z.string().optional(),
  checkpointId: z.string().min(1, 'checkpointId is required'),
  projectId: z.string().optional(),
  detectedDate: z.string().optional(),
  description: z.string().max(5000).optional(),
  cgpViolation: z.string().optional(),
  correctiveAction: z.string().max(5000).optional(),
  deadline: z.string().optional(),
  status: z.string().optional(),
  resolvedDate: z.string().optional(),
  resolvedNotes: z.string().max(5000).optional(),
});

export const deficiencyUpdate = z.object({
  description: z.string().max(5000).optional(),
  cgpViolation: z.string().optional(),
  correctiveAction: z.string().max(5000).optional(),
  deadline: z.string().optional(),
  status: z.string().optional(),
  resolvedDate: z.string().optional(),
  resolvedNotes: z.string().max(5000).optional(),
});
