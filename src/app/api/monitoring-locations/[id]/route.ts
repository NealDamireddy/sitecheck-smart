/**
 * Monitoring locations — single-row endpoint.
 *
 * GET    /api/monitoring-locations/[id]   — fetch one location (404 if missing)
 * PATCH  /api/monitoring-locations/[id]   — partial update
 * DELETE /api/monitoring-locations/[id]   — remove
 *
 * DELETE matches Aryav's existing pattern across /geofences, /checkpoints,
 * /crossings, /nofly-zones — returns 200 + { success: true } and does
 * NOT 404 on a missing row. Consistency with the rest of the API beats
 * strict REST semantics for now; a future cross-app DELETE refactor can
 * tighten all five together.
 *
 * RLS scopes by project_id on the row.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { monitoringLocationUpdate } from '@/lib/validations';
import type {
  MonitoringLocation,
  MonitoringLocationStatus,
  DischargePointType,
} from '@/types';

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

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ──────────────────────────────────────────────────────
// GET /api/monitoring-locations/[id]
// ──────────────────────────────────────────────────────
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const { data, error } = await supabase
      .from('monitoring_locations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Monitoring location not found' },
          { status: 404 }
        );
      }
      throw new Error(error.message);
    }

    return NextResponse.json(
      transformMonitoringLocation(data as DbMonitoringLocationRow)
    );
  } catch (err: unknown) {
    console.error('Monitoring location GET error:', err);
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to fetch monitoring location' }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────
// PATCH /api/monitoring-locations/[id]
// ──────────────────────────────────────────────────────
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = monitoringLocationUpdate.parse(await request.json());

    const updates: Record<string, unknown> = {};
    if (typeof body.name === 'string') updates.name = body.name;
    if (typeof body.drainageArea === 'string') {
      updates.drainage_area = body.drainageArea;
    }
    if (typeof body.dischargePointType === 'string') {
      updates.discharge_point_type = body.dischargePointType;
    }
    if (typeof body.isAts === 'boolean') updates.is_ats = body.isAts;
    if (typeof body.isPassiveTreatment === 'boolean') {
      updates.is_passive_treatment = body.isPassiveTreatment;
    }
    if (typeof body.description === 'string' || body.description === null) {
      updates.description = body.description;
    }
    if (typeof body.latitude === 'number' || body.latitude === null) {
      updates.latitude = body.latitude;
    }
    if (typeof body.longitude === 'number' || body.longitude === null) {
      updates.longitude = body.longitude;
    }
    if (typeof body.status === 'string') updates.status = body.status;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('monitoring_locations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      console.error('Monitoring location PATCH failed:', error);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    return NextResponse.json(
      transformMonitoringLocation(data as DbMonitoringLocationRow)
    );
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error('Monitoring location PATCH error:', err);
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to update monitoring location' }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────
// DELETE /api/monitoring-locations/[id]
// ──────────────────────────────────────────────────────
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const { error } = await supabase
      .from('monitoring_locations')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json(
        { error: `Failed to delete monitoring location: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    // SEC-09: never echo internal error text to the client.
    console.error('Failed to delete monitoring location:', err);
    return NextResponse.json({ error: 'Failed to delete monitoring location' }, { status: 500 });
  }
}
