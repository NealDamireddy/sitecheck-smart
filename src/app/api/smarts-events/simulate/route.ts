/**
 * POST /api/smarts-events/simulate
 *
 * Demo-mode endpoint for the dashboard "Simulate rain forecast" and
 * "Simulate rain starting" buttons. Persists a real `smarts_events` row
 * with `source='simulated'` so the full capture → review → export flow
 * works end-to-end without waiting for an actual storm.
 *
 * ──────────────────────────────────────────────────────
 *   IMPORTANT CONSTRAINTS — read before modifying.
 * ──────────────────────────────────────────────────────
 *   1. This route ONLY INSERTS. It never updates or deletes any
 *      existing smarts_events row. A future "reset simulation" mode
 *      that wipes simulated rows must NOT be bolted onto this handler
 *      — it gets its own endpoint with its own semantics. The point
 *      is so that the demo can never accidentally clobber real data.
 *   2. `source='simulated'` is hardcoded. It is NEVER read from the
 *      request body, and the body schema doesn't accept it. There is
 *      no path through this handler that writes source='noaa'.
 *
 * Body: { projectId?: string, mode: 'forecast' | 'starting' }
 *
 * mode='forecast' writes:
 *   status='forecast', source='simulated',
 *   started_at=null, precipitation_inches=0.7 (fixed demo value)
 *
 *   Predicted-start time is intentionally NOT stored in a column — the
 *   dashboard derives it as `forecast_detected_at + 48h` (the standard
 *   pre-storm inspection window). See the architectural notes in the
 *   step-8 build for rationale (Option A: use existing columns; the
 *   alternative was a migration 011 adding predicted_start /
 *   predicted_precipitation_inches / actual_precipitation_inches).
 *
 * mode='starting' writes:
 *   status='active', source='simulated',
 *   started_at=NOW(), precipitation_inches=null
 *
 * Returns 201 + transformed row.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { smartsEventSimulate } from '@/lib/validations';
import type { SmartsEvent, SmartsEventStatus, SmartsEventSource } from '@/types';

interface DbSmartsEventRow {
  id: string;
  project_id: string;
  status: string;
  source: string;
  forecast_detected_at: string;
  started_at: string | null;
  ended_at: string | null;
  precipitation_inches: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function transformSmartsEvent(row: DbSmartsEventRow): SmartsEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status as SmartsEventStatus,
    source: row.source as SmartsEventSource,
    forecastDetectedAt: row.forecast_detected_at,
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
    precipitationInches: row.precipitation_inches ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generateId(): string {
  return `smarts-evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Demo precipitation value used for `mode='forecast'`. Kept here as a
 * named constant so the verification script (scripts/test-smarts-events.ts)
 * doesn't drift from this value — if you change it, change the test too.
 */
const SIMULATED_FORECAST_PRECIP_INCHES = 0.7;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = smartsEventSimulate.parse(await request.json());

    if (!body.projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }
    const projectId = body.projectId;
    const now = new Date().toISOString();

    // Hardcoded — never read from the request body.
    const source: SmartsEventSource = 'simulated';

    let insertRow: {
      id: string;
      project_id: string;
      status: SmartsEventStatus;
      source: SmartsEventSource;
      forecast_detected_at: string;
      started_at: string | null;
      precipitation_inches: number | null;
    };

    if (body.mode === 'forecast') {
      insertRow = {
        id: generateId(),
        project_id: projectId,
        status: 'forecast',
        source,
        forecast_detected_at: now,
        started_at: null,
        precipitation_inches: SIMULATED_FORECAST_PRECIP_INCHES,
      };
    } else {
      // mode === 'starting' — Zod enum guarantees no other value reaches here.
      insertRow = {
        id: generateId(),
        project_id: projectId,
        status: 'active',
        source,
        forecast_detected_at: now,
        started_at: now,
        precipitation_inches: null,
      };
    }

    const { data, error } = await supabase
      .from('smarts_events')
      .insert(insertRow)
      .select()
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? 'Simulate insert returned no row');
    }

    return NextResponse.json(
      transformSmartsEvent(data as DbSmartsEventRow),
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error('Smarts events simulate error:', err);
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to simulate smarts event' }, { status: 500 });
  }
}
