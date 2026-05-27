/**
 * GET /api/smarts-events/[id]/export
 *
 * Streams an .xlsx (default) or .csv (`?format=csv`) of the event's
 * samples + parameter results. The Excel workbook is a SMARTS data-
 * entry aid (see src/lib/smarts/excel-export.ts); the CSV is a flat
 * review file QSPs can open or edit anywhere before syncing (see
 * src/lib/smarts/csv-export.ts). Both formats share this single data-
 * fetch path.
 *
 * Joins smarts_events / monitoring_locations (project-scoped) /
 * samples / parameter_results via the standard RLS-scoped Supabase
 * client. Returns 404 when the event row isn't reachable, 500 on any
 * other read or build failure. Always returns a result on success
 * even if there are zero samples (the Excel Sheet 2 still has the
 * project summary; the CSV emits a header-only file).
 *
 * Filenames:
 *   xlsx → smarts-ad-hoc-{wdid-or-event-id}-{YYYY-MM-DD}.xlsx
 *   csv  → smarts-export-{project-name-slug}-{YYYY-MM-DD}.csv
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { buildSmartsExcelWorkbook } from '@/lib/smarts/excel-export';
import {
  buildSmartsCsv,
  buildSmartsCsvFilename,
} from '@/lib/smarts/csv-export';
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

interface RouteContext {
  params: Promise<{ id: string }>;
}

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

function buildFilename(wdid: string | null, eventId: string): string {
  const slug = wdid && wdid.trim() ? wdid.trim() : eventId;
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `smarts-ad-hoc-${slug}-${yyyy}-${mm}-${dd}.xlsx`;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const format = (
      request.nextUrl.searchParams.get('format') ?? 'xlsx'
    ).toLowerCase();
    if (format !== 'xlsx' && format !== 'csv') {
      return NextResponse.json(
        { error: `Unsupported format '${format}' (expected 'xlsx' or 'csv')` },
        { status: 400 }
      );
    }
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    // Event
    const { data: eventRow, error: eventError } = await supabase
      .from('smarts_events')
      .select('*')
      .eq('id', id)
      .single();
    if (eventError) {
      if (eventError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Smarts event not found' },
          { status: 404 }
        );
      }
      throw new Error(eventError.message);
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
    const monitoringLocations = ((locationsData ?? []) as unknown as DbMonitoringLocationRow[]).map(
      transformLocation
    );

    // Samples + nested parameter_results
    const { data: samplesData } = await supabase
      .from('samples')
      .select(`*, parameter_results (*)`)
      .eq('smarts_event_id', id);
    const samples = ((samplesData ?? []) as unknown as DbSampleRow[]).map(
      transformSample
    );

    const exportInput = {
      event,
      projectName,
      wdid,
      monitoringLocations,
      samples,
    };

    if (format === 'csv') {
      const csv = buildSmartsCsv(exportInput);
      const filename = buildSmartsCsvFilename(projectName);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const buffer = await buildSmartsExcelWorkbook(exportInput);
    const filename = buildFilename(wdid, event.id);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    console.error('Smarts export error:', err);
    const message =
      err instanceof Error ? err.message : 'Failed to build SMARTS export';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
