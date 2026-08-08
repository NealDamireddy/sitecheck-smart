import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { z, ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { log } from '@/lib/logger';
import type { InspectorWorkspaceState } from '@/types/site-record';

const projectIdSchema = z.string().trim().min(1).max(200);
const setupSchema = z.object({
  projectId: projectIdSchema,
  displayName: z.string().trim().min(2).max(200),
  title: z.string().trim().max(200).optional(),
  licenseNumber: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(50).optional(),
});
const assignmentSchema = z.object({
  projectId: projectIdSchema,
  userId: z.string().uuid(),
  assignmentRole: z.enum(['lead', 'inspector', 'reviewer']),
  status: z.enum(['active', 'inactive']),
});

type MembershipRole = InspectorWorkspaceState['membershipRole'];

function canManage(role: MembershipRole) {
  return role === 'owner' || role === 'admin' || role === 'qsp';
}

async function loadWorkspace(
  supabase: SupabaseClient,
  user: User,
  projectId: string
): Promise<InspectorWorkspaceState | null> {
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name, org_id')
    .eq('id', projectId)
    .maybeSingle();
  if (projectError || !project) return null;

  const [{ data: company }, { data: membership }, { data: profile }, { data: assignment }] =
    await Promise.all([
      supabase
        .from('organizations')
        .select('name')
        .eq('id', project.org_id)
        .maybeSingle(),
      supabase
        .from('org_memberships')
        .select('role')
        .eq('org_id', project.org_id)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('inspector_profiles')
        .select('user_id, display_name, title, license_number, phone, status')
        .eq('org_id', project.org_id)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('project_inspector_assignments')
        .select('id, assignment_role, status, assigned_at, ended_at')
        .eq('org_id', project.org_id)
        .eq('project_id', projectId)
        .eq('inspector_user_id', user.id)
        .maybeSingle(),
    ]);

  if (!membership) return null;
  const membershipRole = membership.role as MembershipRole;
  const activeAssignment =
    assignment?.status === 'active' &&
    (!assignment.ended_at || new Date(assignment.ended_at) > new Date());

  let team: InspectorWorkspaceState['team'] = [];
  if (canManage(membershipRole)) {
    const [{ data: profiles }, { data: assignments }] = await Promise.all([
      supabase
        .from('inspector_profiles')
        .select('user_id, display_name, title, status')
        .eq('org_id', project.org_id)
        .order('display_name'),
      supabase
        .from('project_inspector_assignments')
        .select(
          'id, inspector_user_id, assignment_role, status, assigned_at, ended_at'
        )
        .eq('org_id', project.org_id)
        .eq('project_id', projectId),
    ]);
    const assignmentByUser = new Map(
      (assignments ?? []).map((row) => [row.inspector_user_id, row])
    );
    team = (profiles ?? []).map((row) => {
      const siteAssignment = assignmentByUser.get(row.user_id);
      return {
        userId: row.user_id,
        displayName: row.display_name,
        title: row.title,
        profileStatus: row.status,
        assignment: siteAssignment
          ? {
              id: siteAssignment.id,
              assignmentRole: siteAssignment.assignment_role,
              status: siteAssignment.status,
              assignedAt: siteAssignment.assigned_at,
              endedAt: siteAssignment.ended_at,
            }
          : null,
      };
    });
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      orgId: project.org_id,
      companyName: company?.name ?? 'Company',
    },
    membershipRole,
    canManageAssignments: canManage(membershipRole),
    profile: profile
      ? {
          userId: profile.user_id,
          displayName: profile.display_name,
          title: profile.title,
          licenseNumber: profile.license_number,
          phone: profile.phone,
          status: profile.status,
        }
      : null,
    assignment: assignment
      ? {
          id: assignment.id,
          assignmentRole: assignment.assignment_role,
          status: assignment.status,
          assignedAt: assignment.assigned_at,
          endedAt: assignment.ended_at,
        }
      : null,
    team,
    ready: profile?.status === 'active' && Boolean(activeAssignment),
  };
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const input = assignmentSchema.parse(await request.json());
    const current = await loadWorkspace(
      auth.supabase,
      auth.user,
      input.projectId
    );
    if (!current) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    if (!current.canManageAssignments) {
      return NextResponse.json(
        { error: 'Only an owner, administrator, or QSP can manage site assignments' },
        { status: 403 }
      );
    }

    const target = current.team.find((member) => member.userId === input.userId);
    if (!target || target.profileStatus !== 'active') {
      return NextResponse.json(
        { error: 'An active inspector profile is required' },
        { status: 422 }
      );
    }

    const { error: assignmentError } = await auth.supabase
      .from('project_inspector_assignments')
      .upsert(
        {
          org_id: current.project.orgId,
          project_id: input.projectId,
          inspector_user_id: input.userId,
          assignment_role: input.assignmentRole,
          status: input.status,
          assigned_by: auth.user.id,
          ended_at: input.status === 'inactive' ? new Date().toISOString() : null,
        },
        { onConflict: 'org_id,project_id,inspector_user_id' }
      );
    if (assignmentError) {
      log.error('Inspector assignment update failed', {
        code: assignmentError.code,
      });
      return NextResponse.json(
        { error: 'Failed to update site assignment' },
        { status: 500 }
      );
    }

    const workspace = await loadWorkspace(
      auth.supabase,
      auth.user,
      input.projectId
    );
    return NextResponse.json(workspace);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    log.error('Inspector workspace PATCH failed', { error });
    return NextResponse.json(
      { error: 'Failed to update site assignment' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const projectId = projectIdSchema.parse(
      request.nextUrl.searchParams.get('projectId')
    );
    const workspace = await loadWorkspace(
      auth.supabase,
      auth.user,
      projectId
    );
    if (!workspace) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    return NextResponse.json(workspace);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    log.error('Inspector workspace GET failed', { error });
    return NextResponse.json(
      { error: 'Failed to load inspector workspace' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const input = setupSchema.parse(await request.json());

    const current = await loadWorkspace(
      auth.supabase,
      auth.user,
      input.projectId
    );
    if (!current) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const { error: profileError } = await auth.supabase
      .from('inspector_profiles')
      .upsert(
        {
          org_id: current.project.orgId,
          user_id: auth.user.id,
          display_name: input.displayName,
          title: input.title || null,
          license_number: input.licenseNumber || null,
          phone: input.phone || null,
          status: 'active',
        },
        { onConflict: 'org_id,user_id' }
      );
    if (profileError) {
      log.error('Inspector profile setup failed', { code: profileError.code });
      return NextResponse.json(
        { error: 'Failed to save inspector profile' },
        { status: 500 }
      );
    }

    if (!current.assignment && !current.canManageAssignments) {
      return NextResponse.json(
        {
          error:
            'Your profile is saved. An owner, administrator, or QSP must assign you to this site.',
          code: 'ASSIGNMENT_REQUIRES_MANAGER',
        },
        { status: 403 }
      );
    }

    if (current.canManageAssignments) {
      const { error: assignmentError } = await auth.supabase
        .from('project_inspector_assignments')
        .upsert(
          {
            org_id: current.project.orgId,
            project_id: input.projectId,
            inspector_user_id: auth.user.id,
            assignment_role: current.membershipRole === 'qsp' ? 'lead' : 'inspector',
            status: 'active',
            assigned_by: auth.user.id,
            ended_at: null,
          },
          { onConflict: 'org_id,project_id,inspector_user_id' }
        );
      if (assignmentError) {
        log.error('Inspector assignment setup failed', {
          code: assignmentError.code,
        });
        return NextResponse.json(
          { error: 'Profile saved, but site assignment failed' },
          { status: 500 }
        );
      }
    }

    const workspace = await loadWorkspace(
      auth.supabase,
      auth.user,
      input.projectId
    );
    return NextResponse.json(workspace, { status: current.ready ? 200 : 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    log.error('Inspector workspace POST failed', { error });
    return NextResponse.json(
      { error: 'Failed to configure inspector workspace' },
      { status: 500 }
    );
  }
}
