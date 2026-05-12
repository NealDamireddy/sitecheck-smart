import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { permitCreate, permitUpdate } from '@/lib/validations';
import { linearPermits } from '@/data/linear-permits';
import { deriveLivePermitStatus } from '@/types/permit';
import type { SegmentPermit } from '@/types/permit';

function transformPermit(row: Record<string, unknown>): SegmentPermit {
  const permit: SegmentPermit = {
    id: row.id as string,
    projectId: row.project_id as string,
    segmentId: (row.segment_id as string | null) ?? undefined,
    crossingId: (row.crossing_id as string | null) ?? undefined,
    permitType: row.permit_type as string,
    permitNumber: (row.permit_number as string | null) ?? undefined,
    agency: (row.agency as string | null) ?? undefined,
    issuedDate: (row.issued_date as string | null) ?? undefined,
    expirationDate: (row.expiration_date as string | null) ?? undefined,
    status: row.status as SegmentPermit['status'],
    notes: (row.notes as string | null) ?? undefined,
    createdAt: row.created_at as string | undefined,
    updatedAt: row.updated_at as string | undefined,
  };
  permit.status = deriveLivePermitStatus(permit);
  return permit;
}

function toSnakeCase(p: Partial<SegmentPermit>) {
  return {
    id: p.id,
    project_id: p.projectId,
    segment_id: p.segmentId ?? null,
    crossing_id: p.crossingId ?? null,
    permit_type: p.permitType,
    permit_number: p.permitNumber ?? null,
    agency: p.agency ?? null,
    issued_date: p.issuedDate ?? null,
    expiration_date: p.expirationDate ?? null,
    status: p.status ?? 'active',
    notes: p.notes ?? null,
  };
}

// GET /api/permits?projectId=...&segmentId=...&crossingId=...
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const segmentId = searchParams.get('segmentId');
  const crossingId = searchParams.get('crossingId');

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
    let query = supabase.from('segment_permits').select('*').eq('project_id', projectId);
    if (segmentId) query = query.eq('segment_id', segmentId);
    if (crossingId) query = query.eq('crossing_id', crossingId);
    query = query.order('expiration_date', { ascending: true });

    const { data, error } = await query;
    if (error) throw error;

    if (data && data.length > 0) {
      return NextResponse.json(data.map(transformPermit));
    }

    // Mock fallback
    let mock = linearPermits.filter((p) => p.projectId === projectId);
    if (segmentId) mock = mock.filter((p) => p.segmentId === segmentId);
    if (crossingId) mock = mock.filter((p) => p.crossingId === crossingId);
    return NextResponse.json(mock.map((p) => ({ ...p, status: deriveLivePermitStatus(p) })));
  } catch {
    let mock = linearPermits.filter((p) => p.projectId === projectId);
    if (segmentId) mock = mock.filter((p) => p.segmentId === segmentId);
    if (crossingId) mock = mock.filter((p) => p.crossingId === crossingId);
    return NextResponse.json(mock.map((p) => ({ ...p, status: deriveLivePermitStatus(p) })));
  }
}

// POST /api/permits
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = permitCreate.parse(await request.json()) as Partial<SegmentPermit>;
    if (!body.id) {
      body.id = `permit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    const { data, error } = await supabase
      .from('segment_permits')
      .insert(toSnakeCase(body))
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to create permit: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json(transformPermit(data), { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: `Failed to create permit: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      },
      { status: 500 }
    );
  }
}

// PATCH /api/permits?id=...
export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id query parameter required' }, { status: 400 });
  }
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = permitUpdate.parse(await request.json()) as Partial<SegmentPermit>;
    const updates: Record<string, unknown> = {};
    if (body.segmentId !== undefined) updates.segment_id = body.segmentId;
    if (body.crossingId !== undefined) updates.crossing_id = body.crossingId;
    if (body.permitType !== undefined) updates.permit_type = body.permitType;
    if (body.permitNumber !== undefined) updates.permit_number = body.permitNumber;
    if (body.agency !== undefined) updates.agency = body.agency;
    if (body.issuedDate !== undefined) updates.issued_date = body.issuedDate;
    if (body.expirationDate !== undefined) updates.expiration_date = body.expirationDate;
    if (body.status !== undefined) updates.status = body.status;
    if (body.notes !== undefined) updates.notes = body.notes;
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('segment_permits')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to update permit: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json(transformPermit(data));
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: `Failed to update permit: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      },
      { status: 500 }
    );
  }
}
