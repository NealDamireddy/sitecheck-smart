/**
 * Pre-storm cron — scheduled via vercel.json.
 *
 * Every 30 minutes Vercel hits this endpoint. For every active project
 * we pull a fresh NOAA forecast, check whether the next 48 h has a
 * qualifying probability of precipitation, and on the first detection
 * within a 24-hour window we:
 *
 *   1. Insert a `smarts_events` row with status='forecast', source='noaa'.
 *   2. Insert a `notifications` row so the QSP sees a bell-icon alert
 *      next time they load the app.
 *
 * Idempotency: we only create one forecast event per project per
 * 24-hour window. If Vercel runs us 48 times in a day, only the first
 * detection sticks; the rest are no-ops. A new storm system 24 h later
 * gets its own event.
 *
 * Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`. The
 * handler rejects anything else with 401 so this endpoint isn't a free
 * "spam my SMARTS events" button on the internet.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { detectPreStormForCoords } from '@/lib/pre-storm-detector';

/** Window during which a fresh detection is suppressed as a dupe. */
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

interface DbActiveProjectRow {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
}

interface ProjectOutcome {
  projectId: string;
  name: string;
  detected: boolean;
  created: boolean;
  reason?: string;
  forecastDate?: string;
  peakPop?: number;
}

function generateSmartsEventId(): string {
  return `smarts-evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function generateNotificationId(): string {
  return `notif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

async function processProject(
  supabase: ReturnType<typeof createAdminClient>,
  project: DbActiveProjectRow
): Promise<ProjectOutcome> {
  const base: ProjectOutcome = {
    projectId: project.id,
    name: project.name,
    detected: false,
    created: false,
  };

  let detection;
  try {
    detection = await detectPreStormForCoords(
      Number(project.center_lat),
      Number(project.center_lng)
    );
  } catch (err) {
    return {
      ...base,
      reason: `noaa-error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!detection) {
    return { ...base, reason: 'clear' };
  }

  base.detected = true;
  base.forecastDate = detection.forecastDate;
  base.peakPop = detection.peakPop;

  // Idempotency check — suppress duplicate forecast events created
  // inside the same dedupe window.
  const cutoffIso = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const { data: recent, error: lookupError } = await supabase
    .from('smarts_events')
    .select('id')
    .eq('project_id', project.id)
    .eq('status', 'forecast')
    .eq('source', 'noaa')
    .gte('forecast_detected_at', cutoffIso)
    .limit(1)
    .maybeSingle();

  if (lookupError && lookupError.code !== 'PGRST116') {
    return { ...base, reason: `lookup-error: ${lookupError.message}` };
  }

  if (recent) {
    return { ...base, reason: 'already-notified' };
  }

  const nowIso = new Date().toISOString();
  const eventId = generateSmartsEventId();
  const expectedPrecip = detection.expectedPrecipitationInches;
  const notes = `Auto-detected from NOAA forecast: ${detection.peakPop}% PoP on ${detection.forecastDate}, ${expectedPrecip.toFixed(2)}" expected.`;

  const { error: insertEventError } = await supabase
    .from('smarts_events')
    .insert({
      id: eventId,
      project_id: project.id,
      status: 'forecast',
      source: 'noaa',
      forecast_detected_at: nowIso,
      precipitation_inches: expectedPrecip > 0 ? expectedPrecip : null,
      notes,
    });

  if (insertEventError) {
    return { ...base, reason: `event-insert-error: ${insertEventError.message}` };
  }

  const { error: insertNotifError } = await supabase
    .from('notifications')
    .insert({
      id: generateNotificationId(),
      project_id: project.id,
      type: 'alert',
      title: 'Pre-Storm Forecast Detected',
      message: `NOAA forecast shows ${detection.peakPop}% chance of rain on ${detection.forecastDate} (${expectedPrecip.toFixed(2)}" expected). Pre-storm inspection required within 48 hours.`,
      timestamp: nowIso,
      read: false,
      link: '/weather',
    });

  if (insertNotifError) {
    // Event already created — don't undo it, just surface the warn.
    return {
      ...base,
      created: true,
      reason: `notification-error: ${insertNotifError.message}`,
    };
  }

  return { ...base, created: true };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured on the server' },
      { status: 500 }
    );
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, name, center_lat, center_lng')
    .eq('status', 'active');

  if (projectsError) {
    return NextResponse.json(
      { error: `Failed to list projects: ${projectsError.message}` },
      { status: 500 }
    );
  }

  const rows = (projects ?? []) as DbActiveProjectRow[];

  // Sequential — keeps memory low and avoids hammering the OpenWeatherMap
  // free tier rate limit (60/min). Per-project work is cheap (~1 fetch +
  // 2 inserts) so the cron should finish well inside Vercel's 60s limit
  // for hundreds of sites.
  const outcomes: ProjectOutcome[] = [];
  for (const project of rows) {
    outcomes.push(await processProject(supabase, project));
  }

  const summary = {
    runAt: new Date().toISOString(),
    checked: outcomes.length,
    detected: outcomes.filter((o) => o.detected).length,
    created: outcomes.filter((o) => o.created).length,
    skippedAsDupe: outcomes.filter((o) => o.reason === 'already-notified').length,
    errors: outcomes.filter((o) => o.reason?.includes('error')).length,
    projects: outcomes,
  };

  return NextResponse.json(summary);
}
