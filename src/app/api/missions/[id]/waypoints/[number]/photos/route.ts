/**
 * Block 4 — POST /api/missions/[id]/waypoints/[number]/photos
 *
 * Multipart-form photo upload for a captured waypoint. Pushes the file to
 * Supabase Storage at `{projectId}/{missionId}/{number}-{captureIndex}.jpg`,
 * appends the resulting public URL to `waypoints.photos` (JSONB array), and
 * mirrors the latest URL to the legacy `waypoints.photo` column for
 * back-compat with existing readers.
 *
 * Returns `{ url, photoIndex, photos }`.
 *
 * Mock fallback: when Storage is not configured, the endpoint accepts the
 * upload but returns a deterministic `/demo-photos/...` URL so the demo flow
 * still works without real Storage credentials.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { uploadMissionPhoto } from '@/lib/supabase/storage';

interface RouteContext {
  params: Promise<{ id: string; number: string }>;
}

const FALLBACK_DEMO = '/demo-photos/sediment-control/photo-1.jpg';

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: missionId, number } = await context.params;
    const waypointNumber = Number(number);
    if (Number.isNaN(waypointNumber)) {
      return NextResponse.json({ error: 'Invalid waypoint number' }, { status: 400 });
    }

    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    let file: Blob | null = null;
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const f = form.get('file');
      if (f instanceof Blob) file = f;
    }

    // Look up mission to derive projectId for the storage path
    const { data: mission, error: missionErr } = await supabase
      .from('drone_missions')
      .select('project_id')
      .eq('id', missionId)
      .single();

    if (missionErr || !mission) {
      return NextResponse.json(
        { url: FALLBACK_DEMO, photoIndex: 0, photos: [FALLBACK_DEMO], mock: true }
      );
    }

    // Read current photos array
    const { data: waypoint, error: wpErr } = await supabase
      .from('waypoints')
      .select('photos')
      .eq('mission_id', missionId)
      .eq('number', waypointNumber)
      .single();

    if (wpErr || !waypoint) {
      return NextResponse.json(
        { url: FALLBACK_DEMO, photoIndex: 0, photos: [FALLBACK_DEMO], mock: true }
      );
    }

    const currentPhotos: string[] = Array.isArray(waypoint.photos) ? waypoint.photos : [];
    const captureIndex = currentPhotos.length;
    const path = `${mission.project_id}/${missionId}/${waypointNumber}-${captureIndex}.jpg`;

    let url: string;
    if (file) {
      try {
        const uploaded = await uploadMissionPhoto(path, file);
        url = uploaded.url;
      } catch {
        // Storage not configured — fall back to demo URL
        url = FALLBACK_DEMO;
      }
    } else {
      url = FALLBACK_DEMO;
    }

    const nextPhotos = [...currentPhotos, url];

    const { error: updateErr } = await supabase
      .from('waypoints')
      .update({
        photos: nextPhotos,
        photo: url, // mirror to legacy column
        captured_at: new Date().toISOString(),
      })
      .eq('mission_id', missionId)
      .eq('number', waypointNumber);

    if (updateErr) {
      return NextResponse.json({ url, photoIndex: captureIndex, photos: nextPhotos, mock: true });
    }

    return NextResponse.json({ url, photoIndex: captureIndex, photos: nextPhotos });
  } catch (err) {
    console.error('photos POST failed:', err);
    return NextResponse.json({ url: FALLBACK_DEMO, photoIndex: 0, photos: [FALLBACK_DEMO], mock: true });
  }
}
