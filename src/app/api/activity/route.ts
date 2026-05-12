import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { activityCreate } from '@/lib/validations';
import { resolveProjectId, DEFAULT_PROJECT_ID } from '@/lib/project-context';

const DEFAULT_LIMIT = 20;

// Transform snake_case database row to camelCase
function transformActivityToClient(row: Record<string, unknown>) {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    title: row.title,
    description: row.description,
    timestamp: row.timestamp,
    severity: row.severity,
    linkedEntityId: row.linked_entity_id,
    linkedEntityType: row.linked_entity_type,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

// Transform camelCase client data to snake_case for database
function transformActivityToDb(data: Record<string, unknown>) {
  const dbData: Record<string, unknown> = {};

  if (data.id !== undefined) dbData.id = data.id;
  if (data.projectId !== undefined) dbData.project_id = data.projectId;
  if (data.type !== undefined) dbData.type = data.type;
  if (data.title !== undefined) dbData.title = data.title;
  if (data.description !== undefined) dbData.description = data.description;
  if (data.timestamp !== undefined) dbData.timestamp = data.timestamp;
  if (data.severity !== undefined) dbData.severity = data.severity;
  if (data.linkedEntityId !== undefined) dbData.linked_entity_id = data.linkedEntityId;
  if (data.linkedEntityType !== undefined) dbData.linked_entity_type = data.linkedEntityType;
  if (data.metadata !== undefined) dbData.metadata = data.metadata;

  return dbData;
}

// GET /api/activity - List activity events
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId') || DEFAULT_PROJECT_ID;
    const limit = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
    const type = searchParams.get('type');

    let query = supabase
      .from('activity_events')
      .select('*')
      .eq('project_id', projectId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    // Optional type filter
    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching activity events:', error);
      return NextResponse.json(
        { error: 'Failed to fetch activity events' },
        { status: 500 }
      );
    }

    const activities = (data || []).map(transformActivityToClient);

    return NextResponse.json(activities);
  } catch (error) {
    console.error('Unexpected error in GET /api/activity:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/activity - Create activity event
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = activityCreate.parse(await request.json());

    // Validate required fields
    if (!body.type || !body.title || !body.description) {
      return NextResponse.json(
        { error: 'Missing required fields: type, title, description' },
        { status: 400 }
      );
    }

    // Valid types
    const validTypes = ['drone', 'inspection', 'alert', 'weather', 'document', 'deficiency'];
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Generate ID if not provided
    const activityId = body.id || `activity-${Date.now()}`;

    // Set defaults
    const activityData = transformActivityToDb({
      ...body,
      id: activityId,
      projectId: body.projectId || DEFAULT_PROJECT_ID,
      timestamp: body.timestamp || new Date().toISOString(),
      severity: body.severity || 'info',
    });

    // Insert activity event
    const { data: activity, error } = await supabase
      .from('activity_events')
      .insert(activityData)
      .select()
      .single();

    if (error) {
      console.error('Error creating activity event:', error);
      return NextResponse.json(
        { error: 'Failed to create activity event' },
        { status: 500 }
      );
    }

    return NextResponse.json(transformActivityToClient(activity), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Unexpected error in POST /api/activity:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
