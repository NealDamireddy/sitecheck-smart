import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { log } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const idSchema = z.string().uuid();
const fileRoleSchema = z.enum([
  'source',
  'lab_result',
  'photo',
  'supporting_document',
]);
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);

function safeFilename(value: string) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 140);
  return normalized || 'upload';
}

function folderForRole(role: z.infer<typeof fileRoleSchema>) {
  if (role === 'source') return 'source';
  if (role === 'photo') return 'photo';
  return 'attachment';
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const siteRecordId = idSchema.parse(id);
    const formData = await request.formData();
    const file = formData.get('file');
    const fileRole = fileRoleSchema.parse(formData.get('fileRole'));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Choose a file to upload' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: 'Files must be between 1 byte and 50 MiB' },
        { status: 413 }
      );
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'This file type is not supported' },
        { status: 415 }
      );
    }

    const { data: record, error: recordError } = await auth.supabase
      .from('site_records')
      .select('id, org_id, project_id, inspector_user_id, record_type')
      .eq('id', siteRecordId)
      .maybeSingle();
    if (recordError || !record) {
      return NextResponse.json({ error: 'Field record not found' }, { status: 404 });
    }
    if (record.inspector_user_id !== auth.user.id) {
      return NextResponse.json(
        { error: 'Only the assigned inspector can add files to this record' },
        { status: 403 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const storedFilename = `${randomUUID()}-${safeFilename(file.name)}`;
    const storagePath = [
      record.org_id,
      record.inspector_user_id,
      record.project_id,
      record.record_type,
      record.id,
      folderForRole(fileRole),
      storedFilename,
    ].join('/');

    const { error: uploadError } = await auth.supabase.storage
      .from('inspection-records')
      .upload(storagePath, bytes, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) {
      log.error('Field record object upload failed', {
        siteRecordId,
        code: uploadError.name,
      });
      return NextResponse.json({ error: 'File upload failed' }, { status: 500 });
    }

    const { data: metadata, error: metadataError } = await auth.supabase
      .from('site_record_uploads')
      .insert({
        site_record_id: siteRecordId,
        project_id: record.project_id,
        uploaded_by: auth.user.id,
        file_role: fileRole,
        storage_bucket: 'inspection-records',
        storage_path: storagePath,
        original_filename: file.name,
        content_type: file.type,
        byte_size: file.size,
        sha256,
        upload_status: 'stored',
      })
      .select('id, created_at')
      .single();

    if (metadataError || !metadata) {
      // Storage and Postgres are separate services. Remove the exact object as
      // compensation if its immutable metadata cannot be registered.
      try {
        await auth.supabase.storage
          .from('inspection-records')
          .remove([storagePath]);
      } catch (cleanupError) {
        log.error('Orphaned field-record object cleanup failed', {
          siteRecordId,
          cleanupError,
        });
      }
      log.error('Field record upload metadata failed', {
        siteRecordId,
        code: metadataError?.code,
      });
      return NextResponse.json(
        { error: 'File could not be registered' },
        { status: 500 }
      );
    }

    const { data: signed } = await auth.supabase.storage
      .from('inspection-records')
      .createSignedUrl(storagePath, 600);

    return NextResponse.json(
      {
        upload: {
          id: metadata.id,
          fileRole,
          originalFilename: file.name,
          contentType: file.type,
          byteSize: file.size,
          sha256,
          uploadStatus: 'stored',
          createdAt: metadata.created_at,
          downloadUrl: signed?.signedUrl ?? null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 });
    }
    log.error('Field record upload failed', { error });
    return NextResponse.json({ error: 'File upload failed' }, { status: 500 });
  }
}
