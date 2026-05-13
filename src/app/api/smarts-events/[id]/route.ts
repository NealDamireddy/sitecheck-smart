/**
 * SMARTS events — single-row endpoint.
 *
 * GET    /api/smarts-events/[id]   — fetch one event
 * PATCH  /api/smarts-events/[id]   — partial update; any-status to any-status
 * DELETE /api/smarts-events/[id]   — remove (cascades to samples + parameter_results)
 *
 * No status transition rules (forecast → active → ended → completed) —
 * real-world storms restart, get manually re-opened, etc. If we ever need
 * a state machine, it's a Zod .refine() we can add later.
 *
 * DELETE matches the existing pattern (geofences, checkpoints, crossings,
 * nofly-zones, monitoring-locations, samples) — 200 + { success: true },
 * no 404 check on a missing row. CASCADE FKs from migration 009 remove
 * samples + parameter_results automatically.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { smartsEventUpdate } from '@/lib/validations';
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

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ──────────────────────────────────────────────────────
// GET /api/smarts-events/[id]
// ──────────────────────────────────────────────────────
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const { data, error } = await supabase
      .from('smarts_events')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Smarts event not found' },
          { status: 404 }
        );
      }
      throw new Error(error.message);
    }

    return NextResponse.json(transformSmartsEvent(data as DbSmartsEventRow));
  } catch (err: unknown) {
    console.error('Smarts event GET error:', err);
    const message =
      err instanceof Error ? err.message : 'Failed to fetch smarts event';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────
// PATCH /api/smarts-events/[id]
// ──────────────────────────────────────────────────────
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = smartsEventUpdate.parse(await request.json());

    const updates: Record<string, unknown> = {};
    if (typeof body.status === 'string') updates.status = body.status;
    if (typeof body.startedAt === 'string' || body.startedAt === null) {
      updates.started_at = body.startedAt;
    }
    if (typeof body.endedAt === 'string' || body.endedAt === null) {
      updates.ended_at = body.endedAt;
    }
    if (
      typeof body.precipitationInches === 'number' ||
      body.precipitationInches === null
    ) {
      updates.precipitation_inches = body.precipitationInches;
    }
    if (typeof body.notes === 'string' || body.notes === null) {
      updates.notes = body.notes;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('smarts_events')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      console.error('Smarts event PATCH failed:', error);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    return NextResponse.json(transformSmartsEvent(data as DbSmartsEventRow));
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error('Smarts event PATCH error:', err);
    const message =
      err instanceof Error ? err.message : 'Failed to update smarts event';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────
// DELETE /api/smarts-events/[id]
// ──────────────────────────────────────────────────────
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const { error } = await supabase.from('smarts_events').delete().eq('id', id);

    if (error) {
      return NextResponse.json(
        { error: `Failed to delete smarts event: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: `Failed to delete smarts event: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      },
      { status: 500 }
    );
  }
}
