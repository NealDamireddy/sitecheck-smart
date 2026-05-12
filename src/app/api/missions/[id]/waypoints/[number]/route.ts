import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { ZodError } from 'zod';
import { waypointUpdate } from '@/lib/validations';

// Transform camelCase waypoint data to snake_case for database
function transformWaypointUpdateToDb(data: Record<string, unknown>) {
  const dbData: Record<string, unknown> = {};

  if (data.lat !== undefined) dbData.lat = data.lat;
  if (data.lng !== undefined) dbData.lng = data.lng;
  if (data.captureStatus !== undefined) dbData.capture_status = data.captureStatus;
  if (data.photo !== undefined) dbData.photo = data.photo;
  if (data.enabled !== undefined) dbData.enabled = data.enabled;
  if (data.altitudeOverride !== undefined) dbData.altitude_override = data.altitudeOverride;
  if (data.hoverTimeSeconds !== undefined) dbData.hover_time_seconds = data.hoverTimeSeconds;
  if (data.captureMode !== undefined) dbData.capture_mode = data.captureMode;
  if (data.operatorNotes !== undefined) dbData.operator_notes = data.operatorNotes;
  if (data.sortOrder !== undefined) dbData.sort_order = data.sortOrder;

  return dbData;
}

interface RouteContext {
  params: Promise<{ id: string; number: string }>;
}

// PUT /api/missions/[id]/waypoints/[number] - Update a single waypoint
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id: missionId, number: waypointNumber } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const raw = await request.json();
    const body = waypointUpdate.parse(raw);

    const updateData = transformWaypointUpdateToDb(body);

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { data: waypoint, error } = await supabase
      .from('waypoints')
      .update(updateData)
      .eq('mission_id', missionId)
      .eq('number', Number(waypointNumber))
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Waypoint not found' },
          { status: 404 }
        );
      }
      console.error('Error updating waypoint:', error);
      return NextResponse.json(
        { error: 'Failed to update waypoint' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: waypoint.id,
      missionId: waypoint.mission_id,
      checkpointId: waypoint.checkpoint_id,
      number: waypoint.number,
      lat: waypoint.lat,
      lng: waypoint.lng,
      captureStatus: waypoint.capture_status,
      arrivalTime: waypoint.arrival_time,
      photo: waypoint.photo,
      enabled: waypoint.enabled,
      altitudeOverride: waypoint.altitude_override,
      hoverTimeSeconds: waypoint.hover_time_seconds,
      captureMode: waypoint.capture_mode,
      operatorNotes: waypoint.operator_notes,
      sortOrder: waypoint.sort_order,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    console.error('Unexpected error in PUT /api/missions/[id]/waypoints/[number]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
