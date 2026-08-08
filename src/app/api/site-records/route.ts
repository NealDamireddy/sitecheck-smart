import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import {
  createSiteRecord,
  SiteRecordCreateError,
} from '@/lib/site-records/create';
import { siteRecordCreate } from '@/lib/validations/site-record';
import { log } from '@/lib/logger';
import {
  directoryRecord,
  type SiteRecordDirectoryRow,
} from '@/lib/site-records/directory';

const ERROR_RESPONSES = {
  project_not_found: {
    status: 404,
    message: 'Site not found',
  },
  assignment_required: {
    status: 403,
    message: 'The inspector is not assigned to this site',
  },
  idempotency_conflict: {
    status: 409,
    message: 'The idempotency key belongs to a different site record',
  },
  closed_reporting_year: {
    status: 422,
    message: 'The SMARTS reporting year is closed',
  },
  future_reporting_year: {
    status: 422,
    message: 'The SMARTS reporting year is not open yet',
  },
  profile_required: {
    status: 403,
    message: 'Set up an active inspector profile before creating records',
  },
  migration_required: {
    status: 503,
    message: 'Site record storage is not available',
  },
  persistence_failed: {
    status: 500,
    message: 'Failed to create site record',
  },
} as const;

const projectIdSchema = z.string().trim().min(1).max(200);

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const projectId = projectIdSchema.parse(
      request.nextUrl.searchParams.get('projectId')
    );
    const { data, error } = await auth.supabase
      .from('site_record_directory')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') {
        return NextResponse.json(
          { error: 'Site record storage is not available' },
          { status: 503 }
        );
      }
      log.error('Site record directory query failed', {
        projectId,
        code: error.code,
      });
      return NextResponse.json(
        { error: 'Failed to load site records' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      records: ((data ?? []) as SiteRecordDirectoryRow[]).map(directoryRecord),
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }
    log.error('Site record GET failed', { error });
    return NextResponse.json(
      { error: 'Failed to load site records' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const input = siteRecordCreate.parse(await request.json());
    const result = await createSiteRecord(auth.supabase, input);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SiteRecordCreateError) {
      const response = ERROR_RESPONSES[error.code];
      return NextResponse.json(
        { error: response.message },
        { status: response.status }
      );
    }
    log.error('Site record POST failed', { error });
    return NextResponse.json(
      { error: 'Failed to create site record' },
      { status: 500 }
    );
  }
}
