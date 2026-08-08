import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { log } from '@/lib/logger';
import {
  directoryRecord,
  type SiteRecordDirectoryRow,
} from '@/lib/site-records/directory';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const idSchema = z.string().uuid();

interface UploadRow {
  id: string;
  file_role: 'source' | 'lab_result' | 'photo' | 'supporting_document';
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  content_type: string;
  byte_size: number;
  sha256: string;
  upload_status: 'stored' | 'verified' | 'rejected' | 'quarantined';
  created_at: string;
}

interface StatusRow {
  id: number;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  changed_at: string;
  reason: string | null;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const siteRecordId = idSchema.parse(id);

    const { data: directory, error: directoryError } = await auth.supabase
      .from('site_record_directory')
      .select('*')
      .eq('site_record_id', siteRecordId)
      .maybeSingle();
    if (directoryError || !directory) {
      return NextResponse.json({ error: 'Field record not found' }, { status: 404 });
    }

    const [uploadsResult, historyResult, sourcesResult] = await Promise.all([
      auth.supabase
        .from('site_record_uploads')
        .select(
          'id, file_role, storage_bucket, storage_path, original_filename, content_type, byte_size, sha256, upload_status, created_at'
        )
        .eq('site_record_id', siteRecordId)
        .order('created_at', { ascending: false }),
      auth.supabase
        .from('site_record_status_history')
        .select('id, from_status, to_status, changed_by, changed_at, reason')
        .eq('site_record_id', siteRecordId)
        .order('changed_at', { ascending: false }),
      auth.supabase
        .from('site_record_sources')
        .select('id', { count: 'exact', head: true })
        .eq('site_record_id', siteRecordId),
    ]);

    if (uploadsResult.error || historyResult.error || sourcesResult.error) {
      log.error('Field record detail child query failed', {
        siteRecordId,
        uploadCode: uploadsResult.error?.code,
        historyCode: historyResult.error?.code,
        sourceCode: sourcesResult.error?.code,
      });
      return NextResponse.json(
        { error: 'Failed to load field record details' },
        { status: 500 }
      );
    }

    const uploads = await Promise.all(
      ((uploadsResult.data ?? []) as UploadRow[]).map(async (upload) => {
        const { data } = await auth.supabase.storage
          .from(upload.storage_bucket)
          .createSignedUrl(upload.storage_path, 600);
        return {
          id: upload.id,
          fileRole: upload.file_role,
          originalFilename: upload.original_filename,
          contentType: upload.content_type,
          byteSize: Number(upload.byte_size),
          sha256: upload.sha256,
          uploadStatus: upload.upload_status,
          createdAt: upload.created_at,
          downloadUrl: data?.signedUrl ?? null,
        };
      })
    );

    return NextResponse.json({
      record: directoryRecord(directory as SiteRecordDirectoryRow),
      uploads,
      statusHistory: ((historyResult.data ?? []) as StatusRow[]).map((row) => ({
        id: row.id,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        changedBy: row.changed_by,
        changedAt: row.changed_at,
        reason: row.reason,
      })),
      sourceCount: sourcesResult.count ?? 0,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid field record id' }, { status: 400 });
    }
    log.error('Field record detail GET failed', { error });
    return NextResponse.json(
      { error: 'Failed to load field record' },
      { status: 500 }
    );
  }
}
