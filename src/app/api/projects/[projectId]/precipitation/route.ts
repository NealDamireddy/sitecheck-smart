/**
 * Precipitation verification for a site — Phase 3.
 *
 * GET  consults every source, records what each said, and reports whether the
 *      rainfall figure rests on a good measurement or needs confirming.
 * POST records the QSP's own rain-gauge reading, which outranks every remote
 *      source and resolves the task.
 *
 * The POST half also fills a hole in the ladder: `site_gauge` is tier 1 and
 * until now there was no way to produce one, so the highest-quality evidence a
 * site can offer was unreachable.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { z, ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { log } from '@/lib/logger';
import { formatZodIssues } from '@/lib/api-error';
import { persistSnapshots, resolvePrecipitation } from '@/lib/qpe/determine';
import { determineQpe, type PrecipReading } from '@/lib/qpe/ladder';

const LOOKBACK_DAYS = 3;
const SITE_GAUGE_PARSER_VERSION = 'site-gauge-manual-v1';

interface ProjectRow {
  id: string;
  center_lat: number | string | null;
  center_lng: number | string | null;
}

/**
 * 0,0 is in the Gulf of Guinea. Treating it as a location is how a site ends
 * up with confidently wrong weather, so it is rejected alongside null.
 */
function coordsOf(project: ProjectRow): { lat: number; lng: number } | null {
  const lat = Number(project.center_lat);
  const lng = Number(project.center_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

async function loadProject(supabase: SupabaseClient, projectId: string) {
  // RLS scopes this to the caller's org, so a miss is indistinguishable from
  // "not yours" — which is the intended behaviour.
  const { data, error } = await supabase
    .from('projects')
    .select('id, center_lat, center_lng')
    .eq('id', projectId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProjectRow;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { supabase } = auth;
  const { projectId } = await params;

  try {
    const project = await loadProject(supabase, projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const coords = coordsOf(project);
    if (!coords) {
      // Refusing is the whole point: guessing a location is what produced a
      // Fresno forecast for a Pleasanton site.
      return NextResponse.json(
        {
          error: 'This site has no usable coordinates, so rainfall cannot be verified.',
          needsCorroboration: true,
          corroborationReason:
            'This site has no location on file. Set the site address so rainfall can be checked.',
        },
        { status: 409 }
      );
    }

    const resolved = await resolvePrecipitation(coords.lat, coords.lng, LOOKBACK_DAYS);

    // Evidence is written even when everything agrees — the record of what
    // each source said is the point, not just the exceptions.
    const persisted = await persistSnapshots(
      supabase,
      projectId,
      coords.lat,
      coords.lng,
      resolved
    );
    if (persisted.error) {
      log.error('Failed to persist precipitation evidence', {
        projectId,
        error: persisted.error,
      });
    }

    const d = resolved.determination;
    return NextResponse.json({
      projectId,
      windowStart: resolved.windowStart,
      windowEnd: resolved.windowEnd,
      totalInches: d?.totalInches ?? null,
      qualifies: d?.qualifies ?? null,
      decidedBy: d?.decidedBy.provider ?? null,
      decidedByDetail: d?.decidedBy.detail ?? null,
      quality: d?.decidedBy.quality ?? null,
      coverage: d?.decidedBy.coverage ?? null,
      otherReadings: d?.otherReadings ?? [],
      disagreement: d?.disagreement ?? [],
      needsCorroboration: d?.needsCorroboration ?? true,
      corroborationReason: resolved.corroborationReason,
      sourcesConsulted: resolved.snapshots.map((s) => ({
        provider: s.provider,
        totalInches: s.totalInches,
        quality: s.quality,
        coverage: s.coverage,
      })),
      evidenceWritten: persisted.written,
    });
  } catch (err) {
    log.error('Precipitation verification failed', { projectId, err });
    return NextResponse.json(
      { error: 'Failed to verify precipitation' },
      { status: 500 }
    );
  }
}

const gaugeReading = z.object({
  totalInches: z
    .number()
    .min(0, 'A rain gauge reading cannot be negative')
    .max(100, 'A reading over 100 inches is almost certainly a typo'),
  windowStart: z.string().datetime({ offset: true }),
  windowEnd: z.string().datetime({ offset: true }),
  note: z.string().trim().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;
  const { projectId } = await params;

  try {
    const body = gaugeReading.parse(await request.json());

    if (Date.parse(body.windowEnd) < Date.parse(body.windowStart)) {
      return NextResponse.json(
        { error: 'windowEnd must be at or after windowStart' },
        { status: 400 }
      );
    }

    const project = await loadProject(supabase, projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const coords = coordsOf(project);
    if (!coords) {
      return NextResponse.json(
        { error: 'This site has no usable coordinates.' },
        { status: 409 }
      );
    }

    const raw = {
      totalInches: body.totalInches,
      windowStart: body.windowStart,
      windowEnd: body.windowEnd,
      note: body.note ?? null,
      enteredBy: user.id,
    };
    const payloadSha256 = createHash('sha256')
      .update(JSON.stringify(raw))
      .digest('hex');

    const { data: inserted, error } = await supabase
      .from('cgp_observation_snapshots')
      .insert({
        id: `obs-site_gauge-${payloadSha256.slice(0, 24)}`,
        project_id: projectId,
        provider: 'site_gauge',
        source_url: null,
        retrieved_at: new Date().toISOString(),
        latitude: coords.lat,
        longitude: coords.lng,
        station_id: null,
        window_start: body.windowStart,
        window_end: body.windowEnd,
        total_inches: body.totalInches,
        coverage: 1,
        quality: 'good',
        raw_payload: raw,
        payload_sha256: payloadSha256,
        parser_version: SITE_GAUGE_PARSER_VERSION,
        // The DB requires this for site_gauge and forbids it otherwise: a
        // person's reading must be attributable, an automated one must not
        // pretend to be.
        recorded_by: user.id,
      })
      .select('id')
      .single();

    if (error) {
      log.error('Failed to record site gauge reading', {
        projectId,
        code: error.code,
      });
      return NextResponse.json(
        { error: 'Failed to record the gauge reading' },
        { status: 500 }
      );
    }

    // Re-resolve with the gauge included so the caller sees the determination
    // its reading just produced. The gauge is tier 1, so it wins unless it is
    // itself unusable.
    const remote = await resolvePrecipitation(coords.lat, coords.lng, LOOKBACK_DAYS);
    const readings: PrecipReading[] = [
      {
        provider: 'site_gauge',
        totalInches: body.totalInches,
        quality: 'good',
        coverage: 1,
        detail: null,
      },
      ...(remote.determination
        ? [remote.determination.decidedBy, ...remote.determination.otherReadings]
        : []),
    ];
    const determination = determineQpe(readings);

    return NextResponse.json(
      {
        snapshotId: inserted.id,
        totalInches: determination?.totalInches ?? body.totalInches,
        qualifies: determination?.qualifies ?? null,
        decidedBy: determination?.decidedBy.provider ?? 'site_gauge',
        disagreement: determination?.disagreement ?? [],
        // A gauge reading that contradicts every remote source is still worth
        // flagging — it is how a mis-keyed decimal point gets caught.
        needsCorroboration: determination?.needsCorroboration ?? false,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: formatZodIssues(err.issues), details: err.issues },
        { status: 400 }
      );
    }
    log.error('Site gauge reading failed', { projectId, err });
    return NextResponse.json(
      { error: 'Failed to record the gauge reading' },
      { status: 500 }
    );
  }
}
