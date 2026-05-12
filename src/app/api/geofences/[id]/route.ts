import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { geofenceUpdate } from '@/lib/validations';
import { transformGeofence } from '@/lib/airspace-context';
import type { Geofence } from '@/types/geofence';

// PATCH /api/geofences/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = geofenceUpdate.parse(await request.json()) as Partial<Geofence>;
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.polygon !== undefined) updates.polygon = body.polygon;
    if (body.ceilingFeet !== undefined) updates.ceiling_feet = body.ceilingFeet;
    if (body.floorFeet !== undefined) updates.floor_feet = body.floorFeet;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.source !== undefined) updates.source = body.source;
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('geofences')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to update geofence: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json(transformGeofence(data));
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: `Failed to update geofence: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      },
      { status: 500 }
    );
  }
}

// DELETE /api/geofences/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { error } = await supabase.from('geofences').delete().eq('id', id);
    if (error) {
      return NextResponse.json(
        { error: `Failed to delete geofence: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to delete geofence: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      },
      { status: 500 }
    );
  }
}
