/**
 * Samples — collection endpoint.
 *
 * GET  /api/samples?smartsEventId=...   — list samples for the event,
 *                                          with parameter_results joined.
 * POST /api/samples                     — upsert a sample + its parameter
 *                                          results by (smartsEventId,
 *                                          monitoringLocationId).
 *
 * Upsert semantics on POST:
 *   - Lookup by (smarts_event_id, monitoring_location_id).
 *   - If no row exists, INSERT a new sample with id=body.id or generated.
 *   - If a row exists, KEEP its id, UPDATE its scalar fields, DELETE its
 *     parameter_results, then INSERT the new parameter_results — matching
 *     the inspection → findings non-atomic write pattern in
 *     src/app/api/inspections/route.ts (parent throw, children log-only).
 *
 * Status is always 201 — the contract is "ensure this sample exists with
 * these readings" and 201 covers both the insert and overwrite paths.
 * Clients can detect overwrite via `updatedAt > createdAt` in the response.
 *
 * GET requires `smartsEventId` — samples are scoped per-event and there's
 * no sensible default. Returns 400 if missing.
 *
 * RLS scopes via the denormalized `project_id` on every row.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { sampleCreate } from '@/lib/validations';
import type {
  Sample,
  ParameterResult,
  ParameterName,
  ParameterQualifier,
  AnalyzedBy,
} from '@/types';

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

function generateSampleId(): string {
  return `samp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function generateParameterResultId(): string {
  return `pres-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ──────────────────────────────────────────────────────
// GET /api/samples
// ──────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);
    const smartsEventId = searchParams.get('smartsEventId');

    if (!smartsEventId) {
      return NextResponse.json(
        { error: 'smartsEventId query param is required' },
        { status: 400 }
      );
    }

    // Nested select pulls parameter_results in one round-trip via the
    // sample_id FK relationship.
    const { data, error } = await supabase
      .from('samples')
      .select(
        `
        *,
        parameter_results (*)
      `
      )
      .eq('smarts_event_id', smartsEventId)
      .order('sample_datetime', { ascending: true });

    if (error) throw new Error(error.message);

    const samples = (data ?? []).map((row) => {
      const sampleRow = row as DbSampleRow & {
        parameter_results: DbParameterResultRow[];
      };
      const prs = (sampleRow.parameter_results ?? []).map(transformParameterResult);
      return transformSample(sampleRow, prs);
    });

    return NextResponse.json(samples);
  } catch (err: unknown) {
    console.error('Samples GET error:', err);
    const message = err instanceof Error ? err.message : 'Failed to fetch samples';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────
// POST /api/samples
// ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = sampleCreate.parse(await request.json());

    if (!body.projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }
    const projectId = body.projectId;
    const smartsEventId = body.smartsEventId;
    const monitoringLocationId = body.monitoringLocationId;
    const sampleDatetime = body.sampleDatetime || new Date().toISOString();
    const qspName = body.qspName;

    // 1. Lookup existing sample at this (event, location).
    const { data: existing, error: lookupError } = await supabase
      .from('samples')
      .select('id')
      .eq('smarts_event_id', smartsEventId)
      .eq('monitoring_location_id', monitoringLocationId)
      .maybeSingle();

    // PGRST116 from maybeSingle means "no row" — that's expected on first
    // POST. Anything else is an upstream failure we should surface.
    if (lookupError && lookupError.code !== 'PGRST116') {
      throw new Error(`Upsert lookup failed: ${lookupError.message}`);
    }

    // 2. Insert or update the sample row. Parent throw on failure.
    let upserted: DbSampleRow;
    let sampleId: string;

    if (existing) {
      sampleId = existing.id as string;
      const { data: updated, error: updateError } = await supabase
        .from('samples')
        .update({
          sample_datetime: sampleDatetime,
          qsp_name: qspName,
        })
        .eq('id', sampleId)
        .select()
        .single();
      if (updateError || !updated) {
        throw new Error(
          `Failed to update sample: ${updateError?.message ?? 'no row returned'}`
        );
      }
      upserted = updated as DbSampleRow;
    } else {
      sampleId = body.id || generateSampleId();
      const { data: inserted, error: insertError } = await supabase
        .from('samples')
        .insert({
          id: sampleId,
          project_id: projectId,
          smarts_event_id: smartsEventId,
          monitoring_location_id: monitoringLocationId,
          sample_datetime: sampleDatetime,
          qsp_name: qspName,
        })
        .select()
        .single();
      if (insertError || !inserted) {
        throw new Error(
          `Failed to insert sample: ${insertError?.message ?? 'no row returned'}`
        );
      }
      upserted = inserted as DbSampleRow;
    }

    // 3. Replace parameter_results.
    //
    // Match the inspection→findings pattern: log-but-don't-fail on each
    // step, even if it leaves the response with an empty parameterResults
    // array. The DB UNIQUE(sample_id, parameter) constraint already
    // prevents true duplicates, so worst-case is "no readings recorded
    // this round, client retries."
    let createdResults: DbParameterResultRow[] = [];

    if (body.parameterResults && body.parameterResults.length > 0) {
      // 3a. Delete old (no-op for fresh inserts).
      const { error: delErr } = await supabase
        .from('parameter_results')
        .delete()
        .eq('sample_id', sampleId);
      if (delErr) {
        console.error(
          `Failed to delete old parameter_results for sample ${sampleId}:`,
          delErr.message
        );
      }

      // 3b. Insert new.
      const dbResults = body.parameterResults.map((pr) => ({
        id: generateParameterResultId(),
        project_id: projectId,
        sample_id: sampleId,
        parameter: pr.parameter,
        qualifier: pr.qualifier ?? '=',
        result: pr.result ?? null,
        units: pr.units,
        analytical_method: pr.analyticalMethod,
        mdl: pr.mdl ?? null,
        rl: pr.rl ?? null,
        analyzed_by: pr.analyzedBy ?? 'Self',
      }));
      const { data: insertedResults, error: insertResultsError } = await supabase
        .from('parameter_results')
        .insert(dbResults)
        .select();
      if (insertResultsError) {
        console.error(
          `Failed to insert parameter_results for sample ${sampleId}:`,
          insertResultsError.message
        );
      } else {
        createdResults = (insertedResults ?? []) as DbParameterResultRow[];
      }
    }

    return NextResponse.json(
      transformSample(upserted, createdResults.map(transformParameterResult)),
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error('Samples POST error:', err);
    const message = err instanceof Error ? err.message : 'Failed to create sample';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
