import { z } from 'zod';

const VALID_SEVERITIES = ['low', 'medium', 'high'] as const;
const VALID_STATUSES = ['open', 'in-progress', 'resolved', 'verified'] as const;

export const correctiveActionCreate = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  inspectionId: z.string().optional(),
  missionId: z.string().optional(),
  waypointNumber: z.number().optional(),
  checkpointId: z.string().optional(),
  sourceAnalysisId: z.string().optional(),
  description: z.string().min(1, 'description is required').max(5000),
  cgpReference: z.string().optional(),
  severity: z.enum(VALID_SEVERITIES).optional(),
  status: z.enum(VALID_STATUSES).optional(),
  dueDate: z.string().min(1, 'dueDate is required'),
  resolvedAt: z.string().optional(),
  resolvedBy: z.string().optional(),
  resolutionPhotoUrl: z.string().optional(),
  resolutionNotes: z.string().max(5000).optional(),
});

export const correctiveActionUpdate = z.object({
  description: z.string().max(5000).optional(),
  cgpReference: z.string().optional(),
  dueDate: z.string().optional(),
  resolutionNotes: z.string().max(5000).optional(),
  resolutionPhotoUrl: z.string().optional(),
  resolvedBy: z.string().optional(),
  resolvedAt: z.string().optional(),
  severity: z.enum(VALID_SEVERITIES).optional(),
  status: z.enum(VALID_STATUSES).optional(),
});
