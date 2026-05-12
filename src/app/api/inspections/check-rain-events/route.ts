/**
 * Block 5 — Idempotent rain-event check.
 *
 * POST /api/inspections/check-rain-events
 * Body: { projectId }
 *
 * 1. Calls `detectRainEventForProject` to see if there's a qualifying
 *    QPE event for this project in the last 7 days.
 * 2. If there is, looks for an existing inspection with
 *    `trigger='rain-event' AND trigger_event_id = event.id`.
 * 3. If none exists, auto-creates a draft inspection with
 *    `due_by = event.inspectionDueBy`.
 * 4. Returns `{ rainEvent, inspection } | { rainEvent: null, inspection: null }`.
 *
 * Safe to call on every dashboard mount — the `(trigger, trigger_event_id)`
 * dedupe makes it a no-op once the draft exists.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { checkRainEvents } from '@/lib/validations';
import { DEFAULT_PROJECT_ID } from '@/lib/project-context';
import { detectRainEventForProject } from '@/lib/rain-event-detector';

interface DbInspectionRow {
  id: string;
  project_id: string;
  date: string;
  type: string;
  inspector: string;
  weather_temperature: number | null;
  weather_condition: string | null;
  weather_wind_speed_mph: number | null;
  weather_humidity: number | null;
  overall_compliance: number | null;
  mission_id: string | null;
  trigger?: string | null;
  trigger_event_id?: string | null;
  due_by?: string | null;
  status?: string | null;
  narrative?: string | null;
  ai_overall_compliance?: number | null;
  qsp_overall_compliance?: number | null;
  report_id?: string | null;
  submitted_at?: string | null;
  created_at: string;
  updated_at?: string | null;
}

function transformInspection(row: DbInspectionRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    date: row.date,
    type: row.type,
    inspector: row.inspector,
    overallCompliance: row.overall_compliance ?? 0,
    trigger: row.trigger ?? 'manual',
    triggerEventId: row.trigger_event_id ?? undefined,
    dueBy: row.due_by ?? undefined,
    status: row.status ?? 'draft',
    narrative: row.narrative ?? undefined,
    aiOverallCompliance: row.ai_overall_compliance ?? undefined,
    qspOverallCompliance: row.qsp_overall_compliance ?? undefined,
    reportId: row.report_id ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    missionIds: [],
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    let rawBody = {};
    try { rawBody = await request.json(); } catch { /* empty body ok */ }
    const body = checkRainEvents.parse(rawBody);
    const projectId = (body?.projectId as string) || DEFAULT_PROJECT_ID;

    const rainEvent = await detectRainEventForProject(projectId);
    if (!rainEvent) {
      return NextResponse.json({ rainEvent: null, inspection: null });
    }

    // Idempotent lookup — same project, same trigger event id
    const { data: existing, error: existingError } = await supabase
      .from('inspections')
      .select('*')
      .eq('project_id', projectId)
      .eq('trigger', 'rain-event')
      .eq('trigger_event_id', rainEvent.id)
      .maybeSingle();

    if (existingError && existingError.code !== 'PGRST116') {
      console.error('check-rain-events lookup failed:', existingError);
    }

    if (existing) {
      return NextResponse.json({
        rainEvent,
        inspection: transformInspection(existing as DbInspectionRow),
      });
    }

    // No existing draft — create one
    const id = `insp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const insertRow = {
      id,
      project_id: projectId,
      date: now,
      type: 'post-storm',
      inspector: '',
      weather_temperature: 0,
      weather_condition: 'rain',
      weather_wind_speed_mph: 0,
      weather_humidity: 0,
      overall_compliance: 0,
      mission_id: null,
      trigger: 'rain-event',
      trigger_event_id: rainEvent.id,
      due_by: rainEvent.inspectionDueBy,
      status: 'draft',
      narrative: `Auto-drafted after ${rainEvent.totalPrecipitationInches.toFixed(2)}" of precipitation starting ${new Date(rainEvent.startedAt).toLocaleDateString()}. Inspection must be completed by ${new Date(rainEvent.inspectionDueBy).toLocaleString()} to satisfy CGP 2022 post-storm reporting.`,
      ai_overall_compliance: null,
      qsp_overall_compliance: null,
      report_id: null,
      submitted_at: null,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('inspections')
      .insert(insertRow)
      .select()
      .single();

    if (insertError || !inserted) {
      console.error('check-rain-events insert failed:', insertError);
      // Mock fallback — return what we would have created
      return NextResponse.json({
        rainEvent,
        inspection: transformInspection(insertRow as DbInspectionRow),
      });
    }

    // Activity event
    await supabase.from('activity_events').insert({
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      project_id: projectId,
      type: 'inspection',
      title: 'Rain-Event Inspection Drafted',
      description: `${rainEvent.totalPrecipitationInches.toFixed(2)}" of precipitation triggered a draft inspection. Due by ${new Date(rainEvent.inspectionDueBy).toLocaleString()}.`,
      timestamp: now,
      severity: 'warning',
      linked_entity_id: id,
      linked_entity_type: 'inspection',
    });

    return NextResponse.json({
      rainEvent,
      inspection: transformInspection(inserted as DbInspectionRow),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error('check-rain-events unexpected error:', err);
    return NextResponse.json({ rainEvent: null, inspection: null });
  }
}
