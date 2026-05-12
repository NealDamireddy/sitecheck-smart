import { z } from 'zod';

const polygonPoint = z.tuple([z.number(), z.number()]);

export const geofenceCreate = z.object({
  id: z.string().optional(),
  projectId: z.string().min(1, 'projectId is required'),
  name: z.string().min(1, 'name is required').max(500),
  polygon: z.array(polygonPoint).min(3, 'polygon must have at least 3 points'),
  ceilingFeet: z.number().optional(),
  floorFeet: z.number().optional(),
  notes: z.string().max(5000).optional(),
  source: z.string().optional(),
});

export const geofenceUpdate = z.object({
  name: z.string().max(500).optional(),
  polygon: z.array(polygonPoint).min(3).optional(),
  ceilingFeet: z.number().optional(),
  floorFeet: z.number().optional(),
  notes: z.string().max(5000).optional(),
  source: z.string().optional(),
});
