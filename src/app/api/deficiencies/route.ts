import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { deficiencyCreate } from '@/lib/validations';
import { resolveProjectId, DEFAULT_PROJECT_ID } from '@/lib/project-context';


// Transform snake_case DB row to camelCase
function transformDeficiency(row: Record<string, unknown>) {
  return {
    id: row.id,
    checkpointId: row.checkpoint_id,
    projectId: row.project_id,
    detectedDate: row.detected_date,
    description: row.description,
    cgpViolation: row.cgp_violation,
    correctiveAction: row.corrective_action,
    deadline: row.deadline,
    status: row.status,
    resolvedDate: row.resolved_date,
    resolvedNotes: row.resolved_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Include checkpoint info if joined
    checkpoint: row.checkpoints ? {
      id: (row.checkpoints as Record<string, unknown>).id,
      name: (row.checkpoints as Record<string, unknown>).name,
      bmpType: (row.checkpoints as Record<string, unknown>).bmp_type,
      zone: (row.checkpoints as Record<string, unknown>).zone,
      lat: (row.checkpoints as Record<string, unknown>).lat,
      lng: (row.checkpoints as Record<string, unknown>).lng,
    } : undefined,
  };
}

// Transform camelCase request body to snake_case for DB
function toSnakeCase(data: Record<string, unknown>) {
  const mapping: Record<string, string> = {
    checkpointId: 'checkpoint_id',
    projectId: 'project_id',
    detectedDate: 'detected_date',
    cgpViolation: 'cgp_violation',
    correctiveAction: 'corrective_action',
    resolvedDate: 'resolved_date',
    resolvedNotes: 'resolved_notes',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  };

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const snakeKey = mapping[key] || key;
    result[snakeKey] = value;
  }
  return result;
}

// Generate unique ID
function generateId() {
  return `def-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Generate activity event ID
function generateActivityId() {
  return `act-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Generate notification ID
function generateNotificationId() {
  return `notif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);

    const projectId = searchParams.get('projectId') || DEFAULT_PROJECT_ID;
    const status = searchParams.get('status');

    let query = supabase
      .from('deficiencies')
      .select(`
        *,
        checkpoints (
          id,
          name,
          bmp_type,
          zone,
          lat,
          lng
        )
      `)
      .eq('project_id', projectId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('detected_date', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch deficiencies: ${error.message}`);
    }

    const deficiencies = (data || []).map(transformDeficiency);

    return NextResponse.json(deficiencies);
  } catch (error: unknown) {
    console.error('Deficiencies GET error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch deficiencies';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = deficiencyCreate.parse(await request.json());

    // Ensure required fields
    const deficiencyId = body.id || generateId();
    const projectId = body.projectId || DEFAULT_PROJECT_ID;

    if (!body.checkpointId) {
      return NextResponse.json(
        { error: 'checkpointId is required' },
        { status: 400 }
      );
    }

    // Get checkpoint info for the activity event
    const { data: checkpoint, error: checkpointError } = await supabase
      .from('checkpoints')
      .select('name')
      .eq('id', body.checkpointId)
      .single();

    if (checkpointError) {
      console.error('Failed to fetch checkpoint:', checkpointError.message);
    }

    // Transform to snake_case for DB
    const dbData = toSnakeCase({
      ...body,
      id: deficiencyId,
      projectId,
      status: body.status || 'open',
      detectedDate: body.detectedDate || new Date().toISOString(),
    });

    // Insert deficiency
    const { data, error } = await supabase
      .from('deficiencies')
      .insert(dbData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create deficiency: ${error.message}`);
    }

    // Create activity event
    const checkpointName = checkpoint?.name || 'Unknown';
    const activityEvent = {
      id: generateActivityId(),
      project_id: projectId,
      type: 'deficiency',
      title: 'Deficiency Detected',
      description: `New deficiency detected at checkpoint "${checkpointName}": ${body.description}`,
      timestamp: new Date().toISOString(),
      severity: 'warning',
      linked_entity_id: deficiencyId,
      linked_entity_type: 'deficiency',
    };

    const { error: activityError } = await supabase
      .from('activity_events')
      .insert(activityEvent);

    if (activityError) {
      console.error('Failed to create activity event:', activityError.message);
    }

    // Create notification (warning type)
    const notification = {
      id: generateNotificationId(),
      project_id: projectId,
      type: 'warning',
      title: 'New Deficiency Detected',
      message: `A deficiency has been detected at checkpoint "${checkpointName}". Corrective action required by ${body.deadline ? new Date(body.deadline).toLocaleDateString() : 'N/A'}.`,
      timestamp: new Date().toISOString(),
      read: false,
      link: `/checkpoints/${body.checkpointId}`,
    };

    const { error: notificationError } = await supabase
      .from('notifications')
      .insert(notification);

    if (notificationError) {
      console.error('Failed to create notification:', notificationError.message);
    }

    const deficiency = transformDeficiency(data);

    return NextResponse.json(deficiency, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Deficiencies POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create deficiency';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
