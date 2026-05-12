import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { resolveProjectId, DEFAULT_PROJECT_ID } from '@/lib/project-context';
import { linearCrossings } from '@/data/linear-crossings';
import { linearPermits } from '@/data/linear-permits';
import { deriveLivePermitStatus } from '@/types/permit';


export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId') || DEFAULT_PROJECT_ID;

    // Query project to determine type and corridor data
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, project_type, linear_mileage, corridor_total_length, acreage')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError) {
      console.error('Failed to fetch project:', projectError.message);
    }

    const isLinear = project?.project_type === 'linear';
    const corridorLengthFeet = project?.corridor_total_length
      ? Number(project.corridor_total_length)
      : null;
    const corridorLengthMiles = project?.linear_mileage
      ? Number(project.linear_mileage)
      : corridorLengthFeet
        ? corridorLengthFeet / 5280
        : null;

    // Query checkpoints: count total and count by status
    const { data: checkpoints, error: checkpointsError } = await supabase
      .from('checkpoints')
      .select('id, status')
      .eq('project_id', projectId);

    if (checkpointsError) {
      throw new Error(`Failed to fetch checkpoints: ${checkpointsError.message}`);
    }

    const totalCheckpoints = checkpoints?.length || 0;
    const compliantCount = checkpoints?.filter((cp) => cp.status === 'compliant').length || 0;
    const deficientCount = checkpoints?.filter((cp) => cp.status === 'deficient').length || 0;
    const needsReviewCount = checkpoints?.filter((cp) => cp.status === 'needs-review').length || 0;
    const complianceRate = totalCheckpoints > 0
      ? Math.round((compliantCount / totalCheckpoints) * 100)
      : 0;

    // Query deficiencies: count where status != 'resolved'
    const { data: deficiencies, error: deficienciesError } = await supabase
      .from('deficiencies')
      .select('id')
      .eq('project_id', projectId)
      .neq('status', 'resolved');

    if (deficienciesError) {
      throw new Error(`Failed to fetch deficiencies: ${deficienciesError.message}`);
    }

    const activeDeficiencies = deficiencies?.length || 0;

    // Query inspections: get most recent inspection
    const { data: inspections, error: inspectionsError } = await supabase
      .from('inspections')
      .select('id, date, type')
      .eq('project_id', projectId)
      .order('date', { ascending: false })
      .limit(1);

    if (inspectionsError) {
      throw new Error(`Failed to fetch inspections: ${inspectionsError.message}`);
    }

    let daysSinceInspection: number | null = null;
    let lastInspectionType: string | null = null;
    let lastInspectionDate: string | null = null;

    if (inspections && inspections.length > 0) {
      const lastInspection = inspections[0];
      lastInspectionDate = lastInspection.date;
      lastInspectionType = lastInspection.type;

      const inspectionDate = new Date(lastInspection.date);
      const today = new Date();
      const diffTime = Math.abs(today.getTime() - inspectionDate.getTime());
      daysSinceInspection = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    // Linear-only metrics: crossings count + permit status counts
    let crossingsCount = 0;
    let permitsActive = 0;
    let permitsExpiring = 0;
    let permitsExpired = 0;

    if (isLinear) {
      // Crossings count (DB first, mock fallback)
      try {
        const { data: crossings, error: crossingsError } = await supabase
          .from('crossings')
          .select('id')
          .eq('project_id', projectId);

        if (crossingsError) throw crossingsError;
        crossingsCount = crossings?.length ?? 0;
      } catch {
        crossingsCount = linearCrossings.filter((c) => c.projectId === projectId).length;
      }

      // Permit status counts (DB first, mock fallback)
      type PermitRow = { id: string; status: string; expiration_date: string | null };
      try {
        const { data: permits, error: permitsError } = await supabase
          .from('segment_permits')
          .select('id, status, expiration_date')
          .eq('project_id', projectId);

        if (permitsError) throw permitsError;
        for (const p of (permits ?? []) as PermitRow[]) {
          const live = deriveLivePermitStatus({
            id: p.id,
            projectId,
            permitType: '',
            status: p.status as 'active',
            expirationDate: p.expiration_date ?? undefined,
          });
          if (live === 'active') permitsActive++;
          else if (live === 'expiring') permitsExpiring++;
          else if (live === 'expired') permitsExpired++;
        }
      } catch {
        for (const p of linearPermits.filter((m) => m.projectId === projectId)) {
          const live = deriveLivePermitStatus(p);
          if (live === 'active') permitsActive++;
          else if (live === 'expiring') permitsExpiring++;
          else if (live === 'expired') permitsExpired++;
        }
      }
    }

    return NextResponse.json({
      totalCheckpoints,
      complianceRate,
      daysSinceInspection,
      lastInspectionType,
      lastInspectionDate,
      activeDeficiencies,
      checkpointsByStatus: {
        compliant: compliantCount,
        deficient: deficientCount,
        needsReview: needsReviewCount,
      },
      // Project-type-aware fields
      isLinear,
      corridorLengthFeet,
      corridorLengthMiles,
      acreage: project?.acreage ? Number(project.acreage) : null,
      crossingsCount,
      permits: {
        active: permitsActive,
        expiring: permitsExpiring,
        expired: permitsExpired,
        total: permitsActive + permitsExpiring + permitsExpired,
      },
    });
  } catch (error: unknown) {
    console.error('Dashboard metrics error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch dashboard metrics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
