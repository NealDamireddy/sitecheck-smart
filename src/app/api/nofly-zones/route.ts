import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { noflyZoneCreate } from '@/lib/validations';
import {
  fetchNoFlyZonesForProject,
  noFlyZoneToSnakeCase,
  transformNoFlyZone,
} from '@/lib/airspace-context';
import type { NoFlyZone } from '@/types/nofly-zone';

// GET /api/nofly-zones?projectId=...&active=true
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const activeParam = searchParams.get('active');
  const onlyActive = activeParam == null ? true : activeParam === 'true';

  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId query parameter is required' },
      { status: 400 }
    );
  }

  const zones = await fetchNoFlyZonesForProject(projectId, { onlyActive });
  return NextResponse.json(zones);
}

// POST /api/nofly-zones
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = noflyZoneCreate.parse(await request.json()) as Partial<NoFlyZone>;
    if (!body.id) {
      body.id = `nfz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    if (body.active === undefined) body.active = true;
    const { data, error } = await supabase
      .from('nofly_zones')
      .insert(noFlyZoneToSnakeCase(body))
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to create no-fly zone: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json(transformNoFlyZone(data), { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: `Failed to create no-fly zone: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      },
      { status: 500 }
    );
  }
}
