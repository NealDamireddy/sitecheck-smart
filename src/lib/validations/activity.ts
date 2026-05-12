import { z } from 'zod';

const VALID_TYPES = ['drone', 'inspection', 'alert', 'weather', 'document', 'deficiency'] as const;

export const activityCreate = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  type: z.enum(VALID_TYPES),
  title: z.string().min(1, 'title is required').max(500),
  description: z.string().min(1, 'description is required').max(5000),
  timestamp: z.string().optional(),
  severity: z.string().optional(),
  linkedEntityId: z.string().optional(),
  linkedEntityType: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
