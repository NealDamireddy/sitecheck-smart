import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { crossingUpdate } from '@/lib/validations';
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

// GET /api/crossings/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { data, error } = await supabase
      .from('crossings')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Crossing not found' }, { status: 404 });
    }
    return NextResponse.json(transformCrossing(data));
  } catch {
    return NextResponse.json({ error: 'Crossing not found' }, { status: 404 });
  }
}

// PATCH /api/crossings/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = crossingUpdate.parse(await request.json()) as Partial<Crossing>;
    const updates: Record<string, unknown> = {};
    if (body.segmentId !== undefined) updates.segment_id = body.segmentId;
    if (body.crossingType !== undefined) updates.crossing_type = body.crossingType;
    if (body.name !== undefined) updates.name = body.name;
    if (body.stationNumber !== undefined) updates.station_number = body.stationNumber;
    if (body.stationLabel !== undefined) updates.station_label = body.stationLabel;
    if (body.location !== undefined) updates.location = body.location;
    if (body.description !== undefined) updates.description = body.description;
    if (body.permitsRequired !== undefined) updates.permits_required = body.permitsRequired;
    if (body.status !== undefined) updates.status = body.status;
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('crossings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to update crossing: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json(transformCrossing(data));
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: `Failed to update crossing: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      },
      { status: 500 }
    );
  }
}

// DELETE /api/crossings/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { error } = await supabase.from('crossings').delete().eq('id', id);
    if (error) {
      return NextResponse.json(
        { error: `Failed to delete crossing: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to delete crossing: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      },
      { status: 500 }
    );
  }
}
