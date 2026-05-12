import { z } from 'zod';

export const permitCreate = z.object({
  id: z.string().optional(),
  projectId: z.string().min(1, 'projectId is required'),
  permitType: z.string().min(1, 'permitType is required'),
  segmentId: z.string().optional(),
  crossingId: z.string().optional(),
  permitNumber: z.string().optional(),
  agency: z.string().optional(),
  issuedDate: z.string().optional(),
  expirationDate: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().max(5000).optional(),
});

export const permitUpdate = z.object({
  segmentId: z.string().optional(),
  crossingId: z.string().optional(),
  permitType: z.string().optional(),
  permitNumber: z.string().optional(),
  agency: z.string().optional(),
  issuedDate: z.string().optional(),
  expirationDate: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().max(5000).optional(),
});
