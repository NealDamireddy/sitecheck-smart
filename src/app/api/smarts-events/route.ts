/**
 * SMARTS events — collection endpoint.
 *
 * GET  /api/smarts-events?projectId=...&status=...   — list
 * POST /api/smarts-events                            — manual create
 *
 * For the demo "Simulate rain" buttons, use POST /api/smarts-events/simulate
 * instead. This route is the general-purpose manual create — e.g. when the
 * NOAA detector promotes a real forecast into a persisted event.
 *
 * RLS scopes by project_id. `?projectId` falls back to DEFAULT_PROJECT_ID
 * to match the rest of the API; `?status` is an optional filter (must be
 * one of the four valid values, otherwise silently ignored).
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { smartsEventCreate } from '@/lib/validations';
import { DEFAULT_PROJECT_ID } from '@/lib/project-context';
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

const VALID_STATUSES = new Set<SmartsEventStatus>([
  'forecast',
  'active',
  'ended',
  'completed',
]);

// ──────────────────────────────────────────────────────
// GET /api/smarts-events
// ──────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId') || DEFAULT_PROJECT_ID;
    const status = searchParams.get('status');

    let query = supabase
      .from('smarts_events')
      .select('*')
      .eq('project_id', projectId)
      .order('forecast_detected_at', { ascending: false });

    if (status && VALID_STATUSES.has(status as SmartsEventStatus)) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as DbSmartsEventRow[];
    return NextResponse.json(rows.map(transformSmartsEvent));
  } catch (err: unknown) {
    console.error('Smarts events GET error:', err);
    const message =
      err instanceof Error ? err.message : 'Failed to fetch smarts events';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────
// POST /api/smarts-events
// ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = smartsEventCreate.parse(await request.json());

    const insertRow = {
      id: body.id || generateId(),
      project_id: body.projectId || DEFAULT_PROJECT_ID,
      status: body.status ?? 'forecast',
      source: body.source ?? 'noaa',
      forecast_detected_at: body.forecastDetectedAt ?? new Date().toISOString(),
      started_at: body.startedAt ?? null,
      ended_at: body.endedAt ?? null,
      precipitation_inches: body.precipitationInches ?? null,
      notes: body.notes ?? null,
    };

    const { data, error } = await supabase
      .from('smarts_events')
      .insert(insertRow)
      .select()
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? 'Insert returned no row');
    }

    return NextResponse.json(
      transformSmartsEvent(data as DbSmartsEventRow),
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error('Smarts events POST error:', err);
    const message =
      err instanceof Error ? err.message : 'Failed to create smarts event';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
