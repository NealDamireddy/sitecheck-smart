/**
 * Block 4 — POST /api/missions/[id]/complete
 *
 * Closes a mission. Body (optional): `{ trigger?: 'auto' | 'manual' }`.
 *
 * 1. Sets `status = 'completed'`, `completed_at = NOW()`, derives
 *    `total_flight_seconds` from the first/last sample timestamps.
 * 2. Reads all captured waypoints with at least one photo.
 * 3. For each captured waypoint that doesn't already have a row in
 *    `mission_ai_analyses`, runs `analyzeBmpPhoto` server-side and persists
 *    the result. Failures are caught per-waypoint — completion still succeeds.
 * 4. Logs a `mission_completed` activity event.
 * 5. Returns the updated mission with `actualFlightPath`, `completedAt`,
 *    `totalFlightSeconds`.
 *
 * Idempotent: re-running on an already-completed mission re-runs missing
 * analyses but does not re-flip status or create duplicate activity events.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { ZodError } from 'zod';
import { missionComplete } from '@/lib/validations';
import { analyzeBmpPhoto, mockAnalyzeBmpPhoto } from '@/lib/ai-vision';
import type { CheckpointStatus } from '@/types/checkpoint';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface CompleteBody {
  trigger?: 'auto' | 'manual';
}

interface SampleRow {
  timestamp?: string;
}

function totalFlightSeconds(samples: SampleRow[]): number {
  if (samples.length < 2) return 0;
  const first = samples[0]?.timestamp;
  const last = samples[samples.length - 1]?.timestamp;
  if (!first || !last) return 0;
  return Math.max(0, Math.round((new Date(last).getTime() - new Date(first).getTime()) / 1000));
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: missionId } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    let rawBody: unknown = undefined;
    try {
      rawBody = await request.json();
    } catch {
      // empty body OK
    }
    const body: CompleteBody = missionComplete.parse(rawBody) ?? {};
    const trigger = body.trigger ?? 'manual';

    // Load mission
    const { data: mission, error: missionErr } = await supabase
      .from('drone_missions')
      .select('*')
      .eq('id', missionId)
      .single();

    if (missionErr || !mission) {
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
    }

    const wasAlreadyComplete = mission.status === 'completed';

    // Derive completion fields from the persisted track (if any)
    const samples: SampleRow[] = Array.isArray(mission.actual_flight_path)
      ? (mission.actual_flight_path as SampleRow[])
      : [];
    const flightSeconds = totalFlightSeconds(samples);

    if (!wasAlreadyComplete) {
      const { error: updateErr } = await supabase
        .from('drone_missions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          total_flight_seconds: flightSeconds,
          updated_at: new Date().toISOString(),
        })
        .eq('id', missionId);

      if (updateErr) {
        console.error('Mission completion update failed:', updateErr);
        return NextResponse.json({ error: 'Failed to complete mission' }, { status: 500 });
      }

      // Activity event
      const activityEvent = {
        id: `activity-${Date.now()}`,
        project_id: mission.project_id,
        type: 'drone',
        title: 'Mission Completed',
        description: `Mission "${mission.name}" was completed (${trigger})`,
        timestamp: new Date().toISOString(),
        severity: 'info',
        linked_entity_id: missionId,
        linked_entity_type: 'mission',
        metadata: {
          action: 'mission_completed',
          missionId,
          trigger,
          totalFlightSeconds: flightSeconds,
          sampleCount: samples.length,
        },
      };
      await supabase.from('activity_events').insert(activityEvent);
    }

    // Fan out AI analysis for captured waypoints that don't have one yet
    const { data: waypoints } = await supabase
      .from('waypoints')
      .select('*')
      .eq('mission_id', missionId)
      .eq('capture_status', 'captured');

    const captured = (waypoints ?? []).filter((w) => {
      const photos = Array.isArray(w.photos) ? w.photos : [];
      return photos.length > 0 || !!w.photo;
    });

    if (captured.length > 0) {
      const { data: existingAnalyses } = await supabase
        .from('mission_ai_analyses')
        .select('waypoint_number')
        .eq('mission_id', missionId);

      const haveSet = new Set(
        (existingAnalyses ?? []).map((a) => a.waypoint_number as number)
      );

      const toAnalyze = captured.filter((w) => !haveSet.has(w.number));

      // Look up checkpoint metadata in one query for the analysis prompts
      const checkpointIds = Array.from(new Set(toAnalyze.map((w) => w.checkpoint_id)));
      const { data: checkpoints } = await supabase
        .from('checkpoints')
        .select('*')
        .in('id', checkpointIds);
      const cpMap = new Map((checkpoints ?? []).map((c) => [c.id, c]));

      for (const wp of toAnalyze) {
        try {
          const cp = cpMap.get(wp.checkpoint_id);
          if (!cp) continue;

          const photos = Array.isArray(wp.photos) ? wp.photos : [];
          const photoUrl: string = photos[photos.length - 1] ?? wp.photo;
          if (!photoUrl) continue;

          const input = {
            photoUrl,
            checkpointId: cp.id as string,
            checkpointName: (cp.name as string) ?? 'Unknown checkpoint',
            bmpCategory: (cp.bmp_type as string) ?? 'general',
            cgpSection: (cp.cgp_section as string) ?? '',
            currentStatus: ((cp.status as CheckpointStatus) ?? 'needs-review'),
          };

          let result;
          try {
            result = await analyzeBmpPhoto(input);
          } catch (err) {
            console.warn(
              `Vision failed for waypoint ${wp.number}, falling back to mock:`,
              err
            );
            result = mockAnalyzeBmpPhoto(input);
          }

          const id = `aia-${missionId}-${wp.number}`;
          await supabase.from('mission_ai_analyses').upsert(
            {
              id,
              mission_id: missionId,
              waypoint_number: wp.number,
              checkpoint_id: cp.id,
              photo_url: photoUrl,
              summary: result.summary,
              status: result.status,
              confidence: Math.max(0, Math.min(100, Math.round(result.confidence))),
              details: result.details,
              cgp_reference: result.cgpReference,
              recommendations: result.recommendations,
              model: result.model,
              raw_response: result.rawResponse as object | null,
              created_at: new Date().toISOString(),
            },
            { onConflict: 'mission_id,waypoint_number' }
          );
        } catch (err) {
          console.error(`Per-waypoint analysis failed for #${wp.number}:`, err);
        }
      }
    }

    // Re-fetch mission to return the post-update state
    const { data: refreshed } = await supabase
      .from('drone_missions')
      .select('*')
      .eq('id', missionId)
      .single();

    return NextResponse.json({
      id: missionId,
      status: refreshed?.status ?? 'completed',
      completedAt: refreshed?.completed_at ?? null,
      totalFlightSeconds: refreshed?.total_flight_seconds ?? flightSeconds,
      actualFlightPath: Array.isArray(refreshed?.actual_flight_path)
        ? refreshed?.actual_flight_path
        : [],
      analyzedWaypoints: captured.length,
      trigger,
      wasAlreadyComplete,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.issues }, { status: 400 });
    }
    console.error('complete POST failed:', err);
    return NextResponse.json({ error: 'Complete failed' }, { status: 500 });
  }
}
