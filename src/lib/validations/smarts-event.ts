import { z } from 'zod';

const STATUSES = ['forecast', 'active', 'ended', 'completed'] as const;
// Inspector uploads must use the atomic site-record RPC; this legacy endpoint
// remains limited to NOAA and deliberate demo simulations.
const SOURCES = ['noaa', 'simulated'] as const;
const SIMULATE_MODES = ['forecast', 'starting'] as const;

export const smartsEventCreate = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  status: z.enum(STATUSES).optional(),
  source: z.enum(SOURCES).optional(),
  forecastDetectedAt: z.string().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  precipitationInches: z.number().min(0).max(50).optional(),
  notes: z.string().max(10000).optional(),
});

export const smartsEventUpdate = z.object({
  status: z.enum(STATUSES).optional(),
  startedAt: z.string().nullable().optional(),
  endedAt: z.string().nullable().optional(),
  precipitationInches: z.number().min(0).max(50).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
});

/**
 * Demo / dashboard "Simulate rain" buttons.
 *   mode='forecast' → create a row with status='forecast'
 *   mode='starting' → create a row with status='active' + started_at=now()
 * Persists a real smarts_events row with source='simulated' so the rest
 * of the capture → review → export flow can run end-to-end in demo mode.
 */
export const smartsEventSimulate = z.object({
  projectId: z.string().optional(),
  mode: z.enum(SIMULATE_MODES),
});
