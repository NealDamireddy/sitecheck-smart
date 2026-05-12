import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { noflyZoneUpdate } from '@/lib/validations';
import { transformNoFlyZone } from '@/lib/airspace-context';
import type { NoFlyZone } from '@/types/nofly-zone';

// PATCH /api/nofly-zones/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = noflyZoneUpdate.parse(await request.json()) as Partial<NoFlyZone>;
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.category !== undefined) updates.category = body.category;
    if (body.polygon !== undefined) updates.polygon = body.polygon;
    if (body.floorFeet !== undefined) updates.floor_feet = body.floorFeet;
    if (body.ceilingFeet !== undefined) updates.ceiling_feet = body.ceilingFeet;
    if (body.description !== undefined) updates.description = body.description;
    if (body.source !== undefined) updates.source = body.source;
    if (body.active !== undefined) updates.active = body.active;
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('nofly_zones')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to update no-fly zone: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json(transformNoFlyZone(data));
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: `Failed to update no-fly zone: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      },
      { status: 500 }
    );
  }
}

// DELETE /api/nofly-zones/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { error } = await supabase.from('nofly_zones').delete().eq('id', id);
    if (error) {
      return NextResponse.json(
        { error: `Failed to delete no-fly zone: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to delete no-fly zone: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      },
      { status: 500 }
    );
  }
}
