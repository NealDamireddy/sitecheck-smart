/**
 * Block 5 — Inspection records collection endpoint.
 *
 * GET  /api/inspections?projectId=...&status=...   — list inspections
 * POST /api/inspections                            — create a new inspection
 *
 * Backwards-compatible with the legacy POST shape from Block 1
 * (`inspector` + `findings[]` + `overallCompliance`). Block 5 callers can
 * additionally pass `trigger`, `triggerEventId`, `dueBy`, `narrative`, and
 * `missionIds` to create a tracked rain-event / routine inspection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { inspectionCreate } from '@/lib/validations';
import { DEFAULT_PROJECT_ID } from '@/lib/project-context';
import {
  computeComplianceForMissions,
  writeComplianceToInspection,
} from '@/lib/inspection-compliance';

const VALID_TRIGGERS = new Set([
  'manual',
  'routine',
  'rain-event',
  'post-storm',
  'pre-storm',
  'qpe',
]);

const VALID_TYPES = new Set(['routine', 'pre-storm', 'post-storm', 'qpe']);
const VALID_STATUSES = new Set(['draft', 'in-progress', 'submitted', 'archived']);

// ─────────────────────────────────────────────
// Transformers
// ─────────────────────────────────────────────
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
  created_at: string;
  // Block 5 columns (nullable until migration applied)
  trigger?: string | null;
  trigger_event_id?: string | null;
  due_by?: string | null;
  status?: string | null;
  narrative?: string | null;
  ai_overall_compliance?: number | null;
  qsp_overall_compliance?: number | null;
  report_id?: string | null;
  submitted_at?: string | null;
  updated_at?: string | null;
}

function transformInspection(
  row: DbInspectionRow,
  missionIds: string[] = []
) {
  return {
    id: row.id,
    projectId: row.project_id,
    date: row.date,
    type: row.type,
    inspector: row.inspector,
    weather: {
      temperature: row.weather_temperature ?? 0,
      condition: row.weather_condition ?? 'clear',
      windSpeedMph: row.weather_wind_speed_mph ?? 0,
      humidity: row.weather_humidity ?? 0,
    },
    overallCompliance: row.overall_compliance ?? 0,
    missionId: row.mission_id ?? undefined,
    createdAt: row.created_at,
    // Block 5 fields
    trigger: row.trigger ?? 'manual',
    triggerEventId: row.trigger_event_id ?? undefined,
    dueBy: row.due_by ?? undefined,
    status: row.status ?? 'draft',
    narrative: row.narrative ?? undefined,
    aiOverallCompliance: row.ai_overall_compliance ?? undefined,
    qspOverallCompliance: row.qsp_overall_compliance ?? undefined,
    reportId: row.report_id ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    missionIds,
  };
}

interface FindingRow {
  id: number;
  inspection_id: string;
  checkpoint_id: string;
  status: string;
  notes: string;
  created_at: string;
}

function transformFinding(row: FindingRow) {
  return {
    id: row.id,
    inspectionId: row.inspection_id,
    checkpointId: row.checkpoint_id,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function inspectionToSnakeCase(data: Record<string, unknown>) {
  const weather = (data.weather as Record<string, unknown>) || {};
  return {
    id: data.id,
    project_id: data.projectId,
    date: data.date,
    type: data.type,
    inspector: data.inspector,
    weather_temperature: weather.temperature ?? data.weatherTemperature ?? 0,
    weather_condition: weather.condition ?? data.weatherCondition ?? 'clear',
    weather_wind_speed_mph: weather.windSpeedMph ?? data.weatherWindSpeedMph ?? 0,
    weather_humidity: weather.humidity ?? data.weatherHumidity ?? 0,
    overall_compliance: data.overallCompliance ?? 0,
    mission_id: data.missionId ?? null,
    // Block 5 columns — let the caller pass them through
    trigger: data.trigger ?? 'manual',
    trigger_event_id: data.triggerEventId ?? null,
    due_by: data.dueBy ?? null,
    status: data.status ?? 'draft',
    narrative: data.narrative ?? null,
    ai_overall_compliance: data.aiOverallCompliance ?? null,
    qsp_overall_compliance: data.qspOverallCompliance ?? null,
    report_id: data.reportId ?? null,
    submitted_at: data.submittedAt ?? null,
  };
}

function findingToSnakeCase(data: Record<string, unknown>) {
  return {
    inspection_id: data.inspectionId,
    checkpoint_id: data.checkpointId,
    status: data.status,
    notes: data.notes || '',
  };
}

function generateId() {
  return `insp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function generateActivityId() {
  return `act-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ─────────────────────────────────────────────
// GET /api/inspections
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);

    const projectId = searchParams.get('projectId') || DEFAULT_PROJECT_ID;
    const status = searchParams.get('status');

    let query = supabase
      .from('inspections')
      .select('*')
      .eq('project_id', projectId);

    if (status && VALID_STATUSES.has(status)) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('date', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch inspections: ${error.message}`);
    }

    const inspectionRows = (data || []) as DbInspectionRow[];

    if (inspectionRows.length === 0) {
      return NextResponse.json([]);
    }

    // Bulk-resolve linked mission ids
    const inspectionIds = inspectionRows.map((row) => row.id);
    const { data: linkRows } = await supabase
      .from('inspection_missions')
      .select('inspection_id, mission_id')
      .in('inspection_id', inspectionIds);

    const missionIdsByInspection = new Map<string, string[]>();
    for (const link of linkRows ?? []) {
      const inspectionId = link.inspection_id as string;
      const missionId = link.mission_id as string;
      const list = missionIdsByInspection.get(inspectionId) ?? [];
      list.push(missionId);
      missionIdsByInspection.set(inspectionId, list);
    }

    return NextResponse.json(
      inspectionRows.map((row) =>
        transformInspection(row, missionIdsByInspection.get(row.id) ?? [])
      )
    );
  } catch (error: unknown) {
    console.error('Inspections GET error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch inspections';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// POST /api/inspections
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const raw = await request.json();
    const body = inspectionCreate.parse(raw);

    const inspectionId = body.id || generateId();
    const projectId = body.projectId || DEFAULT_PROJECT_ID;
    const trigger = body.trigger && VALID_TRIGGERS.has(body.trigger) ? body.trigger : 'manual';
    const inspectionType = body.type && VALID_TYPES.has(body.type) ? body.type : 'routine';
    const missionIds: string[] = Array.isArray(body.missionIds) ? body.missionIds : [];

    // Pre-compute compliance from any linked missions so the new row has
    // real numbers from the moment it's created.
    const initialCompliance = await computeComplianceForMissions(supabase, missionIds);

    const dbInspection = inspectionToSnakeCase({
      ...body,
      id: inspectionId,
      projectId,
      type: inspectionType,
      trigger,
      missionId: body.missionId ?? missionIds[0] ?? null,
      overallCompliance:
        body.overallCompliance ?? initialCompliance.qspOverallCompliance ?? 0,
      aiOverallCompliance: initialCompliance.aiOverallCompliance,
      qspOverallCompliance: initialCompliance.qspOverallCompliance,
    });

    const { data: inspection, error: inspectionError } = await supabase
      .from('inspections')
      .insert(dbInspection)
      .select()
      .single();

    if (inspectionError) {
      throw new Error(`Failed to create inspection: ${inspectionError.message}`);
    }

    // Insert legacy findings (Block 1 contract) if provided
    let createdFindings: FindingRow[] = [];
    if (body.findings && Array.isArray(body.findings) && body.findings.length > 0) {
      const dbFindings = body.findings.map((finding: Record<string, unknown>) =>
        findingToSnakeCase({
          ...finding,
          inspectionId,
        })
      );

      const { data: findings, error: findingsError } = await supabase
        .from('inspection_findings')
        .insert(dbFindings)
        .select();

      if (findingsError) {
        console.error('Failed to create findings:', findingsError.message);
      } else {
        createdFindings = (findings ?? []) as FindingRow[];
      }
    }

    // Block 5: insert mission link rows
    if (missionIds.length > 0) {
      const linkRows = missionIds.map((missionId) => ({
        id: `link-${inspectionId}-${missionId}`,
        inspection_id: inspectionId,
        mission_id: missionId,
      }));
      const { error: linkError } = await supabase
        .from('inspection_missions')
        .insert(linkRows);
      if (linkError) {
        console.error('Failed to link missions to inspection:', linkError.message);
      }

      // Re-write compliance against the persisted join (in case any inserts failed)
      const reComputed = await computeComplianceForMissions(supabase, missionIds);
      await writeComplianceToInspection(supabase, inspectionId, reComputed);
    }

    // Activity event — choose copy & severity by trigger
    const inspectionTypeLabels: Record<string, string> = {
      routine: 'Routine',
      'pre-storm': 'Pre-Storm',
      'post-storm': 'Post-Storm',
      qpe: 'QPE',
    };
    const typeLabel = inspectionTypeLabels[inspectionType] || inspectionType;

    let activityTitle: string;
    let activityDescription: string;
    let activitySeverity: 'info' | 'warning';

    if (trigger === 'rain-event') {
      activityTitle = 'Rain-Event Inspection Drafted';
      activityDescription = `A rain event triggered a draft inspection${body.dueBy ? ` due by ${new Date(body.dueBy).toLocaleString()}` : ''}.`;
      activitySeverity = 'warning';
    } else if (body.findings && Array.isArray(body.findings)) {
      activityTitle = `${typeLabel} Inspection Completed`;
      activityDescription = `${typeLabel} inspection completed by ${body.inspector ?? 'unknown'}. Overall compliance: ${body.overallCompliance ?? 0}%`;
      activitySeverity = (body.overallCompliance ?? 0) >= 80 ? 'info' : 'warning';
    } else {
      activityTitle = `${typeLabel} Inspection Drafted`;
      activityDescription = `New ${typeLabel.toLowerCase()} inspection drafted${missionIds.length > 0 ? ` covering ${missionIds.length} mission${missionIds.length === 1 ? '' : 's'}` : ''}.`;
      activitySeverity = 'info';
    }

    const activityEvent = {
      id: generateActivityId(),
      project_id: projectId,
      type: 'inspection',
      title: activityTitle,
      description: activityDescription,
      timestamp: new Date().toISOString(),
      severity: activitySeverity,
      linked_entity_id: inspectionId,
      linked_entity_type: 'inspection',
    };

    const { error: activityError } = await supabase
      .from('activity_events')
      .insert(activityEvent);

    if (activityError) {
      console.error('Failed to create activity event:', activityError.message);
    }

    const result = {
      ...transformInspection(inspection as DbInspectionRow, missionIds),
      findings: createdFindings.map(transformFinding),
    };

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Inspections POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create inspection';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
