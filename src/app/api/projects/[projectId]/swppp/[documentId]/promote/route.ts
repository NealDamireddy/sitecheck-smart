/**
 * Promote extracted BMP drafts into real checkpoints.
 *
 * THIS IS THE HUMAN-IN-THE-LOOP GATE for document ingestion. Extraction writes
 * `bmp_checkpoint_drafts` and stops there; nothing becomes a `checkpoint` — a
 * row the compliance product treats as real — until a QSP selects it here.
 * The invariant is the product's, not this route's: AI output is a draft,
 * never authority.
 *
 * Two consequences visible in the code below:
 *
 *   1. The caller names the draft ids to promote. There is no "promote all"
 *      shortcut that skips the review step.
 *   2. Position comes from the project, not the model. A SWPPP states which
 *      BMPs are required, rarely where they physically sit, and AI-01 was
 *      exactly the defect of inventing coordinates for a legal record. Drafts
 *      are placed on a ring around the project centre for the QSP to drag into
 *      place, which is what the existing SWPPP scan flow already does.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { log } from '@/lib/logger';
import { DB_BMP_TYPES } from '@/lib/cgp/bmp-types';

const promoteRequest = z.object({
  draftIds: z.array(z.number().int().positive()).min(1).max(500),
});

/** Metres, converted to degrees. Wide enough to be visibly placeable. */
const RING_RADIUS_DEG = 0.0015;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { projectId, documentId } = await params;

  let body: z.infer<typeof promoteRequest>;
  try {
    body = promoteRequest.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: 'Provide draftIds: a non-empty array of draft ids.' },
      { status: 400 }
    );
  }

  // The project supplies the centre AND proves access under RLS.
  const { data: project, error: projectErr } = await auth.supabase
    .from('projects')
    .select('id, center_lat, center_lng')
    .eq('id', projectId)
    .maybeSingle();
  if (projectErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Only drafts belonging to this document, and only ones not already
  // promoted — re-submitting the same selection must not duplicate rows.
  const { data: drafts, error: draftsErr } = await auth.supabase
    .from('bmp_checkpoint_drafts')
    .select('id, bmp_category, bmp_code, title, maintenance_threshold, promoted_checkpoint_id')
    .eq('document_id', documentId)
    .eq('project_id', projectId)
    .in('id', body.draftIds);

  if (draftsErr) {
    log.error('Could not load drafts for promotion', { documentId, err: draftsErr });
    return NextResponse.json({ error: 'Could not load drafts.' }, { status: 500 });
  }
  if (!drafts || drafts.length === 0) {
    return NextResponse.json({ error: 'No matching drafts found.' }, { status: 404 });
  }

  const pending = drafts.filter((d) => !d.promoted_checkpoint_id);
  if (pending.length === 0) {
    return NextResponse.json(
      { created: 0, skipped: drafts.length, message: 'Already promoted.' },
      { status: 200 }
    );
  }

  const centerLat = Number(project.center_lat);
  const centerLng = Number(project.center_lng);
  const placeable = Number.isFinite(centerLat) && Number.isFinite(centerLng);

  const now = new Date();
  const rows = pending.map((draft, index) => {
    // Ring placement, so promoted checkpoints don't stack on one pin.
    const angle = (2 * Math.PI * index) / pending.length;
    return {
      id: `cp-${documentId.slice(0, 8)}-${draft.id}`,
      project_id: projectId,
      name: `${draft.bmp_code} ${draft.title}`.trim(),
      bmp_type: draft.bmp_category,
      // A promoted draft has never been inspected, and the model does not get
      // to assert compliance — the QSP sets this with the Mark buttons.
      status: 'needs-review',
      priority: 'medium',
      zone: 'central',
      // The maintenance trigger is the single most useful thing the document
      // gives a field inspector, so it becomes the checkpoint's description.
      description: draft.maintenance_threshold ?? '',
      cgp_section: '',
      lat: placeable ? centerLat + RING_RADIUS_DEG * Math.cos(angle) : 0,
      lng: placeable ? centerLng + RING_RADIUS_DEG * Math.sin(angle) : 0,
      install_date: now.toISOString().slice(0, 10),
      swppp_page: 1,
    };
  });

  // Guard the enum at the boundary too: a draft row predating a CHECK change
  // would otherwise fail the insert with a raw database error (DRF-01).
  const invalid = rows.filter(
    (r) => !(DB_BMP_TYPES as readonly string[]).includes(r.bmp_type)
  );
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Unsupported BMP category on ${invalid.length} draft(s).` },
      { status: 422 }
    );
  }

  const { data: created, error: insertErr } = await auth.supabase
    .from('checkpoints')
    .insert(rows)
    .select('id');

  if (insertErr || !created) {
    log.error('Promoting drafts failed', { documentId, err: insertErr });
    return NextResponse.json(
      { error: 'Could not create checkpoints.' },
      { status: 500 }
    );
  }

  // Link each draft to the checkpoint it became, so the audit trail survives
  // and a second promote is a no-op rather than a duplicate.
  await Promise.all(
    pending.map((draft, index) =>
      auth.supabase
        .from('bmp_checkpoint_drafts')
        .update({
          promoted_checkpoint_id: created[index]?.id ?? null,
          reviewed_by: auth.user.id,
          reviewed_at: now.toISOString(),
        })
        .eq('id', draft.id)
    )
  );

  log.info('BMP drafts promoted to checkpoints', {
    projectId,
    documentId,
    created: created.length,
  });

  return NextResponse.json({
    created: created.length,
    skipped: drafts.length - pending.length,
    checkpointIds: created.map((c) => c.id),
    unplaced: !placeable,
  });
}
