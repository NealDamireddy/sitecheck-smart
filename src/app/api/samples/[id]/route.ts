/**
 * Samples — single-row endpoint.
 *
 * GET    /api/samples/[id]   — fetch one sample + its parameter_results
 * PATCH  /api/samples/[id]   — partial update of sample-level fields only
 * DELETE /api/samples/[id]   — remove (cascades to parameter_results)
 *
 * PATCH explicitly does NOT accept `parameterResults`. The Zod schema
 * `sampleUpdate` excludes it; Zod's default `.parse()` silently strips
 * unknown keys, so a body with `parameterResults: [...]` will have
 * those readings ignored. Update readings via POST /api/samples instead
 * (the upsert flow handles replace-all semantics).
 *
 * DELETE matches the existing pattern (geofences, checkpoints, crossings,
 * nofly-zones, monitoring-locations) — 200 + { success: true }, no 404
 * check on a missing row. CASCADE FK from migration 009 removes any
 * parameter_results children automatically.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { sampleUpdate } from '@/lib/validations';
import type {
  Sample,
  ParameterResult,
  ParameterName,
  ParameterQualifier,
  AnalyzedBy,
} from '@/types';
import { log } from '@/lib/logger';

interface DbSampleRow {
  id: string;
  project_id: string;
  smarts_event_id: string;
  monitoring_location_id: string;
  sample_datetime: string;
  qsp_name: string;
  created_at: string;
  updated_at: string;
}

interface DbParameterResultRow {
  id: string;
  project_id: string;
  sample_id: string;
  parameter: string;
  qualifier: string;
  result: number | null;
  units: string;
  analytical_method: string;
  mdl: number | null;
  rl: number | null;
  analyzed_by: string;
  created_at: string;
  updated_at: string;
}

function transformParameterResult(row: DbParameterResultRow): ParameterResult {
  return {
    id: row.id,
    projectId: row.project_id,
    sampleId: row.sample_id,
    parameter: row.parameter as ParameterName,
    qualifier: row.qualifier as ParameterQualifier,
    result: row.result ?? undefined,
    units: row.units,
    analyticalMethod: row.analytical_method,
    mdl: row.mdl ?? undefined,
    rl: row.rl ?? undefined,
    analyzedBy: row.analyzed_by as AnalyzedBy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function transformSample(
  row: DbSampleRow,
  parameterResults: ParameterResult[] = []
): Sample {
  return {
    id: row.id,
    projectId: row.project_id,
    smartsEventId: row.smarts_event_id,
    monitoringLocationId: row.monitoring_location_id,
    sampleDatetime: row.sample_datetime,
    qspName: row.qsp_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    parameterResults,
  };
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ──────────────────────────────────────────────────────
// GET /api/samples/[id]
// ──────────────────────────────────────────────────────
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const { data, error } = await supabase
      .from('samples')
      .select(
        `
        *,
        parameter_results (*)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Sample not found' },
          { status: 404 }
        );
      }
      throw new Error(error.message);
    }

    const sampleRow = data as DbSampleRow & {
      parameter_results: DbParameterResultRow[];
    };
    const prs = (sampleRow.parameter_results ?? []).map(transformParameterResult);

    return NextResponse.json(transformSample(sampleRow, prs));
  } catch (err: unknown) {
    log.error('Sample GET error', { err });
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to fetch sample' }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────
// PATCH /api/samples/[id]
// ──────────────────────────────────────────────────────
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = sampleUpdate.parse(await request.json());

    const updates: Record<string, unknown> = {};
    if (typeof body.sampleDatetime === 'string') {
      updates.sample_datetime = body.sampleDatetime;
    }
    if (typeof body.qspName === 'string') {
      updates.qsp_name = body.qspName;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('samples')
      .update(updates)
      .eq('id', id)
      .select(
        `
        *,
        parameter_results (*)
      `
      )
      .single();

    if (error || !data) {
      log.error('Sample PATCH failed', { error });
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    const sampleRow = data as DbSampleRow & {
      parameter_results: DbParameterResultRow[];
    };
    const prs = (sampleRow.parameter_results ?? []).map(transformParameterResult);

    return NextResponse.json(transformSample(sampleRow, prs));
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    log.error('Sample PATCH error', { err });
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to update sample' }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────
// DELETE /api/samples/[id]
// ──────────────────────────────────────────────────────
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    // SEC-14: confirm the row is visible to THIS caller before deleting.
    // A bare delete().eq() affects zero rows under RLS when the sample
    // belongs to another tenant — and the old code still answered
    // { success: true }, so a QSP could be told a deletion happened that
    // never did (and a probe could not tell "gone" from "not yours").
    const { data: existing, error: lookupError } = await supabase
      .from('samples')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (lookupError && lookupError.code !== 'PGRST116') {
      log.error('Sample delete lookup failed', { detail: lookupError.message });
      return NextResponse.json({ error: 'Failed to delete sample' }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 });
    }

    const { error } = await supabase.from('samples').delete().eq('id', id);

    if (error) {
      log.error('Failed to delete sample', { detail: error.message });
      return NextResponse.json({ error: 'Failed to delete sample' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    // SEC-09: never echo internal error text to the client.
    log.error('Failed to delete sample', { err });
    return NextResponse.json({ error: 'Failed to delete sample' }, { status: 500 });
  }
}
