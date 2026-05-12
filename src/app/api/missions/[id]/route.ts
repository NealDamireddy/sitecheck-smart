import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { ZodError } from 'zod';
import { missionUpdate } from '@/lib/validations';

// Transform snake_case database row to camelCase
function transformMissionToClient(row: Record<string, unknown>) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    status: row.status,
    date: row.date,
    inspectionType: row.inspection_type,
    flightTimeMinutes: row.flight_time_minutes,
    altitude: row.altitude,
    batteryStart: row.battery_start,
    batteryEnd: row.battery_end,
    weatherTemperature: row.weather_temperature,
    weatherCondition: row.weather_condition,
    weatherWindSpeedMph: row.weather_wind_speed_mph,
    weatherHumidity: row.weather_humidity,
    flightPath: row.flight_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Phase 16 fields
    scope: row.scope,
    endOfMissionAction: row.end_of_mission_action,
    editedFlightPath: row.edited_flight_path,
    lastCompletedWaypoint: row.last_completed_waypoint,
    resumeValid: row.resume_valid,
    sourceDocumentPages: row.source_document_pages,
    manualOverrideActive: row.manual_override_active,
    notes: row.notes,
    // Block 4 additions
    actualFlightPath: row.actual_flight_path ?? [],
    completedAt: row.completed_at ?? null,
    totalFlightSeconds: row.total_flight_seconds ?? null,
  };
}

// Transform snake_case waypoint to camelCase
function transformWaypointToClient(row: Record<string, unknown>) {
  return {
    id: row.id,
    missionId: row.mission_id,
    checkpointId: row.checkpoint_id,
    number: row.number,
    lat: row.lat,
    lng: row.lng,
    captureStatus: row.capture_status,
    arrivalTime: row.arrival_time,
    photo: row.photo,
    createdAt: row.created_at,
    // Phase 16 fields
    enabled: row.enabled,
    altitudeOverride: row.altitude_override,
    hoverTimeSeconds: row.hover_time_seconds,
    captureMode: row.capture_mode,
    operatorNotes: row.operator_notes,
    sortOrder: row.sort_order,
    // Block 4 additions
    photos: Array.isArray(row.photos) ? row.photos : [],
    actualLat: row.actual_lat ?? null,
    actualLng: row.actual_lng ?? null,
    actualAltitude: row.actual_altitude ?? null,
    capturedAt: row.captured_at ?? null,
  };
}

