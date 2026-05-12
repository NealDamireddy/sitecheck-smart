import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { ZodError } from 'zod';
import { missionCreate } from '@/lib/validations';
import { DEFAULT_PROJECT_ID } from '@/lib/project-context';
import { fetchAirspaceContext } from '@/lib/airspace-context';
import { validateFlightPath } from '@/lib/geofence';


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
  };
}

// Transform camelCase client data to snake_case for database
function transformMissionToDb(data: Record<string, unknown>) {
  const dbData: Record<string, unknown> = {};

  if (data.id !== undefined) dbData.id = data.id;
  if (data.projectId !== undefined) dbData.project_id = data.projectId;
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

  return dbData;
}

// Transform camelCase waypoint to snake_case for database
function transformWaypointToDb(waypoint: Record<string, unknown>, missionId: string) {
  return {
    mission_id: missionId,
    checkpoint_id: waypoint.checkpointId,
    number: waypoint.number,
    lat: waypoint.lat,
    lng: waypoint.lng,
    capture_status: waypoint.captureStatus || 'pending',
    arrival_time: waypoint.arrivalTime || new Date().toISOString(),
    photo: waypoint.photo || null,
    // Phase 16 fields
    enabled: waypoint.enabled !== undefined ? waypoint.enabled : true,
    altitude_override: waypoint.altitudeOverride || null,
    hover_time_seconds: waypoint.hoverTimeSeconds || 10,
    capture_mode: waypoint.captureMode || 'auto',
    operator_notes: waypoint.operatorNotes || null,
    sort_order: waypoint.sortOrder || null,
  };
}

// GET /api/missions - List all drone missions
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId') || DEFAULT_PROJECT_ID;

    const { data, error } = await supabase
      .from('drone_missions')
      .select('*')
      .eq('project_id', projectId)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching missions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch missions' },
        { status: 500 }
      );
    }

    const missions = (data || []).map(transformMissionToClient);

    return NextResponse.json(missions);
  } catch (error) {
    console.error('Unexpected error in GET /api/missions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/missions - Create a new mission
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const raw = await request.json();
    const body = missionCreate.parse(raw);

    // Generate ID if not provided
    const missionId = body.id || `mission-${Date.now()}`;
    const resolvedProjectId = body.projectId || DEFAULT_PROJECT_ID;

    // Block 3: validate flight path against project geofence + active no-fly zones
    // before persisting. This catches the case where a user manually drags a waypoint
    // into a NFZ in the route editor and then tries to save.
    if (
      Array.isArray(body.flightPath) &&
      body.flightPath.length >= 2 &&
      Array.isArray(body.waypoints) &&
      body.waypoints.length > 0
    ) {
      try {
        const { geofence, noFlyZones } = await fetchAirspaceContext(resolvedProjectId);
        const altitude = typeof body.altitude === 'number' ? body.altitude : 120;
        const validatableWaypoints = body.waypoints.map(
          (wp: Record<string, unknown>, i: number) => ({
            number: typeof wp.number === 'number' ? (wp.number as number) : i + 1,
            lat: wp.lat as number,
            lng: wp.lng as number,
            altitudeFeet:
              typeof wp.altitudeOverride === 'number'
                ? (wp.altitudeOverride as number)
                : altitude,
          })
        );
        const result = validateFlightPath(
          body.flightPath as [number, number][],
          validatableWaypoints,
          geofence,
          noFlyZones,
          { defaultAltitudeFeet: altitude }
        );
        if (!result.valid) {
          return NextResponse.json(
            {
              error: 'Mission violates restricted airspace',
              violations: result.violations,
            },
            { status: 422 }
          );
        }
      } catch (validationErr) {
        console.warn('Airspace validation skipped due to error:', validationErr);
        // Fail-open on validation infrastructure errors so mock/demo paths still work.
      }
    }

    // Set defaults
    const missionData = transformMissionToDb({
      ...body,
      id: missionId,
      projectId: resolvedProjectId,
      status: body.status || 'planned',
      flightTimeMinutes: body.flightTimeMinutes || 0,
      altitude: body.altitude || 120,
      batteryStart: body.batteryStart || 100,
      batteryEnd: body.batteryEnd || 0,
      flightPath: body.flightPath || [],
    });

    // Insert mission
    const { data: mission, error: missionError } = await supabase
      .from('drone_missions')
      .insert(missionData)
      .select()
      .single();

    if (missionError) {
      console.error('Error creating mission:', missionError);
      return NextResponse.json(
        { error: 'Failed to create mission' },
        { status: 500 }
      );
    }

    // Insert waypoints if provided
    if (body.waypoints && Array.isArray(body.waypoints) && body.waypoints.length > 0) {
      const waypointsData = body.waypoints.map((wp: Record<string, unknown>) =>
        transformWaypointToDb(wp, missionId)
      );

      const { error: waypointsError } = await supabase
        .from('waypoints')
        .insert(waypointsData);

      if (waypointsError) {
        console.error('Error creating waypoints:', waypointsError);
        // Don't fail the whole request, but log the error
      }
    }

    // Create activity event for new mission
    const activityEvent = {
      id: `activity-${Date.now()}`,
      project_id: missionData.project_id,
      type: 'drone',
      title: 'Mission Created',
      description: `New ${body.inspectionType || 'routine'} inspection mission "${body.name}" with ${body.waypoints?.length || 0} waypoints`,
      timestamp: new Date().toISOString(),
      severity: 'info',
      linked_entity_id: missionId,
      linked_entity_type: 'mission',
      metadata: {
        action: 'mission-created',
        missionId,
        scope: body.scope || 'full',
        waypointCount: body.waypoints?.length || 0,
        altitude: body.altitude || 120,
        inspectionType: body.inspectionType || 'routine',
      },
    };

    const { error: activityError } = await supabase
      .from('activity_events')
      .insert(activityEvent);

    if (activityError) {
      console.error('Error creating activity event:', activityError);
      // Don't fail the whole request
    }

    return NextResponse.json(transformMissionToClient(mission), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    console.error('Unexpected error in POST /api/missions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
