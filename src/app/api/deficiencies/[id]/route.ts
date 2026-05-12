import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { deficiencyUpdate } from '@/lib/validations';
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

// Generate activity event ID
function generateActivityId() {
  return `act-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const { data, error } = await supabase
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
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Deficiency not found' }, { status: 404 });
      }
      throw new Error(`Failed to fetch deficiency: ${error.message}`);
    }

    const deficiency = transformDeficiency(data);

    return NextResponse.json(deficiency);
  } catch (error: unknown) {
    console.error('Deficiency GET error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch deficiency';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = deficiencyUpdate.parse(await request.json());

    // Get current deficiency to check for status change
    const { data: existing, error: existingError } = await supabase
      .from('deficiencies')
      .select(`
        *,
        checkpoints (
          id,
          name
        )
      `)
      .eq('id', id)
      .single();

    if (existingError) {
      if (existingError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Deficiency not found' }, { status: 404 });
      }
      throw new Error(`Failed to fetch existing deficiency: ${existingError.message}`);
    }

    const oldStatus = existing.status;
    const newStatus = body.status;
    const projectId = existing.project_id || DEFAULT_PROJECT_ID;

    // Transform to snake_case and add updated_at
    const dbData = toSnakeCase({
      ...body,
      updatedAt: new Date().toISOString(),
    });

    // Remove id and created_at from update data
    delete dbData.id;
    delete dbData.created_at;
    delete dbData.checkpoints; // Remove joined data if present

    // If status is changing to resolved, set resolved_date
    if (newStatus === 'resolved' && oldStatus !== 'resolved') {
      dbData.resolved_date = dbData.resolved_date || new Date().toISOString();
    }

    // Update deficiency
    const { data, error } = await supabase
      .from('deficiencies')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update deficiency: ${error.message}`);
    }

    // Create activity event if status changed to resolved
    if (newStatus === 'resolved' && oldStatus !== 'resolved') {
      const checkpointName = (existing.checkpoints as Record<string, unknown>)?.name || 'Unknown';
      const activityEvent = {
        id: generateActivityId(),
        project_id: projectId,
        type: 'deficiency',
        title: 'Deficiency Resolved',
        description: `Deficiency at checkpoint "${checkpointName}" has been resolved`,
        timestamp: new Date().toISOString(),
        severity: 'info',
        linked_entity_id: id,
        linked_entity_type: 'deficiency',
      };

      const { error: activityError } = await supabase
        .from('activity_events')
        .insert(activityEvent);

      if (activityError) {
        console.error('Failed to create activity event:', activityError.message);
      }
    }

    const deficiency = transformDeficiency(data);

    return NextResponse.json(deficiency);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Deficiency PUT error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update deficiency';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
