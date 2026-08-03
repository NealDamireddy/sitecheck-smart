/**
 * One SWPPP document: status while it processes, and its extracted BMP drafts.
 *
 * Read directly from Postgres rather than proxied to the Python service. RLS
 * already scopes both tables to the caller, and reading here means the status
 * poll and the draft review keep working even when the service is down —
 * only ingestion actually needs it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { log } from '@/lib/logger';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { projectId, documentId } = await params;

  const { data: document, error } = await auth.supabase
    .from('swppp_documents')
    .select(
      'id, filename, status, error_message, bmp_count, page_count, pdf_backend, ' +
        'extracted_wdid, extracted_risk_level, extracted_qsp_name, uploaded_at'
    )
    .eq('id', documentId)
    .eq('project_id', projectId)
    .maybeSingle();

  // 404, not 403: a 403 would confirm the document exists in another tenant.
  if (error || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const { data: drafts, error: draftsErr } = await auth.supabase
    .from('bmp_checkpoint_drafts')
    .select(
      'id, bmp_category, bmp_code, title, required_locations, ' +
        'inspection_frequency, maintenance_threshold, promoted_checkpoint_id'
    )
    .eq('document_id', documentId)
    .eq('is_active', true)
    .order('bmp_code');

  if (draftsErr) {
    log.error('Could not load BMP drafts', { documentId, err: draftsErr });
    return NextResponse.json(
      { error: 'Could not load extracted BMPs.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ document, drafts: drafts ?? [] });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { projectId, documentId } = await params;

  // Scope the delete by project as well as id. RLS would refuse a foreign row
  // anyway, but this makes the intent explicit and the zero-row case checkable.
  const { data, error } = await auth.supabase
    .from('swppp_documents')
    .delete()
    .eq('id', documentId)
    .eq('project_id', projectId)
    .select('id');

  if (error) {
    log.error('Could not delete SWPPP document', { documentId, err: error });
    return NextResponse.json({ error: 'Could not delete.' }, { status: 500 });
  }
  // SEC-14: never report success for a delete that affected nothing.
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
