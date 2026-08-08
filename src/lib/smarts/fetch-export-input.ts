/**
 * Server-side assembly of a SmartsExportInput for one smarts event.
 *
 * Extracted from /api/smarts-events/[id]/export so every SMARTS output
 * path — the Excel data-entry aid, the bot-format CSV download, and the
 * Sync-to-SMARTS bot launch — reads the exact same joined view of
 * smarts_events / projects / monitoring_locations / samples
 * (+ parameter_results). The caller passes the RLS-scoped Supabase
 * client from requireAuth, so row access stays per-user.
 */

import type { createAuthClient } from '@/lib/supabase/server';
import type {
  AnalyzedBy,
  DischargePointType,
  MonitoringLocation,
  ParameterName,
  ParameterQualifier,
  Sample,
  SmartsEvent,
  SmartsEventSource,
  SmartsEventStatus,
} from '@/types';
import type { SmartsExportInput } from '@/lib/smarts/types';

type AuthedSupabase = Awaited<ReturnType<typeof createAuthClient>>;

export type FetchExportInputResult =
  | { ok: true; input: SmartsExportInput; event: SmartsEvent }
  | { ok: false; status: 404 | 500; error: string };

function transformEvent(row: Record<string, unknown>): SmartsEvent {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    status: row.status as SmartsEventStatus,
    source: row.source as SmartsEventSource,
    forecastDetectedAt: row.forecast_detected_at as string,
    startedAt: (row.started_at as string | null) ?? undefined,
    endedAt: (row.ended_at as string | null) ?? undefined,
    precipitationInches:
      row.precipitation_inches == null
        ? undefined
        : Number(row.precipitation_inches),
    notes: (row.notes as string | null) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

interface DbMonitoringLocationRow {
  id: string;
  project_id: string;
  name: string;
  drainage_area: string;
  discharge_point_type: string;
  is_ats: boolean;
  is_passive_treatment: boolean;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function transformLocation(row: DbMonitoringLocationRow): MonitoringLocation {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    drainageArea: row.drainage_area,
    dischargePointType: row.discharge_point_type as DischargePointType,
    isAts: row.is_ats,
    isPassiveTreatment: row.is_passive_treatment,
    description: row.description ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    status: row.status as 'active' | 'inactive',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

interface DbSampleRow {
  id: string;
  project_id: string;
  smarts_event_id: string;
  monitoring_location_id: string;
  sample_datetime: string;
  qsp_name: string;
  created_at: string;
  updated_at: string;
  parameter_results: DbParameterResultRow[];
}

function transformSample(row: DbSampleRow): Sample {
  return {
    id: row.id,
    projectId: row.project_id,
    smartsEventId: row.smarts_event_id,
    monitoringLocationId: row.monitoring_location_id,
    sampleDatetime: row.sample_datetime,
    qspName: row.qsp_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    parameterResults: (row.parameter_results ?? []).map((p) => ({
      id: p.id,
      projectId: p.project_id,
      sampleId: p.sample_id,
      parameter: p.parameter as ParameterName,
      qualifier: p.qualifier as ParameterQualifier,
      result: p.result == null ? undefined : Number(p.result),
      units: p.units,
      analyticalMethod: p.analytical_method,
      mdl: p.mdl == null ? undefined : Number(p.mdl),
      rl: p.rl == null ? undefined : Number(p.rl),
      analyzedBy: p.analyzed_by as AnalyzedBy,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    })),
  };
}

export async function fetchSmartsExportInput(
  supabase: AuthedSupabase,
  eventId: string
): Promise<FetchExportInputResult> {
  // Event
  const { data: eventRow, error: eventError } = await supabase
    .from('smarts_events')
    .select('*')
    .eq('id', eventId)
    .single();
  if (eventError) {
    if (eventError.code === 'PGRST116') {
      return { ok: false, status: 404, error: 'Smarts event not found' };
    }
    return { ok: false, status: 500, error: eventError.message };
  }
  const event = transformEvent(eventRow as Record<string, unknown>);

  // Project (for name + wdid)
  const { data: projectRow } = await supabase
    .from('projects')
    .select('name, wdid')
    .eq('id', event.projectId)
    .single();
  const projectName =
    (projectRow?.name as string | undefined) ?? event.projectId;
  const wdid = (projectRow?.wdid as string | null) ?? null;

  // Locations for this project
  const { data: locationsData } = await supabase
    .from('monitoring_locations')
    .select('*')
    .eq('project_id', event.projectId);
  const monitoringLocations = (
    (locationsData ?? []) as unknown as DbMonitoringLocationRow[]
  ).map(transformLocation);

  // Samples + nested parameter_results
  const { data: samplesData } = await supabase
    .from('samples')
    .select(`*, parameter_results!parameter_results_sample_id_fkey (*)`)
    .eq('smarts_event_id', eventId);
  const samples = ((samplesData ?? []) as unknown as DbSampleRow[]).map(
    transformSample
  );

  return {
    ok: true,
    event,
    input: { event, projectName, wdid, monitoringLocations, samples },
  };
}
