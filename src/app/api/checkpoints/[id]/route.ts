import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { checkpointUpdate } from '@/lib/validations';
import { resolveProjectId, DEFAULT_PROJECT_ID } from '@/lib/project-context';


// Transform snake_case DB row to camelCase
function transformCheckpoint(row: Record<string, unknown>) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    bmpType: row.bmp_type,
    status: row.status,
    priority: row.priority,
    zone: row.zone,
    description: row.description,
    cgpSection: row.cgp_section,
    lat: row.lat,
    lng: row.lng,
    location: { lat: row.lat, lng: row.lng },
    lastInspectionDate: row.last_inspection_date,
    lastInspectionPhoto: row.last_inspection_photo,
    previousPhoto: row.previous_photo,
    installDate: row.install_date,
    swpppPage: row.swppp_page,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function transformAnalysis(row: Record<string, unknown>) {
  return {
    id: row.id,
    checkpointId: row.checkpoint_id,
    summary: row.summary,
    status: row.status,
    confidence: row.confidence,
    details: row.details,
    cgpReference: row.cgp_reference,
    recommendations: row.recommendations,
    createdAt: row.created_at,
  };
}

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
  };
}

// Transform camelCase request body to snake_case for DB
function toSnakeCase(data: Record<string, unknown>) {
  const mapping: Record<string, string> = {
    projectId: 'project_id',
    bmpType: 'bmp_type',
    cgpSection: 'cgp_section',
    lastInspectionDate: 'last_inspection_date',
    lastInspectionPhoto: 'last_inspection_photo',
    previousPhoto: 'previous_photo',
    installDate: 'install_date',
    swpppPage: 'swppp_page',
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

    // Fetch checkpoint
    const { data: checkpoint, error: checkpointError } = await supabase
      .from('checkpoints')
      .select('*')
      .eq('id', id)
      .single();

    if (checkpointError) {
      if (checkpointError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 });
      }
      throw new Error(`Failed to fetch checkpoint: ${checkpointError.message}`);
    }

    // Fetch latest AI analysis for this checkpoint
    const { data: analyses, error: analysisError } = await supabase
      .from('ai_analyses')
      .select('*')
      .eq('checkpoint_id', id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (analysisError) {
      console.error('Failed to fetch analysis:', analysisError.message);
    }

    // Fetch deficiencies for this checkpoint
    const { data: deficiencies, error: deficienciesError } = await supabase
      .from('deficiencies')
      .select('*')
      .eq('checkpoint_id', id)
      .order('detected_date', { ascending: false });

    if (deficienciesError) {
      console.error('Failed to fetch deficiencies:', deficienciesError.message);
    }

    const result = {
      ...transformCheckpoint(checkpoint),
      analysis: analyses && analyses.length > 0 ? transformAnalysis(analyses[0]) : null,
      deficiencies: (deficiencies || []).map(transformDeficiency),
    };

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Checkpoint GET error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch checkpoint';
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
    const body = checkpointUpdate.parse(await request.json());

    // Get current checkpoint to check for status change
    const { data: existing, error: existingError } = await supabase
      .from('checkpoints')
      .select('status, name, project_id')
      .eq('id', id)
      .single();

    if (existingError) {
      if (existingError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 });
      }
      throw new Error(`Failed to fetch existing checkpoint: ${existingError.message}`);
    }

    const oldStatus = existing.status;
    const newStatus = body.status;
    const projectId = existing.project_id || DEFAULT_PROJECT_ID;

    // Transform to snake_case and add updated_at
    const dbData = toSnakeCase({
      ...body,
      updatedAt: new Date().toISOString(),
    });

    // Remove id from update data if present
    delete dbData.id;
    delete dbData.created_at;

    // Update checkpoint
    const { data, error } = await supabase
      .from('checkpoints')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update checkpoint: ${error.message}`);
    }

    // Create activity event if status changed
    if (newStatus && newStatus !== oldStatus) {
      const activityEvent = {
        id: generateActivityId(),
        project_id: projectId,
        type: 'inspection',
        title: 'Checkpoint Status Updated',
        description: `Checkpoint "${existing.name}" status changed from ${oldStatus} to ${newStatus}`,
        timestamp: new Date().toISOString(),
        severity: newStatus === 'deficient' ? 'warning' : 'info',
        linked_entity_id: id,
        linked_entity_type: 'checkpoint',
      };

      const { error: activityError } = await supabase
        .from('activity_events')
        .insert(activityEvent);

      if (activityError) {
        console.error('Failed to create activity event:', activityError.message);
      }
    }

    const checkpoint = transformCheckpoint(data);

    return NextResponse.json(checkpoint);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Checkpoint PUT error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update checkpoint';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    // Check if checkpoint exists
    const { data: existing, error: existingError } = await supabase
      .from('checkpoints')
      .select('id')
      .eq('id', id)
      .single();

    if (existingError) {
      if (existingError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 });
      }
      throw new Error(`Failed to fetch checkpoint: ${existingError.message}`);
    }

    // Delete checkpoint (cascades to related records due to DB constraints)
    const { error } = await supabase
      .from('checkpoints')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete checkpoint: ${error.message}`);
    }

    return NextResponse.json({ success: true, id });
  } catch (error: unknown) {
    console.error('Checkpoint DELETE error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete checkpoint';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
