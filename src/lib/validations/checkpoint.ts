import { z } from 'zod';
import { DB_BMP_TYPES } from '@/lib/cgp/bmp-types';

const linearRef = z.object({
  station: z.number(),
  offset: z.number().optional(),
  segmentId: z.string().optional(),
}).optional();

export const checkpointCreate = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  name: z.string().min(1).max(500),
  // DRF-01: was z.string().max(200), which accepted arbitrary text and
  // deferred the failure to the database. Constrained to exactly what the
  // CHECK constraint allows.
  bmpType: z.enum(DB_BMP_TYPES),
  status: z.string().optional(),
  // DB column is `priority TEXT NOT NULL CHECK (priority IN ('high','medium','low'))`.
  // Schema previously typed this as z.number() which mismatched both the
  // DB and the runtime Priority union.
  priority: z.enum(['high', 'medium', 'low']).optional(),
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
