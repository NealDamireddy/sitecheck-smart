import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { crossingCreate } from '@/lib/validations';
import { linearCrossings } from '@/data/linear-crossings';
import type { Crossing } from '@/types/crossing';

function transformCrossing(row: Record<string, unknown>): Crossing {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    segmentId: (row.segment_id as string | null) ?? undefined,
    crossingType: row.crossing_type as Crossing['crossingType'],
    name: row.name as string,
    stationNumber:
      row.station_number != null ? Number(row.station_number) : undefined,
    stationLabel: (row.station_label as string | null) ?? undefined,
    location: (row.location as [number, number] | null) ?? undefined,
    description: (row.description as string | null) ?? undefined,
    permitsRequired: (row.permits_required as string[] | null) ?? [],
    status: row.status as Crossing['status'],
    createdAt: row.created_at as string | undefined,
    updatedAt: row.updated_at as string | undefined,
  };
}

function toSnakeCase(c: Partial<Crossing>) {
  return {
    id: c.id,
    project_id: c.projectId,
    segment_id: c.segmentId ?? null,
    crossing_type: c.crossingType,
    name: c.name,
    station_number: c.stationNumber ?? null,
    station_label: c.stationLabel ?? null,
    location: c.location ?? null,
    description: c.description ?? null,
    permits_required: c.permitsRequired ?? [],
    status: c.status ?? 'pending',
  };
}

// GET /api/crossings?projectId=...&segmentId=...
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const segmentId = searchParams.get('segmentId');

  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    let query = supabase.from('crossings').select('*').eq('project_id', projectId);
    if (segmentId) query = query.eq('segment_id', segmentId);
    query = query.order('station_number', { ascending: true });

    const { data, error } = await query;
    if (error) throw error;

    if (data && data.length > 0) {
      return NextResponse.json(data.map(transformCrossing));
    }

    // Mock fallback
    const mock = linearCrossings.filter(
      (c) => c.projectId === projectId && (!segmentId || c.segmentId === segmentId)
    );
    return NextResponse.json(mock);
  } catch {
    const mock = linearCrossings.filter(
      (c) => c.projectId === projectId && (!segmentId || c.segmentId === segmentId)
    );
    return NextResponse.json(mock);
  }
}

// POST /api/crossings
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = crossingCreate.parse(await request.json()) as Partial<Crossing>;

    if (!body.id) {
      body.id = `crossing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    const { data, error } = await supabase
      .from('crossings')
      .insert(toSnakeCase(body))
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to create crossing: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(transformCrossing(data), { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: `Failed to create crossing: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      },
      { status: 500 }
    );
  }
}
