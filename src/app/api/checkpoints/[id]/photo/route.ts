/**
 * POST /api/checkpoints/[id]/photo
 *
 * Multipart upload of a QSP field photo for a single checkpoint. Stores the
 * file in the `checkpoint-photos` Supabase Storage bucket and writes the
 * resulting public URL + timestamp to the checkpoint row.
 *
 * Body (multipart/form-data):
 *   * `file`  — required, image/jpeg|png|webp|heic, max 5 MiB
 *
 * Returns: 200 { qspPhotoUrl, qspPhotoUploadedAt }
 *
 * The drone-view photo at `last_inspection_photo` is NEVER touched — the
 * checkpoint detail UI shows a toggle so the QSP can flip between the two.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { uploadCheckpointPhoto } from '@/lib/supabase/storage';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MiB
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);

function extFor(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
      return 'heic';
    default:
      return 'bin';
  }
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: checkpointId } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    // Confirm the checkpoint exists and the caller can see it (RLS).
    const { data: existing, error: lookupError } = await supabase
      .from('checkpoints')
      .select('id, project_id')
      .eq('id', checkpointId)
      .single();
    if (lookupError) {
      if (lookupError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Checkpoint not found' },
          { status: 404 },
        );
      }
      throw new Error(`Failed to fetch checkpoint: ${lookupError.message}`);
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'Missing "file" field in form data' },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json(
        { error: 'Uploaded file is empty' },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File exceeds 5 MiB (${Math.round(file.size / 1024)} KiB)` },
        { status: 413 },
      );
    }
    const mime = file.type || 'application/octet-stream';
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        { error: `Unsupported MIME type: ${mime}` },
        { status: 415 },
      );
    }

    const now = new Date();
    const path = `${existing.project_id}/${checkpointId}/${now.getTime()}.${extFor(mime)}`;
    const { url } = await uploadCheckpointPhoto(path, file, mime);

    const { data: updated, error: updateError } = await supabase
      .from('checkpoints')
      .update({
        qsp_photo_url: url,
        qsp_photo_uploaded_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', checkpointId)
      .select('qsp_photo_url, qsp_photo_uploaded_at')
      .single();
    if (updateError || !updated) {
      throw new Error(
        updateError?.message ?? 'Photo uploaded but checkpoint row update returned no row',
      );
    }

    return NextResponse.json({
      qspPhotoUrl: updated.qsp_photo_url,
      qspPhotoUploadedAt: updated.qsp_photo_uploaded_at,
    });
  } catch (err: unknown) {
    console.error('Checkpoint photo upload error:', err);
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to upload checkpoint photo' }, { status: 500 });
  }
}