// Transform camelCase client data to snake_case for database updates
function transformMissionUpdateToDb(data: Record<string, unknown>) {
  const dbData: Record<string, unknown> = {};

  if (data.name !== undefined) dbData.name = data.name;
  if (data.status !== undefined) dbData.status = data.status;
  if (data.date !== undefined) dbData.date = data.date;
  if (data.inspectionType !== undefined) dbData.inspection_type = data.inspectionType;
  if (data.flightTimeMinutes !== undefined) dbData.flight_time_minutes = data.flightTimeMinutes;
  if (data.altitude !== undefined) dbData.altitude = data.altitude;
  if (data.batteryStart !== undefined) dbData.battery_start = data.batteryStart;
  if (data.batteryEnd !== undefined) dbData.battery_end = data.batteryEnd;
  if (data.weatherTemperature !== undefined) dbData.weather_temperature = data.weatherTemperature;
  if (data.weatherCondition !== undefined) dbData.weather_condition = data.weatherCondition;
  if (data.weatherWindSpeedMph !== undefined) dbData.weather_wind_speed_mph = data.weatherWindSpeedMph;
  if (data.weatherHumidity !== undefined) dbData.weather_humidity = data.weatherHumidity;
  if (data.flightPath !== undefined) dbData.flight_path = data.flightPath;
  // Phase 16 fields
  if (data.scope !== undefined) dbData.scope = data.scope;
  if (data.endOfMissionAction !== undefined) dbData.end_of_mission_action = data.endOfMissionAction;
  if (data.editedFlightPath !== undefined) dbData.edited_flight_path = data.editedFlightPath;
  if (data.lastCompletedWaypoint !== undefined) dbData.last_completed_waypoint = data.lastCompletedWaypoint;
  if (data.resumeValid !== undefined) dbData.resume_valid = data.resumeValid;
  if (data.sourceDocumentPages !== undefined) dbData.source_document_pages = data.sourceDocumentPages;
  if (data.manualOverrideActive !== undefined) dbData.manual_override_active = data.manualOverrideActive;
  if (data.notes !== undefined) dbData.notes = data.notes;

  // Always update updated_at timestamp
  dbData.updated_at = new Date().toISOString();

  return dbData;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/missions/[id] - Fetch mission by id with waypoints
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    // Fetch mission
    const { data: mission, error: missionError } = await supabase
      .from('drone_missions')
      .select('*')
      .eq('id', id)
      .single();

    if (missionError) {
      if (missionError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Mission not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching mission:', missionError);
      return NextResponse.json(
        { error: 'Failed to fetch mission' },
        { status: 500 }
      );
    }

    // Fetch waypoints ordered by number
    const { data: waypoints, error: waypointsError } = await supabase
      .from('waypoints')
      .select('*')
      .eq('mission_id', id)
      .order('number', { ascending: true });

    if (waypointsError) {
      console.error('Error fetching waypoints:', waypointsError);
      // Continue without waypoints rather than failing
    }

    const transformedMission = transformMissionToClient(mission);
    const transformedWaypoints = (waypoints || []).map(transformWaypointToClient);

    return NextResponse.json({
      ...transformedMission,
      waypoints: transformedWaypoints,
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/missions/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/missions/[id] - Update mission fields
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const raw = await request.json();
    const body = missionUpdate.parse(raw);

    // Transform to database format
    const updateData = transformMissionUpdateToDb(body);

    if (Object.keys(updateData).length === 1) {
      // Only updated_at was set, no real updates
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { data: mission, error } = await supabase
      .from('drone_missions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Mission not found' },
          { status: 404 }
        );
      }
      console.error('Error updating mission:', error);
      return NextResponse.json(
        { error: 'Failed to update mission' },
        { status: 500 }
      );
    }

    // Create activity event for status changes
    if (body.status) {
      const statusAction = body.status === 'completed' ? 'mission-completed'
        : body.status === 'aborted' ? 'mission-aborted'
        : body.status === 'in-progress' ? 'mission-launched'
        : body.status === 'paused' ? 'mission-paused'
        : body.status === 'returning-home' ? 'return-home-initiated'
        : 'mission-status-changed';

      const activityEvent = {
        id: `activity-${Date.now()}`,
        project_id: mission.project_id,
        type: 'drone',
        title: 'Mission Status Updated',
        description: `Mission "${mission.name}" status changed to ${body.status}`,
        timestamp: new Date().toISOString(),
        severity: (body.status === 'completed' || body.status === 'planned') ? 'info'
          : (body.status === 'aborted' || body.status === 'returning-home') ? 'warning'
          : 'info',
        linked_entity_id: id,
        linked_entity_type: 'mission',
        metadata: {
          action: statusAction,
          missionId: id,
          previousStatus: body._previousStatus || null,
          newStatus: body.status,
          lastCompletedWaypoint: body.lastCompletedWaypoint ?? null,
          manualOverrideActive: body.manualOverrideActive ?? false,
          timestamp: new Date().toISOString(),
        },
      };

      const { error: activityError } = await supabase
        .from('activity_events')
        .insert(activityEvent);

      if (activityError) {
        console.error('Error creating activity event:', activityError);
      }
    }

    // Create activity event for route edits
    if (body.editedFlightPath !== undefined) {
      const routeEditEvent = {
        id: `activity-${Date.now() + 1}`,
        project_id: mission.project_id,
        type: 'drone',
        title: 'Route Edited',
        description: `Flight route for "${mission.name}" was manually edited`,
        timestamp: new Date().toISOString(),
        severity: 'info',
        linked_entity_id: id,
        linked_entity_type: 'mission',
        metadata: {
          action: 'route-edited',
          missionId: id,
          hasEditedPath: body.editedFlightPath !== null,
          timestamp: new Date().toISOString(),
        },
      };

      const { error: routeEditError } = await supabase
        .from('activity_events')
        .insert(routeEditEvent);

      if (routeEditError) {
        console.error('Error creating route-edit activity event:', routeEditError);
      }
    }

    return NextResponse.json(transformMissionToClient(mission));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    console.error('Unexpected error in PUT /api/missions/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
