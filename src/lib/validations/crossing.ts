import { z } from 'zod';

export const crossingCreate = z.object({
  id: z.string().optional(),
  projectId: z.string().min(1, 'projectId is required'),
  name: z.string().min(1, 'name is required').max(500),
  crossingType: z.string().min(1, 'crossingType is required'),
  segmentId: z.string().optional(),
  stationNumber: z.number().optional(),
  stationLabel: z.string().optional(),
  location: z.tuple([z.number(), z.number()]).optional(),
  description: z.string().max(5000).optional(),
  permitsRequired: z.array(z.string()).optional(),
  status: z.string().optional(),
});

export const crossingUpdate = z.object({
  segmentId: z.string().optional(),
  crossingType: z.string().optional(),
  name: z.string().max(500).optional(),
  stationNumber: z.number().optional(),
  stationLabel: z.string().optional(),
  location: z.tuple([z.number(), z.number()]).optional(),
  description: z.string().max(5000).optional(),
  permitsRequired: z.array(z.string()).optional(),
  status: z.string().optional(),
});
