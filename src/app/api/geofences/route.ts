import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { geofenceCreate } from '@/lib/validations';
import {
  fetchGeofencesForProject,
  geofenceToSnakeCase,
  transformGeofence,
} from '@/lib/airspace-context';
import type { Geofence } from '@/types/geofence';
import { log } from '@/lib/logger';

// GET /api/geofences?projectId=...
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId query parameter is required' },
      { status: 400 }
    );
  }

  // SEC-04: pass the caller's RLS-scoped client — geofence reads must
  // not ride the service role past tenant isolation.
  const geofences = await fetchGeofencesForProject(auth.supabase, projectId);
  return NextResponse.json(geofences);
}

// POST /api/geofences
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = geofenceCreate.parse(await request.json()) as Partial<Geofence>;
    if (!body.id) {
      body.id = `geofence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!body.source) body.source = 'manual';
    const { data, error } = await supabase
      .from('geofences')
      .insert(geofenceToSnakeCase(body))
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to create geofence: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json(transformGeofence(data), { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    // SEC-09: never echo internal error text to the client.
    log.error('Failed to create geofence', { err });
    return NextResponse.json({ error: 'Failed to create geofence' }, { status: 500 });
  }
}
