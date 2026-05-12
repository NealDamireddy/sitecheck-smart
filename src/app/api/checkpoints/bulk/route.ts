import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { checkpointBulk } from '@/lib/validations';
import { resolveProjectId, DEFAULT_PROJECT_ID } from '@/lib/project-context';


// Transform snake_case DB row to camelCase
function transformCheckpoint(row: Record<string, unknown>) {
  const result: Record<string, unknown> = {
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
    lastInspectionDate: row.last_inspection_date,
    lastInspectionPhoto: row.last_inspection_photo,
    previousPhoto: row.previous_photo,
    installDate: row.install_date,
    swpppPage: row.swppp_page,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.station_number != null || row.segment_id != null) {
    result.linearRef = {
      station: Number(row.station_number ?? 0),
      offset: Number(row.station_offset_feet ?? 0),
      segmentId: row.segment_id || undefined,
    };
  }
  if (row.station_label) {
    result.stationLabel = row.station_label;
  }
  return result;
}

// Transform camelCase request body to snake_case for DB
// Handles flat field aliases (e.g. stationNumber) AND nested linearRef object
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
    stationNumber: 'station_number',
    stationOffsetFeet: 'station_offset_feet',
    segmentId: 'segment_id',
    stationLabel: 'station_label',
  };

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'linearRef' && value && typeof value === 'object') {
      const ref = value as Record<string, unknown>;
      if (ref.station != null) result.station_number = ref.station;
      if (ref.offset != null) result.station_offset_feet = ref.offset;
      if (ref.segmentId) result.segment_id = ref.segmentId;
      continue;
    }
    const snakeKey = mapping[key] || key;
    result[snakeKey] = value;
  }
  return result;
}

// Generate unique ID
function generateId() {
  return `cp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Generate activity event ID
function generateActivityId() {
  return `act-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = checkpointBulk.parse(await request.json());

    if (!Array.isArray(body.checkpoints)) {
      return NextResponse.json(
        { error: 'Request body must contain a "checkpoints" array' },
        { status: 400 }
      );
    }

    const checkpoints = body.checkpoints as Record<string, unknown>[];
    const projectId = (body.projectId as string) || DEFAULT_PROJECT_ID;

    if (checkpoints.length === 0) {
      return NextResponse.json(
        { error: 'Checkpoints array cannot be empty' },
        { status: 400 }
      );
    }

    // Transform all checkpoints to snake_case for DB
    const dbCheckpoints = checkpoints.map((cp) => {
      const checkpointId = (cp.id as string) || generateId();
      return toSnakeCase({
        ...cp,
        id: checkpointId,
        projectId,
      });
    });

    // Insert all checkpoints
    const { data, error } = await supabase
      .from('checkpoints')
      .insert(dbCheckpoints)
      .select();

    if (error) {
      throw new Error(`Failed to create checkpoints: ${error.message}`);
    }

    // Create activity event
    const activityEvent = {
      id: generateActivityId(),
      project_id: projectId,
      type: 'document',
      title: 'Checkpoints Extracted',
      description: `${checkpoints.length} checkpoints extracted from SWPPP`,
      timestamp: new Date().toISOString(),
      severity: 'info',
      linked_entity_type: 'swppp',
    };

    const { error: activityError } = await supabase
      .from('activity_events')
      .insert(activityEvent);

    if (activityError) {
      console.error('Failed to create activity event:', activityError.message);
      // Don't fail the request, just log it
    }

    const createdCheckpoints = (data || []).map(transformCheckpoint);

    return NextResponse.json(
      {
        checkpoints: createdCheckpoints,
        count: createdCheckpoints.length,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Checkpoints bulk POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create checkpoints';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
