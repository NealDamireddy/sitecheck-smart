import { z } from 'zod';

const polygonPoint = z.tuple([z.number(), z.number()]);

export const noflyZoneCreate = z.object({
  id: z.string().optional(),
  projectId: z.string().min(1, 'projectId is required'),
  name: z.string().min(1, 'name is required').max(500),
  category: z.string().min(1, 'category is required'),
  polygon: z.array(polygonPoint).min(3, 'polygon must have at least 3 points'),
  floorFeet: z.number().optional(),
  ceilingFeet: z.number().optional(),
  description: z.string().max(5000).optional(),
  source: z.string().optional(),
  active: z.boolean().optional(),
});

export const noflyZoneUpdate = z.object({
  name: z.string().max(500).optional(),
  category: z.string().optional(),
  polygon: z.array(polygonPoint).min(3).optional(),
  floorFeet: z.number().optional(),
  ceilingFeet: z.number().optional(),
  description: z.string().max(5000).optional(),
  source: z.string().optional(),
  active: z.boolean().optional(),
});
