/**
 * Block 4 — Supabase Storage helper for mission photos.
 *
 * Path convention: `{projectId}/{missionId}/{waypointNumber}-{captureIndex}.jpg`.
 *
 * The bucket `mission-photos` must be created manually in the Supabase Storage
 * UI (public read for the demo, service role for writes). Migration 006 ships
 * a leading comment documenting that prerequisite.
 *
 * All helpers degrade gracefully when `SUPABASE_SERVICE_ROLE_KEY` /
 * `NEXT_PUBLIC_SUPABASE_URL` are missing — they return the input URL unchanged
 * so the demo continues to render bundled `/public/demo-photos/*` images.
 */

import { createAdminClient } from './server';

export const MISSION_PHOTOS_BUCKET = 'mission-photos';

function isStorageConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Upload a Blob/File to mission-photos at the given path. Returns the public
 * URL of the uploaded object. Falls back to a thrown error if Storage is not
 * configured (callers should catch and substitute the original local URL).
 */
export async function uploadMissionPhoto(
  path: string,
  file: Blob,
  contentType = 'image/jpeg'
): Promise<{ url: string; path: string }> {
  if (!isStorageConfigured()) {
    throw new Error('Supabase Storage not configured');
  }
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(MISSION_PHOTOS_BUCKET)
    .upload(path, file, {
      contentType,
      upsert: true,
      cacheControl: '3600',
    });
  if (error) {
    throw new Error(`mission-photos upload failed: ${error.message}`);
  }
  const { data } = supabase.storage
    .from(MISSION_PHOTOS_BUCKET)
    .getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Generate a short-lived signed URL for a stored photo. Useful when the bucket
 * is configured private. Returns the path on failure so callers can fall back
 * to a public URL or the original local file.
 */
export async function getSignedPhotoUrl(
  path: string,
  expiresInSec = 3600
): Promise<string> {
  if (!isStorageConfigured()) return path;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from(MISSION_PHOTOS_BUCKET)
      .createSignedUrl(path, expiresInSec);
    if (error || !data?.signedUrl) return path;
    return data.signedUrl;
  } catch {
    return path;
  }
}

/**
 * Delete a stored photo. No-op when Storage is not configured.
 */
export async function deleteMissionPhoto(path: string): Promise<void> {
  if (!isStorageConfigured()) return;
  try {
    const supabase = createAdminClient();
    await supabase.storage.from(MISSION_PHOTOS_BUCKET).remove([path]);
  } catch {
    // best-effort
  }
}

/**
 * Re-host a bundled `/public/demo-photos/*` image into Supabase Storage so
 * the demo flow exercises the production upload pipeline end-to-end.
 *
 * Returns the new public URL on success, or the original `localPublicUrl`
 * on any failure (Storage missing, fetch failed, upload failed).
 *
 * The `localPublicUrl` may be either a full origin URL (server-side fetch)
 * or a relative `/demo-photos/...` path (in which case `originBase` must
 * be supplied so server code can construct an absolute URL).
 */
export async function rehostDemoPhoto(
  localPublicUrl: string,
  targetPath: string,
  originBase?: string
): Promise<string> {
  if (!isStorageConfigured()) return localPublicUrl;
  try {
    const absolute = localPublicUrl.startsWith('http')
      ? localPublicUrl
      : `${(originBase ?? '').replace(/\/$/, '')}${localPublicUrl}`;
    if (!absolute.startsWith('http')) return localPublicUrl;
    const res = await fetch(absolute);
    if (!res.ok) return localPublicUrl;
    const blob = await res.blob();
    const { url } = await uploadMissionPhoto(targetPath, blob, blob.type || 'image/jpeg');
    return url;
  } catch {
    return localPublicUrl;
  }
}
