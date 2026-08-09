/**
 * Monitoring locations — collection endpoint.
 *
 * GET  /api/monitoring-locations?projectId=...&status=...   — list
 * POST /api/monitoring-locations                            — create
 *
 * Monitoring locations are project fixtures — the predefined sampling
 * points where pH/turbidity samples are taken during a SMARTS event.
 * They are managed independently of any individual smarts event.
 *
 * RLS handles project scoping (migration 008). `?projectId=` is required;
 * requests without it return 400.
 *
 * Optional `?status=active|inactive` filter for the capture-screen path
 * which only wants active locations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { monitoringLocationCreate } from '@/lib/validations';
import { resolveProjectId } from '@/lib/project-context';
import type {
  MonitoringLocation,
  MonitoringLocationStatus,
  DischargePointType,
} from '@/types';
import { log } from '@/lib/logger';
import { formatZodIssues } from '@/lib/api-error';

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

function transformMonitoringLocation(
  row: DbMonitoringLocationRow
): MonitoringLocation {
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
    status: row.status as MonitoringLocationStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generateId() {
  return `mloc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ──────────────────────────────────────────────────────
// GET /api/monitoring-locations
// ──────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const projectId = resolveProjectId(request);
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase
      .from('monitoring_locations')
      .select('*')
      .eq('project_id', projectId)
      .order('name', { ascending: true });

    if (status === 'active' || status === 'inactive') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as DbMonitoringLocationRow[];
    return NextResponse.json(rows.map(transformMonitoringLocation));
  } catch (err: unknown) {
    log.error('Monitoring locations GET error', { err });
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to fetch monitoring locations' }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────
// POST /api/monitoring-locations
// ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = monitoringLocationCreate.parse(await request.json());

    if (!body.projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    const insertRow = {
      id: body.id || generateId(),
      project_id: body.projectId,
      name: body.name,
      drainage_area: body.drainageArea,
      discharge_point_type: body.dischargePointType,
      is_ats: body.isAts ?? false,
      is_passive_treatment: body.isPassiveTreatment ?? false,
      description: body.description ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      status: body.status ?? 'active',
    };

    const { data, error } = await supabase
      .from('monitoring_locations')
      .insert(insertRow)
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Insert returned no row');
    }

    return NextResponse.json(
      transformMonitoringLocation(data as DbMonitoringLocationRow),
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: formatZodIssues(err.issues), details: err.issues },
        { status: 400 }
      );
    }
    log.error('Monitoring locations POST error', { err });
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to create monitoring location' }, { status: 500 });
  }
}
