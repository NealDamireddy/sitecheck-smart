import { z } from 'zod';

const STATUSES = ['active', 'inactive'] as const;

/**
 * Mirrors the DB CHECK constraint added in migration 010 and the
 * DischargePointType union in src/types/monitoring-location.ts.
 * Keep all three in sync.
 */
const DISCHARGE_POINT_TYPES = [
  'Effluent',
  'Infiltration-Groundwater',
  'Influent',
  'Internal',
  'Receiving Water',
] as const;

export const monitoringLocationCreate = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  // SMARTS caps monitoring location names at 25 characters — a longer
  // name is rejected at the portal, so reject it at entry instead.
  name: z.string().min(1, 'name is required').max(25, 'SMARTS limits location names to 25 characters'),
  drainageArea: z.string().min(1, 'drainageArea is required').max(200),
  dischargePointType: z.enum(DISCHARGE_POINT_TYPES),
  isAts: z.boolean().optional(),
  isPassiveTreatment: z.boolean().optional(),
  description: z.string().max(2000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  status: z.enum(STATUSES).optional(),
});

export const monitoringLocationUpdate = z.object({
  name: z.string().min(1).max(25, 'SMARTS limits location names to 25 characters').optional(),
  drainageArea: z.string().min(1).max(200).optional(),
  dischargePointType: z.enum(DISCHARGE_POINT_TYPES).optional(),
  isAts: z.boolean().optional(),
  isPassiveTreatment: z.boolean().optional(),
  description: z.string().max(2000).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  status: z.enum(STATUSES).optional(),
});
