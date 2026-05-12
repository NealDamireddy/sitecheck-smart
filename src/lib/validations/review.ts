import { z } from 'zod';

export const missionReviewCreate = z.object({
  waypointNumber: z.number({ message: 'waypointNumber must be a number' }),
  checkpointId: z.string().min(1, 'checkpointId is required'),
  decision: z.enum(['accept', 'override', 'pending'], {
    message: 'decision must be accept, override, or pending',
  }),
  overrideStatus: z.string().optional(),
  overrideNotes: z.string().max(5000).optional(),
  aiAnalysisId: z.string().optional(),
});
