import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { resolveProjectId, DEFAULT_PROJECT_ID } from '@/lib/project-context';


// Transform snake_case database row to camelCase
function transformQPEventToClient(row: Record<string, unknown>) {
  return {
    id: row.id,
    projectId: row.project_id,
    startDate: row.start_date,
    endDate: row.end_date,
    totalPrecipitation: Number(row.total_precipitation),
    inspectionTriggered: row.inspection_triggered,
    inspectionId: row.inspection_id,
    createdAt: row.created_at,
  };
}

// Transform camelCase client data to snake_case for database
function transformQPEventToDb(data: Record<string, unknown>) {
  const dbData: Record<string, unknown> = {};

  if (data.id !== undefined) dbData.id = data.id;
  if (data.projectId !== undefined) dbData.project_id = data.projectId;
  if (data.startDate !== undefined) dbData.start_date = data.startDate;
  if (data.endDate !== undefined) dbData.end_date = data.endDate;
  if (data.totalPrecipitation !== undefined) dbData.total_precipitation = data.totalPrecipitation;
  if (data.inspectionTriggered !== undefined) dbData.inspection_triggered = data.inspectionTriggered;
  if (data.inspectionId !== undefined) dbData.inspection_id = data.inspectionId;

  return dbData;
}

// GET /api/weather/qpe-events - List QPE events
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId') || DEFAULT_PROJECT_ID;
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const { data, error } = await supabase
      .from('qp_events')
      .select('*')
      .eq('project_id', projectId)
      .order('start_date', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching QPE events:', error);
      return NextResponse.json(
        { error: 'Failed to fetch QPE events' },
        { status: 500 }
      );
    }

    const events = (data || []).map(transformQPEventToClient);

    return NextResponse.json(events);
  } catch (error) {
    console.error('Unexpected error in GET /api/weather/qpe-events:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/weather/qpe-events - Create a new QPE event
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = await request.json();

    // Generate ID if not provided
    const eventId = body.id || `qpe-${Date.now()}`;

    // Set defaults
    const eventData = transformQPEventToDb({
      ...body,
      id: eventId,
      projectId: body.projectId || DEFAULT_PROJECT_ID,
      inspectionTriggered: body.inspectionTriggered ?? false,
    });

    // Insert QPE event
    const { data: event, error: eventError } = await supabase
      .from('qp_events')
      .insert(eventData)
      .select()
      .single();

    if (eventError) {
      console.error('Error creating QPE event:', eventError);
      return NextResponse.json(
        { error: 'Failed to create QPE event' },
        { status: 500 }
      );
    }

    // Create activity event
    const totalPrecip = body.totalPrecipitation || 0;
    const activityEvent = {
      id: `activity-${Date.now()}`,
      project_id: eventData.project_id,
      type: 'weather',
      title: 'QPE Detected',
      description: `Qualifying Precipitation Event detected: ${totalPrecip.toFixed(2)} inches. Post-storm inspection required within 24 hours.`,
      timestamp: new Date().toISOString(),
      severity: 'warning',
      linked_entity_id: eventId,
      linked_entity_type: 'qpe',
    };

    const { error: activityError } = await supabase
      .from('activity_events')
      .insert(activityEvent);

    if (activityError) {
      console.error('Error creating activity event:', activityError);
      // Don't fail the whole request
    }

    // Also create a notification for QPE events
    const notification = {
      id: `notif-${Date.now()}`,
      project_id: eventData.project_id,
      type: 'alert',
      title: 'QPE Alert',
      message: `A Qualifying Precipitation Event (${totalPrecip.toFixed(2)} inches) has been detected. Per CGP requirements, a post-storm inspection must be completed within 24 hours.`,
      timestamp: new Date().toISOString(),
      read: false,
      link: '/weather',
    };

    const { error: notificationError } = await supabase
      .from('notifications')
      .insert(notification);

    if (notificationError) {
      console.error('Error creating notification:', notificationError);
    }

    return NextResponse.json(transformQPEventToClient(event), { status: 201 });
  } catch (error) {
    console.error('Unexpected error in POST /api/weather/qpe-events:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
