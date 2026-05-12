import { z } from 'zod';

const linearRef = z.object({
  station: z.number(),
  offset: z.number().optional(),
  segmentId: z.string().optional(),
}).optional();

export const checkpointCreate = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  name: z.string().min(1).max(500),
  bmpType: z.string().min(1).max(200),
  status: z.string().optional(),
  priority: z.number().optional(),
  zone: z.string().optional(),
  description: z.string().max(5000).optional(),
  cgpSection: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  lastInspectionDate: z.string().optional(),
  lastInspectionPhoto: z.string().optional(),
  previousPhoto: z.string().optional(),
  installDate: z.string().optional(),
  swpppPage: z.string().optional(),
  linearRef,
  stationNumber: z.number().optional(),
  stationOffsetFeet: z.number().optional(),
  segmentId: z.string().optional(),
  stationLabel: z.string().optional(),
});

export const checkpointUpdate = checkpointCreate.partial();

export const checkpointBulk = z.object({
  checkpoints: z.array(checkpointCreate).min(1, 'At least one checkpoint required'),
  projectId: z.string().optional(),
});
