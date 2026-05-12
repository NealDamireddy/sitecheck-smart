import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { projectCreate } from '@/lib/validations';
import { project as riversideProject } from '@/data/project';
import { linearProject } from '@/data/linear-project';
import type { ProjectSegment } from '@/types/project';

function transformSegment(row: Record<string, unknown>): ProjectSegment {
  return {
    id: row.id as string,
    name: row.name as string,
    startStation: Number(row.start_station),
    endStation: Number(row.end_station),
    centerlineSlice: (row.centerline_slice as [number, number][] | null) ?? undefined,
  };
}

function transformProject(row: Record<string, unknown>, segments: ProjectSegment[] = []) {
  const project: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    address: row.address,
    permitNumber: row.permit_number,
    wdid: row.wdid,
    riskLevel: row.risk_level,
    qsp: {
      name: row.qsp_name,
      licenseNumber: row.qsp_license_number,
      company: row.qsp_company,
      phone: row.qsp_phone,
      email: row.qsp_email,
    },
    status: row.status,
    startDate: row.start_date,
    estimatedCompletion: row.estimated_completion,
    acreage: row.acreage,
    coordinates: { lat: row.center_lat, lng: row.center_lng },
    bounds: [
      [row.bounds_sw_lat, row.bounds_sw_lng],
      [row.bounds_ne_lat, row.bounds_ne_lng],
    ],
    projectType: row.project_type || 'bounded-site',
  };

  if (row.corridor_centerline) {
    project.corridor = {
      centerline: row.corridor_centerline,
      corridorWidthFeet: row.corridor_width_feet,
      totalLength: row.corridor_total_length,
      linearUnit: row.corridor_linear_unit || 'feet',
    };
  }

  if (row.linear_mileage) {
    project.linearMileage = row.linear_mileage;
  }

  if (segments.length > 0) {
    project.segments = segments;
  }

  if (row.row_left_boundary || row.row_right_boundary || row.row_width_feet) {
    project.rowBoundaries = {
      left: row.row_left_boundary || [],
      right: row.row_right_boundary || [],
      easementDescription: row.row_easement_description || undefined,
      widthFeet: row.row_width_feet ? Number(row.row_width_feet) : undefined,
    };
  }

  return project;
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('name');

    if (error) {
      throw new Error(`Failed to fetch projects: ${error.message}`);
    }

    if (data && data.length > 0) {
      // For each linear project, fetch its segments
      const projects = await Promise.all(
        data.map(async (row: Record<string, unknown>) => {
          let segments: ProjectSegment[] = [];
          if (row.project_type === 'linear') {
            const { data: segmentRows } = await supabase
              .from('project_segments')
              .select('*')
              .eq('project_id', row.id)
              .order('sort_order');
            if (segmentRows) {
              segments = segmentRows.map(transformSegment);
            }
          }
          return transformProject(row, segments);
        })
      );
      return NextResponse.json(projects);
    }

    // Fall back to static data if DB is empty
    return NextResponse.json([riversideProject, linearProject]);
  } catch {
    // Fall back to static data on error
    return NextResponse.json([riversideProject, linearProject]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = projectCreate.parse(await request.json());

    // Validate required fields
    if (!body.id || !body.name) {
      return NextResponse.json(
        { error: 'Missing required fields: id, name' },
        { status: 400 }
      );
    }

    // Validate linear projects have a centerline
    if (body.projectType === 'linear') {
      if (!body.corridor?.centerline || body.corridor.centerline.length < 2) {
        return NextResponse.json(
          { error: 'Linear projects require a centerline with at least 2 points' },
          { status: 400 }
        );
      }
    }

    const projectRow = {
      id: body.id,
      name: body.name,
      address: body.address || '',
      permit_number: body.permitNumber || '',
      wdid: body.wdid || '',
      risk_level: body.riskLevel || 2,
      qsp_name: body.qsp?.name || '',
      qsp_license_number: body.qsp?.licenseNumber || '',
      qsp_company: body.qsp?.company || '',
      qsp_phone: body.qsp?.phone || '',
      qsp_email: body.qsp?.email || '',
      status: body.status || 'active',
      start_date: body.startDate || new Date().toISOString().slice(0, 10),
      estimated_completion: body.estimatedCompletion || null,
      acreage: body.acreage || 0,
      center_lat: body.coordinates?.lat || 0,
      center_lng: body.coordinates?.lng || 0,
      bounds_sw_lat: body.bounds?.[0]?.[0] || 0,
      bounds_sw_lng: body.bounds?.[0]?.[1] || 0,
      bounds_ne_lat: body.bounds?.[1]?.[0] || 0,
      bounds_ne_lng: body.bounds?.[1]?.[1] || 0,
      project_type: body.projectType || 'bounded-site',
      corridor_centerline: body.corridor?.centerline || null,
      corridor_width_feet: body.corridor?.corridorWidthFeet || null,
      corridor_total_length: body.corridor?.totalLength || null,
      corridor_linear_unit: body.corridor?.linearUnit || null,
      linear_mileage: body.linearMileage || null,
      row_left_boundary: body.rowBoundaries?.left || null,
      row_right_boundary: body.rowBoundaries?.right || null,
      row_easement_description: body.rowBoundaries?.easementDescription || null,
      row_width_feet: body.rowBoundaries?.widthFeet || null,
    };

    const { data: insertedProject, error: projectError } = await supabase
      .from('projects')
      .insert(projectRow)
      .select()
      .single();

    if (projectError) {
      return NextResponse.json(
        { error: `Failed to create project: ${projectError.message}` },
        { status: 500 }
      );
    }

    // Insert segments if present
    if (body.segments && Array.isArray(body.segments) && body.segments.length > 0) {
      const segmentRows = body.segments.map((seg: { id?: string; name: string; startStation?: number; endStation?: number; centerlineSlice?: [number, number][] }, idx: number) => ({
        id: seg.id,
        project_id: body.id,
        name: seg.name,
        start_station: seg.startStation,
        end_station: seg.endStation,
        centerline_slice: seg.centerlineSlice || null,
        sort_order: idx,
      }));

      const { error: segmentError } = await supabase
        .from('project_segments')
        .insert(segmentRows);

      if (segmentError) {
        // Roll back project insert
        await supabase.from('projects').delete().eq('id', body.id);
        return NextResponse.json(
          { error: `Failed to create segments: ${segmentError.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(insertedProject, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: `Failed to create project: ${err instanceof Error ? err.message : 'unknown error'}` },
      { status: 500 }
    );
  }
}
