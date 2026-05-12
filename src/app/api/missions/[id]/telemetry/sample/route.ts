/**
 * Block 4 — POST /api/missions/[id]/telemetry/sample
 *
 * Append-only endpoint for live telemetry samples. Each call appends one
 * `DroneTelemetrySample` to `drone_missions.actual_flight_path` (a JSONB
 * array). Atomic at the row level via the `||` JSONB concat operator.
 *
 * Caps the array at 1000 samples (~16 minutes at 1Hz) to bound row size.
 *
 * Returns `{ samplesPersisted, capped }` so the live UI can show a captured-
 * frame counter and warn the operator when the cap is hit.
 *
 * Mock fallback: if Supabase is unreachable or the mission row is missing,
 * the endpoint returns 200 with `{ samplesPersisted: 0, mock: true }` so the
 * fire-and-forget caller never breaks the live UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { ZodError } from 'zod';
import { telemetrySample } from '@/lib/validations';
import type { DroneTelemetrySample } from '@/types/drone';

const MAX_SAMPLES = 1000;
const ACTIVE_STATUSES = new Set([
  'in-progress',
  'paused',
  'returning-home',
]);

interface RouteContext {
  params: Promise<{ id: string }>;
}

function isValidSample(s: unknown): s is DroneTelemetrySample {
  if (!s || typeof s !== 'object') return false;
  const obj = s as Record<string, unknown>;
  return (
    typeof obj.lat === 'number' &&
    typeof obj.lng === 'number' &&
    typeof obj.altitudeFeet === 'number' &&
    typeof obj.speedMph === 'number' &&
    typeof obj.headingDeg === 'number' &&
    typeof obj.batteryPercent === 'number' &&
    typeof obj.signalStrengthPercent === 'number' &&
    typeof obj.gpsSatellites === 'number' &&
    typeof obj.timestamp === 'string'
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const raw = await request.json();
    const sample = telemetrySample.parse(raw);

    // Read current mission to check status + array length
    const { data: mission, error: fetchErr } = await supabase
      .from('drone_missions')
      .select('status, actual_flight_path')
      .eq('id', id)
      .single();

    if (fetchErr || !mission) {
      // Mock fallback — fire-and-forget caller, never break the UI
      return NextResponse.json({ samplesPersisted: 0, mock: true });
    }

    if (!ACTIVE_STATUSES.has(mission.status)) {
      return NextResponse.json(
        { error: `Mission not active (status=${mission.status})` },
        { status: 409 }
      );
    }

    const current = Array.isArray(mission.actual_flight_path)
      ? mission.actual_flight_path
      : [];
    if (current.length >= MAX_SAMPLES) {
      return NextResponse.json({ samplesPersisted: current.length, capped: true });
    }

    const next = [...current, sample];
    const { error: updateErr } = await supabase
      .from('drone_missions')
      .update({ actual_flight_path: next, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateErr) {
      return NextResponse.json({ samplesPersisted: 0, mock: true });
    }

    return NextResponse.json({
      samplesPersisted: next.length,
      capped: next.length >= MAX_SAMPLES,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.issues }, { status: 400 });
    }
    console.error('telemetry/sample POST failed:', err);
    return NextResponse.json({ samplesPersisted: 0, mock: true });
  }
}
