/**
 * SWPPP documents for a project.
 *
 * POST — hand a PDF to the Python ingestion pipeline (layout-aware conversion
 *        + structured extraction). Returns 202; poll the document for status.
 * GET  — list this project's SWPPP documents.
 *
 * The browser never talks to the Python service. This route authenticates the
 * caller, proves project access through RLS, then forwards their JWT so the
 * service acts as them and its own writes are RLS-scoped too.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { swpppScanLimiter, rateLimitOrNull } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import {
  SwpppServiceError,
  ingestSwppp,
  isConfigured,
} from '@/lib/swppp-service';

/** Matches the Python service's own cap; rejected here to save the round trip. */
const MAX_PDF_BYTES = 50 * 1024 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { projectId } = await params;

  // Ingestion costs a model call; same limiter as the legacy scan route.
  const limited = rateLimitOrNull(swpppScanLimiter, auth.user.id, 'SWPPP scan');
  if (limited) return limited;

  // Prove access here as well as in the service. Belt and braces, but it also
  // means an unreachable service still cannot be used to probe for project ids.
  const { data: project, error: projectErr } = await auth.supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();
  if (projectErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (!isConfigured()) {
    return NextResponse.json(
      {
        error:
          'Document processing is not configured. Use the SWPPP scanner on the ' +
          'upload page instead.',
        fallback: '/swppp',
      },
      { status: 503 }
    );
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (file.type && !file.type.toLowerCase().includes('pdf')) {
    return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_PDF_BYTES / 1024 / 1024}MB)` },
      { status: 413 }
    );
  }

  // The service re-verifies this token and does its own RLS-scoped writes.
  const {
    data: { session },
  } = await auth.supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const accepted = await ingestSwppp(projectId, file, session.access_token);
    log.info('SWPPP queued for ingestion', {
      projectId,
      documentId: accepted.document_id,
      bytes: file.size,
    });
    return NextResponse.json(accepted, { status: 202 });
  } catch (err: unknown) {
    if (err instanceof SwpppServiceError) {
      return NextResponse.json(
        {
          error: err.message,
          ...(err.unreachable ? { fallback: '/swppp' } : {}),
        },
        { status: err.status }
      );
    }
    log.error('SWPPP ingestion failed', { projectId, err });
    return NextResponse.json(
      { error: 'Could not start document processing.' },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { projectId } = await params;

  // RLS alone would make this safe — a foreign project returns zero rows, so
  // the response is already indistinguishable from an empty one. But every
  // sibling route 404s on a project the caller cannot see, and an auth surface
  // where one route answers 200 and four answer 404 is where a real bug hides
  // later. Same shape everywhere, at the cost of one query.
  const { data: project } = await auth.supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Read straight from Postgres rather than through the service: RLS already
  // scopes this, and it keeps the document list working when the Python
  // service is down.
  const { data, error } = await auth.supabase
    .from('swppp_documents')
    .select(
      'id, filename, status, error_message, bmp_count, page_count, ' +
        'extracted_wdid, extracted_risk_level, extracted_qsp_name, uploaded_at'
    )
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: false });

  if (error) {
    log.error('Could not list SWPPP documents', { projectId, err: error });
    return NextResponse.json(
      { error: 'Could not load documents.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ documents: data ?? [] });
}
